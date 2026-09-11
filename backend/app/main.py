from datetime import datetime, timedelta
from math import cos, radians, sqrt
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Hazard


# =========================================================
# DATABASE + LIGHTWEIGHT MIGRATIONS
# =========================================================

Base.metadata.create_all(bind=engine)

MIGRATIONS = {
    "verification_status": "VARCHAR",
    "verification_confidence": "FLOAT",
    "observation_count": "INTEGER",
    "exposure_score": "FLOAT",
    "exposure_label": "VARCHAR",
    "work_order_match": "VARCHAR",
    "work_order_id": "VARCHAR",
    "image_filename": "VARCHAR",
    "resolution_note": "TEXT",
    "resolution_proof": "VARCHAR",
    "expires_at": "DATETIME",
}

with engine.connect() as connection:
    existing_columns = connection.execute(text("PRAGMA table_info(hazards)")).fetchall()
    column_names = [column[1] for column in existing_columns]

    legacy_columns = {
        "assigned_team": "VARCHAR",
        "assigned_at": "DATETIME",
        "resolved_at": "DATETIME",
    }
    for name, column_type in {**legacy_columns, **MIGRATIONS}.items():
        if name not in column_names:
            connection.execute(text(f"ALTER TABLE hazards ADD COLUMN {name} {column_type}"))
    connection.commit()


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="HazardPulse API",
    description="Real-time temporary public safety hazard intelligence platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Demo-only weather override. Real weather is used when disabled.
demo_weather = {"enabled": False, "rain": 0.0}

WEATHER_LABELS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle",
    53: "Moderate drizzle", 55: "Dense drizzle", 61: "Slight rain",
    63: "Moderate rain", 65: "Heavy rain", 66: "Freezing rain",
    67: "Heavy freezing rain", 71: "Slight snow", 73: "Moderate snow",
    75: "Heavy snow", 80: "Slight rain showers", 81: "Moderate rain showers",
    82: "Violent rain showers", 95: "Thunderstorm", 96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
}

# Prototype GIS exposure layer. These are illustrative public-safety POIs for the demo city.
EXPOSURE_POINTS = [
    {"name": "Central School Zone", "kind": "School", "latitude": 18.5238, "longitude": 73.8552, "weight": 28},
    {"name": "Shivajinagar Bus Hub", "kind": "Bus Stop", "latitude": 18.5314, "longitude": 73.8477, "weight": 24},
    {"name": "City Hospital Zone", "kind": "Hospital", "latitude": 18.5135, "longitude": 73.8560, "weight": 22},
    {"name": "Main Road Corridor", "kind": "Busy Road", "latitude": 18.5198, "longitude": 73.8580, "weight": 18},
    {"name": "Market Pedestrian Zone", "kind": "High Footfall", "latitude": 18.5209, "longitude": 73.8554, "weight": 16},
]

WORK_ORDERS = [
    {"id": "WO-1042", "type": "OPEN_MANHOLE", "latitude": 18.5207, "longitude": 73.8569, "title": "Drainage maintenance — manhole"},
    {"id": "WO-1087", "type": "ROAD_EXCAVATION", "latitude": 18.5188, "longitude": 73.8547, "title": "Road repair excavation"},
    {"id": "WO-1119", "type": "WATERLOGGING", "latitude": 18.5222, "longitude": 73.8583, "title": "Storm-water inspection"},
    {"id": "WO-1164", "type": "FALLEN_TREE", "latitude": 18.5175, "longitude": 73.8517, "title": "Tree obstruction removal"},
]

BASE_SCORES = {
    "OPEN_MANHOLE": 75,
    "ROAD_EXCAVATION": 65,
    "WATERLOGGING": 80,
    "FALLEN_TREE": 70,
}

TEAM_MAP = {
    "OPEN_MANHOLE": "Drainage Team",
    "ROAD_EXCAVATION": "Road Safety Team",
    "WATERLOGGING": "Drainage Team",
    "FALLEN_TREE": "Tree Removal Team",
}


# =========================================================
# SCHEMAS
# =========================================================

class HazardCreate(BaseModel):
    type: str
    latitude: float
    longitude: float
    description: str | None = None
    image_filename: str | None = None
    verification_confidence: float | None = None


class AssignTeam(BaseModel):
    team: str


class StatusUpdate(BaseModel):
    status: str
    resolution_note: str | None = None
    resolution_proof: str | None = None


class DemoWeatherUpdate(BaseModel):
    enabled: bool
    rain: float = 8.0


