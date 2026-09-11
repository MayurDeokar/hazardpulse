from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from .database import Base


class Hazard(Base):
    __tablename__ = "hazards"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(Text, nullable=True)

    # Intelligence layer
    confidence = Column(Float, default=0)
    verification_status = Column(String, default="PENDING")
    verification_confidence = Column(Float, default=0)
    observation_count = Column(Integer, default=1)
    exposure_score = Column(Float, default=0)
    exposure_label = Column(String, default="LOW")
    work_order_match = Column(String, nullable=True)
    work_order_id = Column(String, nullable=True)

    # Risk + lifecycle
    risk_score = Column(Float, default=0)
    risk_level = Column(String, default="LOW")
    status = Column(String, default="REPORTED")
    assigned_team = Column(String, nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    reported_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)

    # Evidence
    image_filename = Column(String, nullable=True)
    resolution_note = Column(Text, nullable=True)
    resolution_proof = Column(String, nullable=True)
