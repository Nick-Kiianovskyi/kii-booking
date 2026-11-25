from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import DEBUG
from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.business import Business

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_business(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> Business:
    payload = decode_access_token(token)
    if payload is None:
        raise _credentials_exception

    raw_business_id = payload.get("sub")
    if raw_business_id is None:
        raise _credentials_exception

    try:
        business_id = int(raw_business_id)
    except (TypeError, ValueError):
        raise _credentials_exception

    business = db.query(Business).filter(Business.id == business_id).first()
    if business is None:
        raise _credentials_exception

    return business


def get_owned_business(
    business_id: int,
    current_business: Business = Depends(get_current_business),
) -> Business:
    if current_business.id != business_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )
    return current_business


def require_debug_enabled() -> None:
    """Hide debug-only endpoints unless DEBUG is explicitly enabled."""
    if not DEBUG:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )
