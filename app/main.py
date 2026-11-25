import logging
import re
from datetime import date, datetime, timedelta

import requests
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

from app.db.database import get_db
from app.models import booking
from app.models.booking import Booking
from app.shemas import business
from app.shemas.booking import BookingCreate, BookingResponse
from app.models.business import Business
from app.shemas.business import BusinessCreate, BusinessResponse, BusinessPublicResponse
from app.shemas.error import ErrorResponse
from app.services.google_calendar import get_google_auth_url
from app.services.google_calendar import google_api_request, delete_google_event
from app.services.availability import (
    exclude_busy_slots,
    format_slots,
    generate_time_slots,
    parse_busy_events,
)
from app.models.business_schedule import BusinessSchedule
from app.shemas.business_schedule import (
    ScheduleBulkUpdate,
    ScheduleItem,
    ScheduleResponse,
)

from app.core.config import (
    CORS_ALLOWED_ORIGINS,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_REQUEST_TIMEOUT,
)
from app.core.security import (
    create_access_token,
    decode_oauth_state,
    get_password_hash,
    verify_password,
)
from app.shemas.auth import LoginRequest, Token
from app.api.deps import get_current_business, get_owned_business, require_debug_enabled

OPENAPI_TAGS = [
    {"name": "system", "description": "Service status endpoints."},
    {"name": "auth", "description": "Business registration and JWT authentication."},
    {
        "name": "businesses",
        "description": "Business profiles, including the public booking page profile.",
    },
    {"name": "schedule", "description": "Working hours and slot configuration."},
    {"name": "availability", "description": "Public lookup of free booking slots."},
    {"name": "bookings", "description": "Create, list and delete bookings."},
    {
        "name": "google",
        "description": "Google OAuth connection and Calendar synchronization.",
    },
]

ERROR_RESPONSES = {
    code: {"model": ErrorResponse, "description": description}
    for code, description in {
        400: "Bad request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Resource not found",
        409: "Conflict",
        422: "Validation error",
        500: "Internal server error",
        502: "Upstream (Google) error",
    }.items()
}

app = FastAPI(
    title="KII Booking API",
    version="1.0.0",
    description=(
        "Backend for KII Booking: businesses, schedules, availability and bookings "
        "synchronized with Google Calendar."
    ),
    openapi_tags=OPENAPI_TAGS,
    responses=ERROR_RESPONSES,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials="*" not in CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
}

NAMED_ERROR_CODES = {
    "Business not found": "BUSINESS_NOT_FOUND",
    "Booking not found": "BOOKING_NOT_FOUND",
    "Email already registered": "EMAIL_ALREADY_REGISTERED",
    "Incorrect email or password": "INVALID_CREDENTIALS",
    "Invalid request": "VALIDATION_ERROR",
    "Could not validate credentials": "UNAUTHORIZED",
    "Not authenticated": "UNAUTHORIZED",
    "Invalid authentication credentials": "UNAUTHORIZED",
    "Forbidden": "FORBIDDEN",
    "Not Found": "NOT_FOUND",
    "Selected slot is unavailable": "SLOT_UNAVAILABLE",
    "Time slot is already booked for the selected date.": "SLOT_ALREADY_BOOKED",
    "Start time must be before end time.": "INVALID_TIME_RANGE",
    "Google Calendar not connected": "GOOGLE_NOT_CONNECTED",
    "Unable to read Google Calendar": "GOOGLE_READ_FAILED",
    "Unable to delete Google Calendar event": "GOOGLE_DELETE_FAILED",
    "Unable to exchange Google authorization code": "OAUTH_TOKEN_EXCHANGE_FAILED",
    "Invalid response from Google": "GOOGLE_INVALID_RESPONSE",
    "Google did not return an access token": "GOOGLE_MISSING_ACCESS_TOKEN",
    "Google did not return a refresh token": "GOOGLE_MISSING_REFRESH_TOKEN",
    "Invalid or expired state": "INVALID_OAUTH_STATE",
    "Missing state": "MISSING_OAUTH_STATE",
    "Missing code": "MISSING_OAUTH_CODE",
}


def _error_code(status_code: int, message: str) -> str:
    if message in NAMED_ERROR_CODES:
        return NAMED_ERROR_CODES[message]
    if message.startswith("Unable to exchange Google authorization code"):
        return "OAUTH_TOKEN_EXCHANGE_FAILED"
    if message.startswith("OAuth error:"):
        return "OAUTH_ERROR"
    slug = re.sub(r"[^A-Z0-9]+", "_", message.upper()).strip("_")
    return slug or DEFAULT_ERROR_CODES.get(status_code, "HTTP_ERROR")


def _error_payload(
    request: Request, status_code: int, message: str, details: list[dict] | None = None
) -> dict:
    payload = {
        "detail": message,
        "error": {"code": _error_code(status_code, message), "message": message},
        "path": request.url.path,
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    message = str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(request, exc.status_code, message),
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=_error_payload(
            request, 422, "Invalid request", details=jsonable_encoder(exc.errors())
        ),
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content=_error_payload(request, 500, "Internal server error"),
    )


def _load_available_slots(
    business: Business, day: date, db: Session
) -> tuple[list, int]:
    schedule = (
        db.query(BusinessSchedule)
        .filter(
            BusinessSchedule.business_id == business.id,
            BusinessSchedule.weekday == day.weekday(),
        )
        .order_by(BusinessSchedule.id)
        .first()
    )
    if (
        not schedule
        or not schedule.is_working
        or not schedule.start_time
        or not schedule.end_time
    ):
        return [], 30

    slot_minutes = schedule.slot_minutes or 30
    slots = generate_time_slots(schedule.start_time, schedule.end_time, slot_minutes)

    if not business.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    params = {
        "timeMin": f"{day.isoformat()}T00:00:00Z",
        "timeMax": f"{day.isoformat()}T23:59:59Z",
        "singleEvents": True,
        "orderBy": "startTime",
    }
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

    response = google_api_request("GET", url, business, db, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Unable to read Google Calendar")

    busy = parse_busy_events(response.json().get("items", []), day)
    return exclude_busy_slots(slots, busy, slot_minutes), slot_minutes


@app.get("/", tags=["system"])
def root():
    return {"message": "KII Booking API"}


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}


@app.post("/bookings", tags=["bookings"])

##################
#  CREATE BOOKING
#####################


def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    # Serialize all booking writes for this business. In PostgreSQL this
    # `SELECT ... FOR UPDATE` lock is held until commit, so two concurrent
    # requests cannot both pass the availability/overlap checks below.
    business = (
        db.query(Business)
        .filter(Business.id == booking.business_id)
        .with_for_update()
        .first()
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    if booking.start_time >= booking.end_time:
        raise HTTPException(
            status_code=400, detail="Start time must be before end time."
        )

    available_slots, slot_minutes = _load_available_slots(business, booking.date, db)
    if booking.start_time not in available_slots:
        raise HTTPException(status_code=400, detail="Selected slot is unavailable")

    current = datetime.combine(date.min, booking.start_time)
    end = datetime.combine(date.min, booking.end_time)
    step = timedelta(minutes=slot_minutes)
    while current < end:
        if current.time() not in available_slots:
            raise HTTPException(status_code=400, detail="Selected slot is unavailable")
        current += step

    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.business_id == booking.business_id,
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
    try:
        db.commit()
    except IntegrityError:
        # Database uniqueness won the race (e.g. another transaction inserted
        # the same business/date/start_time between check and insert).
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Time slot is already booked for the selected date."
        )
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
        response = google_api_request(
            "POST",
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            business,
            db,
            headers={"Content-Type": "application/json"},
            json=event,
        )
        event_response = response.json()

        if "id" in event_response:
            new_booking.google_event_id = event_response["id"]

        db.commit()

    return {"message": "Booking created", "id": new_booking.id}


@app.get("/bookings", response_model=list[BookingResponse], tags=["bookings"])
def get_bookings(
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):

    bookings = (
        db.query(Booking).filter(Booking.business_id == current_business.id).all()
    )

    return bookings


###################
# REGISTER BUSINESS
#####################


@app.post("/auth/register", response_model=BusinessResponse, tags=["auth"])
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
        password_hash=get_password_hash(business.password),
        slug=slug,
        is_active=True,
    )

    db.add(new_business)

    db.commit()

    db.refresh(new_business)

    return new_business


##########
# AUTH LOGIN / ME
##########


