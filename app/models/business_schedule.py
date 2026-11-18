from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Boolean,
    Time,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class BusinessSchedule(Base):

    __tablename__ = "business_schedules"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(
        Integer,
        ForeignKey("businesses.id"),
        nullable=False,
    )
    weekday = Column(Integer, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    slot_minutes = Column(Integer, default=30)
    is_working = Column(Boolean, default=True)
    business = relationship(
        "Business",
        back_populates="schedules",
    )