# =========================================================
# INTELLIGENCE HELPERS
# =========================================================

def distance_km(lat1, lon1, lat2, lon2):
    # Good enough for a small city-level prototype.
    dy = (lat2 - lat1) * 111.0
    dx = (lon2 - lon1) * 111.0 * cos(radians((lat1 + lat2) / 2))
    return sqrt(dx * dx + dy * dy)


def exposure_context(latitude: float, longitude: float):
    nearby = []
    score = 0.0

    for point in EXPOSURE_POINTS:
        distance = distance_km(latitude, longitude, point["latitude"], point["longitude"])
        if distance <= 0.35:
            proximity_factor = max(0.15, 1 - (distance / 0.35))
            contribution = point["weight"] * proximity_factor
            score += contribution
            nearby.append({
                "name": point["name"],
                "kind": point["kind"],
                "distance_km": round(distance, 3),
                "contribution": round(contribution, 1),
            })

    score = min(40, round(score, 1))
    label = "HIGH" if score >= 24 else "MEDIUM" if score >= 10 else "LOW"
    nearby.sort(key=lambda item: item["distance_km"])
    return score, label, nearby[:3]


def match_work_order(hazard_type: str, latitude: float, longitude: float):
    matches = [
        work_order for work_order in WORK_ORDERS
        if work_order["type"] == hazard_type
        and distance_km(latitude, longitude, work_order["latitude"], work_order["longitude"]) <= 0.20
    ]
    if not matches:
        return None
    match = min(matches, key=lambda item: distance_km(latitude, longitude, item["latitude"], item["longitude"]))
    return match


def weather_bonus(rain: float, weather_code: int = 0):
    if rain >= 5 or weather_code >= 95:
        return 20
    if rain >= 2 or weather_code >= 80:
        return 15
    if rain > 0 or weather_code >= 51:
        return 10
    return 0


def calculate_risk(hazard_type: str, exposure_score: float = 0, confidence: float = 90, observations: int = 1, rain: float = 0, weather_code: int = 0):
    base = BASE_SCORES.get(hazard_type.upper(), 50)
    exposure_bonus = min(15, round(exposure_score * 0.38, 1))
    confidence_bonus = 3 if confidence >= 90 else 1 if confidence >= 75 else 0
    observation_bonus = min(7, max(0, observations - 1) * 1.5)
    score = min(100, round(base + exposure_bonus + confidence_bonus + observation_bonus + weather_bonus(rain, weather_code)))

    if score >= 85:
        level = "CRITICAL"
    elif score >= 70:
        level = "HIGH"
    elif score >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"
    return score, level


def serialize_hazard(hazard: Hazard):
    exposure = exposure_context(hazard.latitude, hazard.longitude)
    match = match_work_order(hazard.type, hazard.latitude, hazard.longitude)
    rain = float(demo_weather["rain"]) if demo_weather["enabled"] else 0
    score, level = calculate_risk(
        hazard.type,
        exposure_score=float(hazard.exposure_score or exposure[0]),
        confidence=float(hazard.confidence or 0),
        observations=int(hazard.observation_count or 1),
        rain=rain,
    )
    return {
        "id": hazard.id,
        "type": hazard.type,
        "latitude": hazard.latitude,
        "longitude": hazard.longitude,
        "description": hazard.description,
        "confidence": hazard.confidence,
        "verification_status": hazard.verification_status or "PENDING",
        "verification_confidence": hazard.verification_confidence or hazard.confidence or 0,
        "observation_count": hazard.observation_count or 1,
        "exposure_score": round(exposure[0], 1),
        "exposure_label": exposure[1],
        "nearby_exposure": exposure[2],
        "work_order_match": hazard.work_order_match or (match["title"] if match else None),
        "work_order_id": hazard.work_order_id or (match["id"] if match else None),
        "risk_score": score,
        "risk_level": level,
        "base_risk_score": BASE_SCORES.get(hazard.type, 50),
        "weather_bonus": weather_bonus(rain),
        "status": hazard.status,
        "assigned_team": hazard.assigned_team,
        "assigned_at": hazard.assigned_at,
        "resolved_at": hazard.resolved_at,
        "reported_at": hazard.reported_at,
        "expires_at": hazard.expires_at,
        "image_filename": hazard.image_filename,
        "resolution_note": hazard.resolution_note,
        "resolution_proof": hazard.resolution_proof,
    }


# =========================================================
# ROOT / HEALTH
# =========================================================

