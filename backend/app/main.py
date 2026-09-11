from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy import text

from .database import engine, Base, get_db
from .models import Hazard


# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(bind=engine)

with engine.connect() as connection:
    existing_columns = connection.execute(
        text("PRAGMA table_info(hazards)")
    ).fetchall()

    column_names = [column[1] for column in existing_columns]

    if "assigned_team" not in column_names:
        connection.execute(
            text("ALTER TABLE hazards ADD COLUMN assigned_team VARCHAR")
        )

    if "assigned_at" not in column_names:
        connection.execute(
            text("ALTER TABLE hazards ADD COLUMN assigned_at DATETIME")
        )

    if "resolved_at" not in column_names:
        connection.execute(
            text("ALTER TABLE hazards ADD COLUMN resolved_at DATETIME")
        )

    connection.commit()


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="HazardPulse API",
    description="Real-time temporary public safety hazard intelligence platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# MODELS
# =========================================================

class HazardCreate(BaseModel):
    type: str
    latitude: float
    longitude: float
    description: str | None = None


class AssignTeam(BaseModel):
    team: str


class StatusUpdate(BaseModel):
    status: str


# =========================================================
# RISK ENGINE
# =========================================================

def calculate_risk(hazard_type: str):
    """
    Basic HazardPulse risk engine.

    Score is based on hazard severity.
    This is a prototype rule-based AI layer that can later
    incorporate weather, traffic, schools, hospitals and GIS.
    """

    scores = {
        "OPEN_MANHOLE": 75,
        "ROAD_EXCAVATION": 65,
        "WATERLOGGING": 80,
        "FALLEN_TREE": 70
    }

    score = scores.get(hazard_type.upper(), 50)

    if score >= 85:
        level = "CRITICAL"
    elif score >= 70:
        level = "HIGH"
    elif score >= 40:
        level = "MEDIUM"
    else:
        level = "LOW"

    return score, level


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "message": "HazardPulse API is running"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# =========================================================
# GET HAZARDS
# =========================================================

@app.get("/hazards")
def get_hazards(
    db: Session = Depends(get_db)
):
    return db.query(Hazard).all()


# =========================================================
# CREATE HAZARD + RISK ENGINE
# =========================================================

@app.post("/hazards")
def create_hazard(
    hazard_data: HazardCreate,
    db: Session = Depends(get_db)
):

    risk_score, risk_level = calculate_risk(
        hazard_data.type
    )

    hazard = Hazard(
        type=hazard_data.type,
        latitude=hazard_data.latitude,
        longitude=hazard_data.longitude,
        description=hazard_data.description,

        confidence=90,
        risk_score=risk_score,
        risk_level=risk_level,

        status="REPORTED"
    )

    db.add(hazard)
    db.commit()
    db.refresh(hazard)

    return hazard


# =========================================================
# GET SINGLE HAZARD
# =========================================================

@app.get("/hazards/{hazard_id}")
def get_hazard(
    hazard_id: int,
    db: Session = Depends(get_db)
):

    hazard = (
        db.query(Hazard)
        .filter(Hazard.id == hazard_id)
        .first()
    )

    if hazard is None:
        raise HTTPException(
            status_code=404,
            detail="Hazard not found"
        )

    return hazard


# =========================================================
# ASSIGN TEAM
# =========================================================

@app.put("/hazards/{hazard_id}/assign")
def assign_team(
    hazard_id: int,
    team_data: AssignTeam,
    db: Session = Depends(get_db)
):

    hazard = (
        db.query(Hazard)
        .filter(Hazard.id == hazard_id)
        .first()
    )

    if hazard is None:
        raise HTTPException(
            status_code=404,
            detail="Hazard not found"
        )

    hazard.assigned_team = team_data.team
    hazard.assigned_at = datetime.utcnow()
    hazard.status = "ASSIGNED"

    db.commit()
    db.refresh(hazard)

    return hazard


# =========================================================
# UPDATE STATUS
# =========================================================

@app.put("/hazards/{hazard_id}/status")
def update_status(
    hazard_id: int,
    status_data: StatusUpdate,
    db: Session = Depends(get_db)
):

    hazard = (
        db.query(Hazard)
        .filter(Hazard.id == hazard_id)
        .first()
    )

    if hazard is None:
        raise HTTPException(
            status_code=404,
            detail="Hazard not found"
        )

    allowed_statuses = [
        "REPORTED",
        "ASSIGNED",
        "IN_PROGRESS",
        "RESOLVED"
    ]

    if status_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid status"
        )

    hazard.status = status_data.status

    if status_data.status == "RESOLVED":
        hazard.resolved_at = datetime.utcnow()

    db.commit()
    db.refresh(hazard)

    return hazard