from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KYIV_TIMEZONE = ZoneInfo("Europe/Kyiv")

BusyInterval = tuple[time, time]


def _as_datetime(value: time) -> datetime:
    return datetime.combine(date.min, value)


def _parse_event_datetime(raw: str | None, time_zone: str | None) -> datetime | None:
    if not raw:
        return None

    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        timezone = KYIV_TIMEZONE
        if time_zone:
            try:
                timezone = ZoneInfo(time_zone)
            except Exception:
                timezone = KYIV_TIMEZONE
        parsed = parsed.replace(tzinfo=timezone)

    return parsed.astimezone(KYIV_TIMEZONE)


def parse_busy_events(events: list[dict], day: date) -> list[BusyInterval]:
    intervals: list[BusyInterval] = []

    for event in events:
        start_data = event.get("start") or {}
        end_data = event.get("end") or {}

        if start_data.get("date"):
            try:
                start_day = date.fromisoformat(start_data["date"])
                end_day = date.fromisoformat(end_data.get("date") or start_data["date"])
            except ValueError:
                continue
            if start_day <= day < end_day:
                intervals.append((time.min, time.max))
            continue

        start = _parse_event_datetime(
            start_data.get("dateTime"), start_data.get("timeZone")
        )
        end = _parse_event_datetime(end_data.get("dateTime"), end_data.get("timeZone"))
        if start is None or end is None or end <= start:
            continue

        if not (start.date() <= day <= end.date()):
            continue

        start_time = start.time() if start.date() == day else time.min
        end_time = end.time() if end.date() == day else time.max
        if start.date() == end.date() == day and end_time <= start_time:
            continue

        intervals.append((start_time, end_time))

    return intervals


def generate_time_slots(start: time, end: time, slot_minutes: int) -> list[time]:
    if slot_minutes <= 0 or start >= end:
        return []

    current = datetime.combine(date.min, start)
    limit = datetime.combine(date.min, end)
    step = timedelta(minutes=slot_minutes)
    slots: list[time] = []

    while current + step <= limit:
        slots.append(current.time())
        current += step

    return slots


def exclude_busy_slots(
    slots: list[time], busy: list[BusyInterval], slot_minutes: int
) -> list[time]:
    duration = timedelta(minutes=slot_minutes)
    available: list[time] = []

    for slot in slots:
        slot_start = _as_datetime(slot)
        slot_end = slot_start + duration
        overlaps = any(
            _as_datetime(busy_start) < slot_end and _as_datetime(busy_end) > slot_start
            for busy_start, busy_end in busy
        )
        if not overlaps:
            available.append(slot)

    return available


def exclude_past_slots(
    slots: list[time],
    day: date,
    now: datetime | None = None,
    timezone: ZoneInfo = KYIV_TIMEZONE,
) -> list[time]:
    """Drop slots that have already started in the business timezone.

    Only the current business day is filtered. Future days keep every slot;
    past days return none. At 11:23 the 11:00 slot is gone while 11:30 stays.
    """
    current = now if now is not None else datetime.now(timezone)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone)
    current = current.astimezone(timezone)

    if day < current.date():
        return []
    if day > current.date():
        return list(slots)

    return [slot for slot in slots if slot > current.time()]


def format_slots(slots: list[time]) -> list[str]:
    return [slot.strftime("%H:%M") for slot in slots]
