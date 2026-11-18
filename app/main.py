from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import requests

from app.db.database import SessionLocal, engine, Base
from app.models import booking
from app.models.booking import Booking
from app.shemas import business
from app.shemas.booking import BookingCreate, BookingResponse
from app.models.business import Business
from app.shemas.business import BusinessCreate, BusinessResponse
from app.services.google_calendar import get_google_auth_url
from app.services.google_calendar import refresh_google_token
from app.models.business_schedule import BusinessSchedule
from app.shemas.business_schedule import ScheduleItem, ScheduleResponse

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

Base.metadata.create_all(bind=engine)

app = FastAPI(title="KII Booking")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "KII Booking API"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/bookings")

##################
#  CREATE BOOKING
#####################


def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.date == booking.date,
            Booking.start_time < booking.end_time,
            Booking.end_time > booking.start_time,
        )
        .first()
    )

    if existing_booking:
        raise HTTPException(
            status_code=400, detail="Time slot is already booked for the selected date."
        )

    business = db.query(Business).filter(Business.id == booking.business_id).first()
    if booking.start_time >= booking.end_time:
        raise HTTPException(
            status_code=400, detail="Start time must be before end time."
        )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    new_booking = Booking(
        business_id=booking.business_id,
        client_name=booking.client_name,
        phone=booking.phone,
        service=booking.service,
        date=booking.date,
        start_time=booking.start_time,
        end_time=booking.end_time,
    )

    db.add(new_booking)

    db.commit()

    db.refresh(new_booking)
    if business.google_connected and business.google_access_token:
        event = {
            "summary": f"{booking.service} - {booking.client_name}",
            "description": f"Phone: {booking.phone}",
            "start": {
                "dateTime": f"{booking.date}T{booking.start_time}",
                "timeZone": "Europe/Kyiv",
            },
            "end": {
                "dateTime": f"{booking.date}T{booking.end_time}",
                "timeZone": "Europe/Kyiv",
            },
        }
        response = requests.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={
                "Authorization": f"Bearer {business.google_access_token}",
                "Content-Type": "application/json",
            },
            json=event,
        )
        if response.status_code == 401:
            new_token = refresh_google_token(business.id)
            response = requests.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={
                    "Authorization": f"Bearer {new_token}",
                    "Content-Type": "application/json",
                },
                json=event,
            )
        event_response = response.json()

        if "id" in event_response:

            new_booking.google_event_id = event_response["id"]

        db.commit()

        return {"message": "Booking created", "id": new_booking.id}
        return {"message": "Booking created", "id": new_booking.id}


@app.get("/bookings", response_model=list[BookingResponse])
def get_bookings(db: Session = Depends(get_db)):

    bookings = db.query(Booking).all()

    return bookings


###################
# REGISTER BUSINESS
#####################


@app.post("/auth/register", response_model=BusinessResponse)
def register_business(business: BusinessCreate, db: Session = Depends(get_db)):

    existing_business = (
        db.query(Business).filter(Business.email == business.email).first()
    )

    if existing_business:
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = business.name.lower().replace(" ", "-")

    new_business = Business(
        name=business.name,
        email=business.email,
        password_hash=business.password,  # временно
        slug=slug,
        is_active=True,
    )

    db.add(new_business)

    db.commit()

    db.refresh(new_business)

    return new_business


#######
# GOOGLE CONNECTION
#######


@app.get("/google/connect/{business_id}")
def connect_google(business_id: int):
    return {"auth_url": get_google_auth_url(business_id)}


#####
# GOOGLE CALLBACK
#####
@app.get("/google/callback")
def google_callback(code: str, state: str):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    response = requests.post(token_url, data=data)
    token_response = response.json()
    business_id = state
    db = SessionLocal()
    business = db.query(Business).filter(Business.id == int(business_id)).first()

    if not business:
        return {"error": "Business not found"}

    business.google_access_token = token_response["access_token"]
    business.google_refresh_token = token_response["refresh_token"]
    business.google_connected = True
    db.commit()
    return {"message": "Google connected", "business_id": business_id}


#####
# test
#####


@app.get("/google/test-event/{business_id}")
def google_test_event(business_id: int):

    db = SessionLocal()

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        return {"error": "Business not found"}

    event = {
        "summary": "KII Booking Test",
        "description": "First test event",
        "start": {"dateTime": "2026-11-17T10:00:00", "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": "2026-11-17T11:00:00", "timeZone": "Europe/Kyiv"},
    }
    print("BUSINESS =", business_id)
    print("GOOGLE ACCESS TOKEN =", business.google_access_token[:20])
    response = requests.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={
            "Authorization": f"Bearer {business.google_access_token}",
            "Content-Type": "application/json",
        },
        json=event,
    )

    return response.json()


#########
# AVAILABILITY CHECK
#########
@app.get("/availability/{business_id}")
def get_availability(business_id: int, date: str):
    db = SessionLocal()
    business = db.query(Business).filter(Business.id == business_id).first()

    if not business:
        return {"error": "Business not found"}

    bookings = db.query(Booking).filter(Booking.business_id == business_id).first()

    if not business:
        return {"error": "Business not found"}

    if not business.google_access_token:

        return {"error": "Google Calendar not connected"}

    start_of_day = f"{date}T00:00:00Z"
    end_of_day = f"{date}T23:59:59Z"

    params = {
        "timeMin": start_of_day,
        "timeMax": end_of_day,
        "singleEvents": True,
        "orderBy": "startTime",
    }
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {business.google_access_token}"},
        params=params,
    )

    if response.status_code == 401:
        new_token = refresh_google_token(business.id)
        if not new_token:
            return {"error": "Unable to refresh Google token"}

        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {new_token}"},
            params=params,
        )

    data = response.json()
    print("GOOGLE CALENDAR RESPONSE =", data)
    print("GOOGLE CALENDAR DATA =", data)
    busy_slots = []

    for event in data.get("items", []):
        start = event.get("start", {}).get("dateTime")
        end = event.get("end", {}).get("dateTime")
        if start and end:
            start_time = datetime.fromisoformat(start.replace("Z", "+00:00")).strftime(
                "%H:%M"
            )
            end_time = datetime.fromisoformat(end.replace("Z", "+00:00")).strftime(
                "%H:%M"
            )
            busy_slots.append(
                {
                    "start": start_time,
                    "end": end_time,
                    "summary": event.get("summary", ""),
                }
            )

    return {"business_id": business_id, "date": date, "busy": busy_slots}


######
# GET BUSINESS SCHEDULE
####
@app.get("/business/{business_id}/schedule", response_model=list[ScheduleResponse])
def get_business_schedule(business_id: int, db: Session = Depends(get_db)):

    schedule = (
        db.query(BusinessSchedule)
        .filter(BusinessSchedule.business_id == business_id)
        .order_by(BusinessSchedule.weekday)
        .all()
    )

    return schedule
