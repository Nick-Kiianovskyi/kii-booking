from pydantic import BaseModel, ConfigDict


class BusinessCreate(BaseModel):
    name: str
    email: str
    password: str


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    slug: str
    is_active: bool


class BusinessPublicResponse(BaseModel):
    """Public profile for the booking page — deliberately excludes email."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    is_active: bool
    slot_minutes: int = 30