@app.post("/auth/login", response_model=Token, tags=["auth"])
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.email == credentials.email).first()
    if not business or not verify_password(
        credentials.password, business.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not business.password_hash.startswith("$2"):
        business.password_hash = get_password_hash(credentials.password)
        db.commit()

    access_token = create_access_token({"sub": str(business.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=BusinessResponse, tags=["auth"])
def read_current_business(
    current_business: Business = Depends(get_current_business),
):
    return current_business


#######
# GOOGLE CONNECTION
#######


@app.get("/google/connect/{business_id}", tags=["google"])
def connect_google(
    business_id: int,
    current_business: Business = Depends(get_owned_business),
):
    return {"auth_url": get_google_auth_url(current_business.id)}


#####
# GOOGLE CALLBACK
#####
@app.get("/google/callback", tags=["google"])
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        detail = f"OAuth error: {error}"
        if error_description:
            detail += f" - {error_description}"
        raise HTTPException(status_code=400, detail=detail)

    if not state:
        raise HTTPException(status_code=400, detail="Missing state")

    business_id = decode_oauth_state(state)
    if business_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    try:
        response = requests.post(
            token_url, data=data, timeout=GOOGLE_REQUEST_TIMEOUT
        )
    except requests.RequestException as exc:
        logger.exception("Google token exchange request failed")
        raise HTTPException(
            status_code=502, detail="Unable to exchange Google authorization code"
        ) from exc

    try:
        token_response = response.json()
    except ValueError as exc:
        logger.error(
            "Google token exchange returned non-JSON: status=%s", response.status_code
        )
        raise HTTPException(status_code=502, detail="Invalid response from Google") from exc

    if response.status_code != 200:
        if isinstance(token_response, dict):
            reason = (
                token_response.get("error_description")
                or token_response.get("error")
                or f"HTTP {response.status_code}"
            )
        else:
            reason = f"HTTP {response.status_code}"
        logger.error(
            "Google token exchange rejected: status=%s reason=%s redirect_uri=%s",
            response.status_code,
            reason,
            GOOGLE_REDIRECT_URI,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Unable to exchange Google authorization code: {reason}",
        )

    access_token = token_response.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=502, detail="Google did not return an access token"
        )

    refresh_token = token_response.get("refresh_token")
    if not refresh_token and not business.google_refresh_token:
        raise HTTPException(
            status_code=400, detail="Google did not return a refresh token"
        )

    business.google_access_token = access_token
    if refresh_token:
        business.google_refresh_token = refresh_token
    business.google_connected = True
    db.commit()
    return {"message": "Google connected", "business_id": business_id}


#####
# DEBUG: test event (hidden unless DEBUG=true)
#####


@app.get("/google/test-event/{business_id}", tags=["google"])
def google_test_event(
    business_id: int,
    db: Session = Depends(get_db),
    _debug: None = Depends(require_debug_enabled),
    current_business: Business = Depends(get_owned_business),
):
    event = {
        "summary": "KII Booking Test",
        "description": "First test event",
        "start": {"dateTime": "2026-11-17T10:00:00", "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": "2026-11-17T11:00:00", "timeZone": "Europe/Kyiv"},
    }
    response = google_api_request(
        "POST",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        current_business,
        db,
        headers={"Content-Type": "application/json"},
        json=event,
    )

    return response.json()


#########
# AVAILABILITY CHECK
#########
@app.get("/availability/{business_id}", tags=["availability"])
def get_availability(business_id: int, date: date, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    available, _ = _load_available_slots(business, date, db)
    return {"available": format_slots(available)}


######
# GET BUSINESS SCHEDULE
####
@app.get(
    "/business/{business_id}/schedule",
    response_model=list[ScheduleResponse],
    tags=["schedule"],
)
def get_business_schedule(business_id: int, db: Session = Depends(get_db)):

    schedule = (
        db.query(BusinessSchedule)
        .filter(BusinessSchedule.business_id == business_id)
        .order_by(BusinessSchedule.weekday)
        .all()
    )

    return schedule


@app.put(
    "/business/{business_id}/schedule",
    response_model=list[ScheduleResponse],
    tags=["schedule"],
)
def update_business_schedule(
    business_id: int,
    schedule: ScheduleBulkUpdate,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_owned_business),
):
    db.query(BusinessSchedule).filter(
        BusinessSchedule.business_id == business_id
    ).delete(synchronize_session=False)

    new_schedule = [
        BusinessSchedule(
            business_id=business_id,
            weekday=item.weekday,
            start_time=item.start_time,
            end_time=item.end_time,
            slot_minutes=item.slot_minutes,
            is_working=item.is_working,
        )
        for item in sorted(schedule.root, key=lambda item: item.weekday)
    ]
    db.add_all(new_schedule)
    db.commit()

    for item in new_schedule:
        db.refresh(item)

    return new_schedule


#####################################
# PUBLIC BUSINESS PROFILE (by slug)
#####################################


@app.get(
    "/businesses/by-slug/{slug}",
    response_model=BusinessPublicResponse,
    tags=["businesses"],
)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.slug == slug).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    configured_slot = (
        db.query(BusinessSchedule.slot_minutes)
        .filter(BusinessSchedule.business_id == business.id)
        .order_by(BusinessSchedule.weekday)
        .first()
    )
    slot_minutes = configured_slot[0] if configured_slot and configured_slot[0] else 30

    return {
        "id": business.id,
        "name": business.name,
        "slug": business.slug,
        "is_active": business.is_active,
        "slot_minutes": slot_minutes,
    }


###################
# BUSINESS CABINET
###################


@app.get("/business/{business_id}", response_model=BusinessResponse, tags=["businesses"])
def get_business(
    business_id: int,
    current_business: Business = Depends(get_owned_business),
):
    return current_business


@app.get(
    "/business/{business_id}/bookings",
    response_model=list[BookingResponse],
    tags=["businesses"],
)
def get_business_bookings(
    business_id: int,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_owned_business),
):
    return db.query(Booking).filter(Booking.business_id == business_id).all()


###################
# DELETE BOOKING
###################


@app.delete("/bookings/{booking_id}", tags=["bookings"])
def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.business_id != current_business.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    google_event_id = booking.google_event_id
    if google_event_id:
        if not current_business.google_access_token or not delete_google_event(
            google_event_id, current_business, db
        ):
            raise HTTPException(
                status_code=502, detail="Unable to delete Google Calendar event"
            )

    db.delete(booking)
    db.commit()
    return {"message": "Booking deleted"}
