from fastapi import FastAPI

app = FastAPI(
    title="HazardPulse API",
    description="Real-time temporary public safety hazard intelligence platform",
    version="1.0.0"
)


@app.get("/")
def root():
    return {
        "message": "HazardPulse API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }