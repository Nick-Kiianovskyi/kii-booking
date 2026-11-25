from sqlalchemy import (
    Column,
    Integer,
    ForeignKey,
    Boolean,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class BusinessSchedule(Base):

    __tablename__ = "business_schedules"

    __table_args__ = (
        UniqueConstraint(
            "business_id", "weekday", name="uq_business_schedules_business_weekday"
        ),
    )

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
