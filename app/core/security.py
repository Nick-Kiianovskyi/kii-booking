import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
)


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


OAUTH_STATE_PURPOSE = "google-oauth-state"
OAUTH_STATE_EXPIRE_MINUTES = 10


def create_oauth_state(business_id: int) -> str:
    """Create a short-lived, signed and randomized OAuth `state` value."""
    payload = {
        "sub": str(business_id),
        "purpose": OAUTH_STATE_PURPOSE,
        "jti": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=OAUTH_STATE_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_oauth_state(state: str) -> int | None:
    """Return the business id from a valid state, otherwise None."""
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

    if payload.get("purpose") != OAUTH_STATE_PURPOSE or not payload.get("jti"):
        return None

    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
