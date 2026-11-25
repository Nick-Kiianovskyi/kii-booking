from datetime import time

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator


class ScheduleItem(BaseModel):
    weekday: int = Field(ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    slot_minutes: int = Field(default=30, gt=0)
    is_working: bool = True

    @model_validator(mode="after")
    def validate_working_hours(self) -> "ScheduleItem":
        if self.is_working:
            if self.start_time is None or self.end_time is None:
                raise ValueError("start_time and end_time are required for working days")
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
        else:
            self.start_time = None
            self.end_time = None
        return self


class ScheduleBulkUpdate(RootModel[list[ScheduleItem]]):
    @model_validator(mode="after")
    def validate_unique_weekdays(self) -> "ScheduleBulkUpdate":
        weekdays = [item.weekday for item in self.root]
        if len(weekdays) != len(set(weekdays)):
            raise ValueError("weekday values must be unique")
        return self


class ScheduleResponse(ScheduleItem):
    model_config = ConfigDict(from_attributes=True)

    id: int
