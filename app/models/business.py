from sqlalchemy import Boolean, Column, Integer, String
from app.db.database import Base


class Business(Base):

    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    google_connected = Column(Boolean, default=False)
    google_calendar_id = Column(String, nullable=True)
    google_access_token = Column(String, nullable=True)
    google_refresh_token = Column(String, nullable=True)
