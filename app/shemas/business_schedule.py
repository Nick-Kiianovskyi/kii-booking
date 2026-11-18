from datetime import time
from pydantic import BaseModel


class ScheduleItem(BaseModel):

    weekday: int

    start_time: time | None

    end_time: time | None

    slot_minutes: int

    is_working: bool


class ScheduleResponse(ScheduleItem):
    id: int


class Config:

    from_attributes = True
