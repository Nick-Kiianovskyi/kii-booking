import requests
from app.db.database import SessionLocal
from app.models.business import Business
from app.core.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
)


def refresh_google_token(business_id: int):

    db = SessionLocal()

    business = db.query(Business).filter(Business.id == business_id).first()

    if not business:

        return None

    if not business.google_refresh_token:

        return None

    response = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": business.google_refresh_token,
            "grant_type": "refresh_token",
        },
    )

    token_data = response.json()

    if "access_token" in token_data:
        business.google_access_token = token_data["access_token"]
    db.commit()
    return token_data["access_token"]

    return None


def get_google_auth_url(business_id: int):

    return (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        "&response_type=code"
        "&scope=https://www.googleapis.com/auth/calendar.events"
        "&access_type=offline"
        "&prompt=consent"
        f"&state={business_id}"
    )
