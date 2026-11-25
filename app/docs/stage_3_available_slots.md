# Этап 3. Генерация свободных слотов

Дата: 18.11.2026

Цель: на основе `BusinessSchedule` и занятых событий Google Calendar вернуть список времени, доступного для записи.

---

## 1. Modified files

| Файл | Тип | Изменение |
|---|---|---|
| `app\services\availability.py` | created | Чистые функции: разбор событий календаря, генерация слотов, исключение занятых, форматирование. |
| `app\main.py` | modified | `GET /availability/{business_id}` переписан: считает weekday, читает расписание, генерирует слоты, вычитает busy, возвращает `available`. |
| `app\services\google_calendar.py` | modified | Исправлен `refresh_google_token()`: корректный `commit`, возврат `None`, закрытие сессии. |
| `app\docs\stage_3_available_slots.md` | created | Данный отчёт. |

---

## 2. Source code

### `app\services\availability.py`

```python
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


def format_slots(slots: list[time]) -> list[str]:
    return [slot.strftime("%H:%M") for slot in slots]
```

### `app\main.py` — импорты и endpoint availability

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
import requests

from app.db.database import SessionLocal, engine, Base
from app.models import booking
from app.models.booking import Booking
from app.shemas import business
from app.shemas.booking import BookingCreate, BookingResponse
from app.models.business import Business
from app.shemas.business import BusinessCreate, BusinessResponse
from app.services.google_calendar import get_google_auth_url
from app.services.google_calendar import refresh_google_token
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

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

