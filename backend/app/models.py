from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from datetime import datetime

from .database import Base


class Hazard(Base):

    __tablename__ = "hazards"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    type = Column(
        String,
        nullable=False
    )

    latitude = Column(
        Float,
        nullable=False
    )

    longitude = Column(
        Float,
        nullable=False
    )

    description = Column(
        Text,
        nullable=True
    )

    confidence = Column(
        Float,
        default=0
    )

    risk_score = Column(
        Float,
        default=0
    )

    risk_level = Column(
        String,
        default="LOW"
    )

    status = Column(
        String,
        default="REPORTED"
    )

    assigned_team = Column(
        String,
        nullable=True
    )

    assigned_at = Column(
        DateTime,
        nullable=True
    )

    resolved_at = Column(
        DateTime,
        nullable=True
    )

    reported_at = Column(
        DateTime,
        default=datetime.utcnow
    )