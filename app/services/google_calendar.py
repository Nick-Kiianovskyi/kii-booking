from app.core.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_REDIRECT_URI,
)


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
