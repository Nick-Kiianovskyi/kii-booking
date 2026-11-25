from urllib.parse import urlencode

import requests
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.business import Business
from app.core.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    GOOGLE_REQUEST_TIMEOUT,
)
from app.core.security import create_oauth_state


def refresh_google_token(business_id: int, db: Session | None = None) -> str | None:
    owns_session = db is None
    session = db or SessionLocal()
    try:
        business = session.query(Business).filter(Business.id == business_id).first()
        if not business or not business.google_refresh_token:
            return None

        try:
            response = requests.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "refresh_token": business.google_refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=GOOGLE_REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            token_data = response.json()
        except (requests.RequestException, ValueError):
            return None

        access_token = token_data.get("access_token")
        if not access_token:
            return None

        business.google_access_token = access_token
        session.commit()
        return access_token
    finally:
        if owns_session:
            session.close()


def google_api_request(
    method: str,
    url: str,
    business: Business,
    db: Session,
    **kwargs,
) -> requests.Response:
    headers = dict(kwargs.pop("headers", None) or {})
    headers["Authorization"] = f"Bearer {business.google_access_token}"
    kwargs.setdefault("timeout", GOOGLE_REQUEST_TIMEOUT)

    response = requests.request(method, url, headers=headers, **kwargs)
    if response.status_code != 401:
        return response

    new_token = refresh_google_token(business.id, db)
    if not new_token:
        return response

    business.google_access_token = new_token
    headers["Authorization"] = f"Bearer {new_token}"
    return requests.request(method, url, headers=headers, **kwargs)


def delete_google_event(event_id: str, business: Business, db: Session) -> bool:
    """Delete a Calendar event.

    Returns True when the event was deleted or was already gone (404/410).
    Returns False on a Google/network error so the caller can keep the booking.
    """
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
        f"{event_id}"
    )
    try:
        response = google_api_request("DELETE", url, business, db)
    except requests.RequestException:
        return False

    return response.status_code in (200, 202, 204, 404, 410)


def get_google_auth_url(business_id: int) -> str:
    """Build the consent URL with a signed, randomized, short-lived state."""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "prompt": "consent",
        "state": create_oauth_state(business_id),
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
