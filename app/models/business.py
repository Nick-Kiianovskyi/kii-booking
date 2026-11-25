from sqlalchemy import Boolean, Column, Integer, String, UniqueConstraint
from app.db.database import Base
from sqlalchemy.orm import relationship


class Business(Base):

    __tablename__ = "businesses"

    __table_args__ = (
        UniqueConstraint("email", name="uq_businesses_email"),
        UniqueConstraint("slug", name="uq_businesses_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    google_connected = Column(Boolean, default=False)
    google_calendar_id = Column(String, nullable=True)
    google_access_token = Column(String, nullable=True)
    google_refresh_token = Column(String, nullable=True)
    schedules = relationship(
        "BusinessSchedule", back_populates="business", cascade="all, delete-orphan"
    )