@app.get("/")
def root():
    return {"message": "HazardPulse API is running", "version": "2.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# =========================================================
# HAZARDS
# =========================================================

@app.get("/hazards")
def get_hazards(db: Session = Depends(get_db)):
    return [serialize_hazard(hazard) for hazard in db.query(Hazard).order_by(Hazard.id.desc()).all()]


@app.get("/hazards/{hazard_id}")
def get_hazard(hazard_id: int, db: Session = Depends(get_db)):
    hazard = db.query(Hazard).filter(Hazard.id == hazard_id).first()
    if hazard is None:
        raise HTTPException(status_code=404, detail="Hazard not found")
    return serialize_hazard(hazard)


@app.post("/hazards")
def create_hazard(hazard_data: HazardCreate, db: Session = Depends(get_db)):
    hazard_type = hazard_data.type.upper()
    exposure_score, exposure_label, _ = exposure_context(hazard_data.latitude, hazard_data.longitude)
    work_order = match_work_order(hazard_type, hazard_data.latitude, hazard_data.longitude)
    verification = float(hazard_data.verification_confidence or 90)

    # Duplicate correlation: nearby reports of the same type become supporting observations.
    candidates = db.query(Hazard).filter(
        Hazard.type == hazard_type,
        Hazard.status != "RESOLVED",
    ).all()
    duplicate = next(
        (item for item in candidates if distance_km(item.latitude, item.longitude, hazard_data.latitude, hazard_data.longitude) <= 0.10),
        None,
    )

    if duplicate:
        duplicate.observation_count = int(duplicate.observation_count or 1) + 1
        duplicate.confidence = min(99, max(float(duplicate.confidence or 0), verification) + 1)
        if duplicate.verification_status != "VERIFIED":
            duplicate.verification_status = "VERIFIED" if duplicate.confidence >= 85 else "PENDING"
        db.commit()
        db.refresh(duplicate)
        result = serialize_hazard(duplicate)
        result["duplicate_observation"] = True
        result["message"] = f"Correlated with existing hazard #{duplicate.id}; observation count increased."
        return result

    base_score, base_level = calculate_risk(
        hazard_type,
        exposure_score=exposure_score,
        confidence=verification,
        observations=1,
    )

    hazard = Hazard(
        type=hazard_type,
        latitude=hazard_data.latitude,
        longitude=hazard_data.longitude,
        description=hazard_data.description,
        confidence=verification,
        verification_status="VERIFIED" if verification >= 85 else "PENDING",
        verification_confidence=verification,
        observation_count=1,
        exposure_score=exposure_score,
        exposure_label=exposure_label,
        work_order_match=work_order["title"] if work_order else None,
        work_order_id=work_order["id"] if work_order else None,
        risk_score=base_score,
        risk_level=base_level,
        status="REPORTED",
        image_filename=hazard_data.image_filename,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(hazard)
    db.commit()
    db.refresh(hazard)
    return serialize_hazard(hazard)


@app.post("/hazards/verify-image")
async def verify_image(
    hazard_type: str = Form(...),
    image: UploadFile = File(...),
):
    """Prototype image-verification endpoint.

    This intentionally returns a transparent demo confidence score rather than claiming a
    trained production vision model. The API contract is ready for a YOLO/PyTorch model later.
    """
    allowed = {"OPEN_MANHOLE", "ROAD_EXCAVATION", "WATERLOGGING", "FALLEN_TREE"}
    if hazard_type.upper() not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported hazard type")
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    contents = await image.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 8 MB")

    safe_name = Path(image.filename or "hazard.jpg").name
    target = UPLOAD_DIR / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{safe_name}"
    target.write_bytes(contents)

    demo_confidence = {
        "OPEN_MANHOLE": 93,
        "ROAD_EXCAVATION": 91,
        "WATERLOGGING": 89,
        "FALLEN_TREE": 92,
    }[hazard_type.upper()]

    return {
        "status": "VERIFIED",
        "confidence": demo_confidence,
        "hazard_type": hazard_type.upper(),
        "filename": safe_name,
        "engine": "HazardPulse Vision Verification — prototype adapter",
        "note": "Prototype confidence; replace adapter with a trained vision model for production.",
    }


# =========================================================
# EXPOSURE / WORK ORDERS / ALERTS
# =========================================================

@app.post("/resolution-proof")
async def upload_resolution_proof(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")
    contents = await image.read()
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be smaller than 8 MB")
    safe_name = Path(image.filename or "resolution.jpg").name
    target = UPLOAD_DIR / f"resolution_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{safe_name}"
    target.write_bytes(contents)
    return {"filename": safe_name, "stored": target.name, "status": "PROOF_UPLOADED"}


@app.get("/exposure")
def get_exposure(latitude: float = 18.5204, longitude: float = 73.8567):
    score, label, nearby = exposure_context(latitude, longitude)
    return {"score": score, "label": label, "nearby": nearby}


@app.get("/work-orders")
def get_work_orders():
    return WORK_ORDERS


@app.get("/alerts")
def get_alerts(db: Session = Depends(get_db)):
    alerts = []
    for hazard in db.query(Hazard).order_by(Hazard.id.desc()).all():
        data = serialize_hazard(hazard)
        if data["status"] == "RESOLVED":
            continue
        if data["risk_level"] in {"HIGH", "CRITICAL"}:
            alerts.append({
                "id": data["id"],
                "title": f"{data['risk_level']} hazard ahead",
                "message": f"{data['type'].replace('_', ' ').title()} near your area. Exercise caution.",
                "risk_level": data["risk_level"],
                "latitude": data["latitude"],
                "longitude": data["longitude"],
                "exposure": data["exposure_label"],
            })
    return alerts[:10]


# =========================================================
# RESPONSE LIFECYCLE
# =========================================================

@app.put("/hazards/{hazard_id}/assign")
def assign_team(hazard_id: int, team_data: AssignTeam, db: Session = Depends(get_db)):
    hazard = db.query(Hazard).filter(Hazard.id == hazard_id).first()
    if hazard is None:
        raise HTTPException(status_code=404, detail="Hazard not found")

    hazard.assigned_team = team_data.team
    hazard.assigned_at = datetime.utcnow()
    hazard.status = "ASSIGNED"
    db.commit()
    db.refresh(hazard)
    return serialize_hazard(hazard)


@app.put("/hazards/{hazard_id}/status")
def update_status(hazard_id: int, status_data: StatusUpdate, db: Session = Depends(get_db)):
    hazard = db.query(Hazard).filter(Hazard.id == hazard_id).first()
    if hazard is None:
        raise HTTPException(status_code=404, detail="Hazard not found")

    allowed_statuses = ["REPORTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"]
    if status_data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    hazard.status = status_data.status
    if status_data.status == "RESOLVED":
        hazard.resolved_at = datetime.utcnow()
        hazard.resolution_note = status_data.resolution_note or "Field response completed and mitigation verified."
        hazard.resolution_proof = status_data.resolution_proof
    db.commit()
    db.refresh(hazard)
    return serialize_hazard(hazard)


# =========================================================
# DEMO MODE
# =========================================================

@app.get("/demo/weather")
def get_demo_weather():
    return demo_weather


@app.post("/demo/weather")
def set_demo_weather(payload: DemoWeatherUpdate):
    demo_weather["enabled"] = payload.enabled
    demo_weather["rain"] = max(0.0, float(payload.rain)) if payload.enabled else 0.0
    return demo_weather


# =========================================================
# REAL WEATHER — OPEN-METEO
# =========================================================

@app.get("/weather")
def get_weather(latitude: float = 18.5204, longitude: float = 73.8567):
    if demo_weather["enabled"]:
        rain = demo_weather["rain"]
        return {
            "latitude": latitude,
            "longitude": longitude,
            "temperature": 24,
            "humidity": 86,
            "precipitation": rain,
            "rain": rain,
            "wind_speed": 18,
            "weather_code": 65,
            "condition": "Heavy rain — DEMO",
            "timezone": "Asia/Kolkata",
            "demo_mode": True,
        }

    params = urlencode({
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m",
        "timezone": "auto",
    })
    url = f"https://api.open-meteo.com/v1/forecast?{params}"

    try:
        request = Request(url, headers={"User-Agent": "HazardPulse/2.0"})
        with urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
        current = data.get("current", {})
        weather_code = int(current.get("weather_code", 0))
        return {
            "latitude": data.get("latitude", latitude),
            "longitude": data.get("longitude", longitude),
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "precipitation": current.get("precipitation", 0),
            "rain": current.get("rain", 0),
            "wind_speed": current.get("wind_speed_10m"),
            "weather_code": weather_code,
            "condition": WEATHER_LABELS.get(weather_code, "Unknown"),
            "timezone": data.get("timezone"),
            "demo_mode": False,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather service unavailable: {exc}")
