# HazardPulse

**Real-Time Intelligence for Temporary Public Safety Hazards**

HazardPulse is an SIH prototype that turns citizen reports, municipal work context, weather and GIS exposure into a live safety state.

## Prototype features

- 🕳️ Four focused hazard types: open manhole, road excavation/deep pit, waterlogging, fallen tree/obstruction
- 🧠 Photo verification adapter with transparent prototype confidence scoring
- 🔗 Duplicate/correlation logic: nearby same-type reports become supporting observations
- 📍 GIS exposure intelligence for school, bus hub, hospital, busy-road and high-footfall zones
- 🌧️ Live Open-Meteo weather context plus a one-click heavy-rain demo simulation
- ⚠️ Dynamic risk: severity + confidence + observations + exposure + weather
- 🔗 Municipal work-order matching using proximity and hazard type
- 🏛️ Authority dashboard with live map and priority queue
- 👷 Municipal operations lifecycle: assign → start response → upload proof → resolve
- 📣 Safety alerts with optional browser notifications
- 🗺️ Hazard avoidance zones on the map as the prototype safe-movement layer
- 📊 Analytics dashboard for type distribution, risk distribution and intelligence signals
- 🎭 Demo role switcher for Authority / Citizen / Field Officer presentation flow

## Run locally

### Backend

```powershell
cd .\hazardpulse\backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

API: http://127.0.0.1:8000
Docs: http://127.0.0.1:8000/docs

### Frontend

Open a second terminal:

```powershell
cd .\hazardpulse\frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## Demo flow

1. Open **Citizen Portal**.
2. Select **Open Manhole** and capture GPS or use the default Pune coordinates.
3. Upload a photo. The prototype verification adapter returns a confidence score.
4. Submit the report. The backend calculates exposure and checks nearby municipal work orders.
5. Open **Authority Dashboard** and inspect the incident priority.
6. Click **Simulate Heavy Rain**. Weather uplift is applied and the risk can move to **CRITICAL**.
7. Open **Municipal Operations** → assign team → start response.
8. Upload field proof and click **Mark Resolved**.
9. Open **Safety Alerts** / **Citizen Portal** to see that resolved hazards leave the active warning state.
10. Open **Analytics** to show the intelligence signals and current distribution.

## Important prototype note

The image-verification endpoint is deliberately described as a **prototype adapter**. It provides the demo contract and confidence output without pretending that a trained production vision model is running. For deployment, replace that adapter with a trained YOLO/PyTorch model.

Likewise, the exposure points and municipal work orders are illustrative demo data. They are designed to demonstrate the intelligence layer and can later be replaced with official GIS/work-order feeds.