@app.get("/availability/{business_id}")
def get_availability(business_id: int, date: date, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    schedule = (
        db.query(BusinessSchedule)
        .filter(
            BusinessSchedule.business_id == business_id,
            BusinessSchedule.weekday == date.weekday(),
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
        return {"available": []}

    slot_minutes = schedule.slot_minutes or 30
    slots = generate_time_slots(schedule.start_time, schedule.end_time, slot_minutes)

    if not business.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    params = {
        "timeMin": f"{date.isoformat()}T00:00:00Z",
        "timeMax": f"{date.isoformat()}T23:59:59Z",
        "singleEvents": True,
        "orderBy": "startTime",
    }
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {business.google_access_token}"},
        params=params,
    )

    if response.status_code == 401:
        new_token = refresh_google_token(business.id)
        if not new_token:
            raise HTTPException(status_code=502, detail="Unable to refresh Google token")
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {new_token}"},
            params=params,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Unable to read Google Calendar")

    busy = parse_busy_events(response.json().get("items", []), date)
    available = exclude_busy_slots(slots, busy, slot_minutes)
    return {"available": format_slots(available)}
```

### `app\services\google_calendar.py` — refresh

```python
def refresh_google_token(business_id: int) -> str | None:
    db = SessionLocal()
    try:
        business = db.query(Business).filter(Business.id == business_id).first()
        if not business or not business.google_refresh_token:
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
        access_token = token_data.get("access_token")
        if not access_token:
            return None

        business.google_access_token = access_token
        db.commit()
        return access_token
    finally:
        db.close()
```

---

## 3. Endpoint examples

### Request

```http
GET /availability/1?date=2026-11-16 HTTP/1.1
```

Параметр `date` теперь типизирован как `date` (FastAPI сам возвращает 422 за некорректный формат).

### Empty calendar

Расписание: Пн 09:00–18:00, слот 30 мин. Событий нет.

```json
{
  "available": [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
    "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"
  ]
}
```

### Busy events 10:00–11:00 и 14:00–15:00

```json
{
  "available": [
    "09:00", "09:30", "11:00", "11:30", "12:00", "12:30",
    "13:00", "13:30", "15:00", "15:30", "16:00", "16:30",
    "17:00", "17:30"
  ]
}
```

Примечание: в промпте для расписания 09:00–18:00 указаны только первые четыре слота (`09:00, 09:30, 11:00, 11:30`). Корректный результат для полного дня — 14 слотов (список выше). Четыре слота из примера получаются для расписания **09:00–12:00** с занятым 10:00–11:00 — этот случай тоже проверен.

### Weekend / closed day

```json
{"available": []}
```

### Errors

| Ситуация | Ответ |
|---|---|
| Бизнес не найден | `404 {"detail":"Business not found"}` |
| Google не подключён | `400 {"detail":"Google Calendar not connected"}` |
| Не удалось обновить токен | `502 {"detail":"Unable to refresh Google token"}` |
| Ошибка чтения календаря | `502 {"detail":"Unable to read Google Calendar"}` |

---

## 4. Mandatory verification

Проверка выполнялась непосредственным вызовом функции `get_availability()` с реальной SQLite-БД и подменённым `app.main.requests.get` (например, `unittest.mock.patch`). Production Neon не использовалась.

| # | Тест | Ожидаемый результат | Фактический результат |
|---|---|---|---|
| 1 | Empty calendar, Пн 09:00–18:00, 30 мин | 18 слотов от 09:00 до 17:30; 1 вызов Google | 18 слотов, 1 вызов |
| 2 | Busy 10:00–11:00 + 14:00–15:00 | исключены 10:00, 10:30, 14:00, 14:30; всего 14 | совпало |
| 3 | Пример из промпта 09:00–12:00, busy 10:00–11:00 | `["09:00","09:30","11:00","11:30"]` | совпало |
| 4 | Whole-day event | `{"available":[]}` | совпало |
| 5 | Weekend (воскресенье, строки расписания нет) | `{"available":[]}`, Google не вызывается | совпало, 0 вызовов |
| 6 | Closed day (`is_working=false`) | `{"available":[]}`, Google не вызывается | совпало, 0 вызовов |
| 7 | 401 → refresh token → повторный запрос | 1 refresh, 2 GET, второй с новым токеном | совпало |

Дополнительно: `python -m compileall -q app` — без ошибок.

---

## WORK LOG

### Files changed

- `app\services\availability.py` — создан.
- `app\main.py` — изменён endpoint availability и импорты.
- `app\services\google_calendar.py` — исправлен refresh токена.
- `app\docs\stage_3_available_slots.md` — создан.

### Algorithms added

1. Определение дня недели через `date.weekday()` (0 = Monday … 6 = Sunday).
2. Загрузка строки `BusinessSchedule` по `business_id` и `weekday`.
3. Генерация всех слотов от `start_time` до `end_time` с шагом `slot_minutes` (последний слот должен полностью помещаться в рабочий интервал).
4. Разбор событий Google Calendar с переводом в `Europe/Kyiv`; поддержка событий с `dateTime`, all-day событий и событий, пересекающих полночь.
5. Исключение любого слота, который пересекается с busy-интервалом (не только по времени начала).
6. Форматирование результата в `HH:MM`.
7. Ранний возврат `{"available":[]}` для выходного/закрытого дня без обращения к Google.

### Test cases

| Тест | Expected result |
|---|---|
| Empty calendar | полный список слотов рабочего дня |
| Busy 10:00–11:00, 14:00–15:00 | слоты, пересекающиеся с этими интервалами, отсутствуют |
| Weekend | пустой список, без запроса к Google |
| Closed day | пустой список, без запроса к Google |
| All-day event | пустой список |
| 401 refresh | повторный запрос с обновлённым токеном |

### Remaining issues

- `GET /availability/{business_id}` больше не возвращает `busy` и `business_id`/`date` — контракт изменён на `{ "available": [...] }` согласно ТЗ этапа.
- Нет кэширования ответов Google Calendar; при частых запросах будет много внешних вызовов.
- Нет учёта уже созданных локальных `Booking` — пока вычитаются только события Google. Если событие не создалось, слот может остаться доступным.
- У endpoint по-прежнему нет авторизации.
- Ранее отмеченный вывод `DATABASE_URL` в логах не исправлен.
