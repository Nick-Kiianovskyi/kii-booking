from sqlalchemy import Column

from sqlalchemy import Integer

from sqlalchemy import String

from sqlalchemy import Date

from sqlalchemy import Time
from sqlalchemy import ForeignKey
from sqlalchemy import Index
from sqlalchemy import UniqueConstraint


from app.db.database import Base


class Booking(Base):

    __tablename__ = "bookings"

    __table_args__ = (
        Index("ix_bookings_business_id_date", "business_id", "date"),
        Index(
            "ix_bookings_business_id_date_start_time",
            "business_id",
            "date",
            "start_time",
        ),
        UniqueConstraint(
            "business_id", "date", "start_time", name="uq_bookings_business_date_start"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    business_id = Column(Integer, ForeignKey("businesses.id"))

    client_name = Column(String, nullable=False)

    phone = Column(String, nullable=False)

    service = Column(String, nullable=False)

    date = Column(Date, nullable=False)

    start_time = Column(Time, nullable=False)

    end_time = Column(Time, nullable=False)

    google_event_id = Column(
        String, nullable=True
    )  # Store the Google Calendar event ID
