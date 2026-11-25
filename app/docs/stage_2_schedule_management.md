# Этап 2. Управление расписанием бизнеса

Дата: 18.11.2026

Цель: редактирование рабочего графика бизнеса через `PUT /business/{business_id}/schedule` с валидацией и полной заменой существующих записей.

---

## 1. Complete source code

### `app\shemas\business_schedule.py`

```python
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
```

### `app\main.py`

Изменены импорт схем и добавлен endpoint `PUT`. Полное содержимое файла:

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
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
from app.models.business_schedule import BusinessSchedule
from app.shemas.business_schedule import (
    ScheduleBulkUpdate,
    ScheduleItem,
    ScheduleResponse,
)

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

Base.metadata.create_all(bind=engine)

app = FastAPI(title="KII Booking")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def root():
    return {"message": "KII Booking API"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/bookings")

##################
#  CREATE BOOKING
#####################


def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.date == booking.date,
            Booking.start_time < booking.end_time,
            Booking.end_time > booking.start_time,
        )
        .first()
    )

    if existing_booking:
        raise HTTPException(
            status_code=400, detail="Time slot is already booked for the selected date."
        )

    business = db.query(Business).filter(Business.id == booking.business_id).first()
    if booking.start_time >= booking.end_time:
        raise HTTPException(
            status_code=400, detail="Start time must be before end time."
        )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    new_booking = Booking(
        business_id=booking.business_id,
        client_name=booking.client_name,
        phone=booking.phone,
        service=booking.service,
        date=booking.date,
        start_time=booking.start_time,
        end_time=booking.end_time,
    )

    db.add(new_booking)

    db.commit()

    db.refresh(new_booking)
    if business.google_connected and business.google_access_token:
        event = {
            "summary": f"{booking.service} - {booking.client_name}",
            "description": f"Phone: {booking.phone}",
            "start": {
                "dateTime": f"{booking.date}T{booking.start_time}",
                "timeZone": "Europe/Kyiv",
            },
            "end": {
                "dateTime": f"{booking.date}T{booking.end_time}",
                "timeZone": "Europe/Kyiv",
            },
        }
        response = requests.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={
                "Authorization": f"Bearer {business.google_access_token}",
                "Content-Type": "application/json",
            },
            json=event,
        )
        if response.status_code == 401:
            new_token = refresh_google_token(business.id)
            response = requests.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={
                    "Authorization": f"Bearer {new_token}",
                    "Content-Type": "application/json",
                },
                json=event,
            )
        event_response = response.json()

        if "id" in event_response:

            new_booking.google_event_id = event_response["id"]

        db.commit()

        return {"message": "Booking created", "id": new_booking.id}
        return {"message": "Booking created", "id": new_booking.id}


@app.get("/bookings", response_model=list[BookingResponse])
def get_bookings(db: Session = Depends(get_db)):

    bookings = db.query(Booking).all()

    return bookings


###################
# REGISTER BUSINESS
#####################


@app.post("/auth/register", response_model=BusinessResponse)
def register_business(business: BusinessCreate, db: Session = Depends(get_db)):

    existing_business = (
        db.query(Business).filter(Business.email == business.email).first()
    )

    if existing_business:
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = business.name.lower().replace(" ", "-")

    new_business = Business(
        name=business.name,
        email=business.email,
        password_hash=business.password,  # временно
        slug=slug,
        is_active=True,
    )

    db.add(new_business)

    db.commit()

    db.refresh(new_business)

    return new_business


#######
# GOOGLE CONNECTION
#######


@app.get("/google/connect/{business_id}")
def connect_google(business_id: int):
    return {"auth_url": get_google_auth_url(business_id)}


#####
# GOOGLE CALLBACK
#####
@app.get("/google/callback")
def google_callback(code: str, state: str):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    response = requests.post(token_url, data=data)
    token_response = response.json()
    business_id = state
    db = SessionLocal()
    business = db.query(Business).filter(Business.id == int(business_id)).first()

    if not business:
        return {"error": "Business not found"}

    business.google_access_token = token_response["access_token"]
    business.google_refresh_token = token_response["refresh_token"]
    business.google_connected = True
    db.commit()
    return {"message": "Google connected", "business_id": business_id}


#####
# test
#####


@app.get("/google/test-event/{business_id}")
def google_test_event(business_id: int):

    db = SessionLocal()

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        return {"error": "Business not found"}

    event = {
        "summary": "KII Booking Test",
        "description": "First test event",
        "start": {"dateTime": "2026-11-17T10:00:00", "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": "2026-11-17T11:00:00", "timeZone": "Europe/Kyiv"},
    }
    print("BUSINESS =", business_id)
    print("GOOGLE ACCESS TOKEN =", business.google_access_token[:20])
    response = requests.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers={
            "Authorization": f"Bearer {business.google_access_token}",
            "Content-Type": "application/json",
        },
        json=event,
    )

    return response.json()


#########
# AVAILABILITY CHECK
#########
@app.get("/availability/{business_id}")
def get_availability(business_id: int, date: str):
    db = SessionLocal()
    business = db.query(Business).filter(Business.id == business_id).first()

    if not business:
        return {"error": "Business not found"}

    bookings = db.query(Booking).filter(Booking.business_id == business_id).first()

    if not business:
        return {"error": "Business not found"}

    if not business.google_access_token:

        return {"error": "Google Calendar not connected"}

    start_of_day = f"{date}T00:00:00Z"
    end_of_day = f"{date}T23:59:59Z"

    params = {
        "timeMin": start_of_day,
        "timeMax": end_of_day,
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
            return {"error": "Unable to refresh Google token"}

        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {new_token}"},
            params=params,
        )

    data = response.json()
    print("GOOGLE CALENDAR RESPONSE =", data)
    print("GOOGLE CALENDAR DATA =", data)
    busy_slots = []

    for event in data.get("items", []):
        start = event.get("start", {}).get("dateTime")
        end = event.get("end", {}).get("dateTime")
        if start and end:
            start_time = datetime.fromisoformat(start.replace("Z", "+00:00")).strftime(
                "%H:%M"
            )
            end_time = datetime.fromisoformat(end.replace("Z", "+00:00")).strftime(
                "%H:%M"
            )
            busy_slots.append(
                {
                    "start": start_time,
                    "end": end_time,
                    "summary": event.get("summary", ""),
                }
            )

    return {"business_id": business_id, "date": date, "busy": busy_slots}


######
# GET BUSINESS SCHEDULE
####
@app.get("/business/{business_id}/schedule", response_model=list[ScheduleResponse])
def get_business_schedule(business_id: int, db: Session = Depends(get_db)):

    schedule = (
        db.query(BusinessSchedule)
        .filter(BusinessSchedule.business_id == business_id)
        .order_by(BusinessSchedule.weekday)
        .all()
    )

    return schedule


@app.put("/business/{business_id}/schedule", response_model=list[ScheduleResponse])
def update_business_schedule(
    business_id: int,
    schedule: ScheduleBulkUpdate,
    db: Session = Depends(get_db),
):
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    db.query(BusinessSchedule).filter(
        BusinessSchedule.business_id == business_id
    ).delete(synchronize_session=False)

    new_schedule = [
        BusinessSchedule(
            business_id=business_id,
            weekday=item.weekday,
            start_time=item.start_time,
            end_time=item.end_time,
            slot_minutes=item.slot_minutes,
            is_working=item.is_working,
        )
        for item in sorted(schedule.root, key=lambda item: item.weekday)
    ]
    db.add_all(new_schedule)
    db.commit()

    for item in new_schedule:
        db.refresh(item)

    return new_schedule
```

---

## 2. Files modified / created

| Файл | Тип | Изменение |
|---|---|---|
| `app\shemas\business_schedule.py` | modified | Переписаны схемы: `ScheduleItem`, `ScheduleBulkUpdate` (RootModel для «голого» массива), `ScheduleResponse` с `from_attributes`. Добавлены валидаторы. |
| `app\main.py` | modified | Добавлен импорт `ScheduleBulkUpdate`; добавлен `PUT /business/{business_id}/schedule`. Существующий `GET` оставлен без изменений. |
| `app\docs\stage_2_schedule_management.md` | created | Данный отчёт: код, примеры, тесты, WORK LOG. |

---

## 3. API examples

### GET /business/{business_id}/schedule

Request:

```http
GET /business/1/schedule HTTP/1.1
```

Response `200 OK`:

```json
[
  {
    "weekday": 0,
    "start_time": "09:00:00",
    "end_time": "18:00:00",
    "slot_minutes": 30,
    "is_working": true,
    "id": 1
  },
  {
    "weekday": 6,
    "start_time": null,
    "end_time": null,
    "slot_minutes": 30,
    "is_working": false,
    "id": 3
  }
]
```

### PUT /business/{business_id}/schedule

Принимается **массив** (обёртка не нужна).

Request:

```http
PUT /business/1/schedule HTTP/1.1
Content-Type: application/json
```

```json
[
  {"weekday": 0, "start_time": "09:00", "end_time": "18:00", "slot_minutes": 30, "is_working": true},
  {"weekday": 1, "start_time": "09:00", "end_time": "18:00", "slot_minutes": 30, "is_working": true},
  {"weekday": 6, "start_time": null, "end_time": null, "slot_minutes": 30, "is_working": false}
]
```

Response `200 OK`:

```json
[
  {"weekday": 0, "start_time": "09:00:00", "end_time": "18:00:00", "slot_minutes": 30, "is_working": true, "id": 1},
  {"weekday": 1, "start_time": "09:00:00", "end_time": "18:00:00", "slot_minutes": 30, "is_working": true, "id": 2},
  {"weekday": 6, "start_time": null, "end_time": null, "slot_minutes": 30, "is_working": false, "id": 3}
]
```

Пример замены расписания одним днём:

```json
[
  {"weekday": 2, "start_time": "10:00", "end_time": "15:00", "slot_minutes": 60, "is_working": true}
]
```

Response `200 OK`:

```json
[
  {"weekday": 2, "start_time": "10:00:00", "end_time": "15:00:00", "slot_minutes": 60, "is_working": true, "id": 1}
]
```

Пример ошибки валидации (`start_time >= end_time`) — `422 Unprocessable Content`:

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", 0],
      "msg": "Value error, start_time must be before end_time",
      "input": {"weekday": 0, "start_time": "18:00", "end_time": "09:00", "slot_minutes": 30, "is_working": true}
    }
  ]
}
```

Ответ для несуществующего бизнеса — `404 Not Found`:

```json
{"detail": "Business not found"}
```

---

## 4. Testing instructions

Тесты выполнялись на **временной SQLite-БД**,-production Neon не трогалась.

### 4.1 Подготовка

```powershell
# в корне проекта
python -m compileall -q app

$env:DATABASE_URL = 'sqlite:///C:/Users/nick/AppData/Local/Temp/opencode/kii-schedule-test.db'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

### 4.2 Создание тестового бизнеса

```powershell
curl.exe -s -X POST http://127.0.0.1:8002/auth/register `
  -H "Content-Type: application/json" `
  -d '{"name":"Test Barber","email":"test.barber@example.com","password":"secret"}'
```

Ожидается `200 OK` с `id: 1`.

### 4.3 Позитивные запросы

```powershell
curl.exe -s -X PUT http://127.0.0.1:8002/business/1/schedule -H "Content-Type: application/json" -d @schedule_ok.json
curl.exe -s      http://127.0.0.1:8002/business/1/schedule
curl.exe -s -X PUT http://127.0.0.1:8002/business/1/schedule -H "Content-Type: application/json" -d @schedule_replace.json
```

### 4.4 Проверка сохранения в БД

```powershell
python -c "import sqlite3; c=sqlite3.connect(r'C:\Users\nick\AppData\Local\Temp\opencode\kii-schedule-test.db'); print(c.execute('select id,weekday,start_time,end_time,slot_minutes,is_working from business_schedules').fetchall())"
```

### 4.5 Негативные запросы

| Файл payload | Изменение | Ожидаемый код |
|---|---|---|
| `schedule_bad_weekday.json` | `weekday: 7` | 422 |
| `schedule_bad_time_order.json` | `18:00` → `09:00` | 422 |
| `schedule_bad_slot.json` | `slot_minutes: 0` | 422 |
| `schedule_duplicate.json` | два раза `weekday: 0` | 422 |
| `schedule_missing_times.json` | `is_working: true`, времена `null` | 422 |
| любой валидный payload, `business_id=999` | бизнес не существует | 404 |

---

## 5. Mandatory verification

### Test requests and responses

| # | Request | Expected | Actual |
|---|---|---|---|
| 1 | `POST /auth/register` | 200, `id=1` | 200, `id=1` |
| 2 | `PUT /business/1/schedule` (3 дня) | 200, 3 записи | 200, 3 записи |
| 3 | `GET /business/1/schedule` | 200, те же 3 записи | 200, идентично |
| 4 | Прямой SQL-запрос к таблице | 3 строки с weekday 0,1,6 | `(1,1,0,'09:00:00.000000','18:00:00.000000',30,1)`, `(2,1,1,...,30,1)`, `(3,1,6,None,None,30,0)` |
| 5 | `PUT` с одним днём (weekday=2) | 200, 1 запись | 200, 1 запись |
| 6 | Прямой SQL-запрос после замены | только 1 строка weekday=2 | `[(1, 2, '10:00:00.000000', '15:00:00.000000', 60, 1)]` |
| 7 | `weekday=7` | 422 | 422 |
| 8 | `start_time >= end_time` | 422 | 422 |
| 9 | `slot_minutes=0` | 422 | 422 |
| 10 | дубль `weekday` | 422 | 422 |
| 11 | рабочий день без времени | 422 | 422 |
| 12 | `PUT /business/999/schedule` | 404 | 404 |
| 13 | SQL после всех 422 | данные не изменились | осталась только строка weekday=2 |

Логи uvicorn подтверждают коды: `200 OK` для позитивных запросов, пять `422 Unprocessable Content`, один `404 Not Found`.

### Дополнительно

- `python -m compileall -q app` — без ошибок.
- Импорт приложения и регистрация роутов:
  `('/business/{business_id}/schedule', ['GET'])`, `('/business/{business_id}/schedule', ['PUT'])`.
- Тестовый сервер остановлен, временные файлы удалены.

---

## WORK LOG

### Files created

- `app\docs\stage_2_schedule_management.md` — отчёт по этапу.

### Files modified

- `app\shemas\business_schedule.py`
- `app\main.py`

### Endpoints added

- `PUT /business/{business_id}/schedule` — полная замена расписания бизнеса.

### Validation rules added

- `weekday` — целое число от `0` до `6` (`Field(ge=0, le=6)`).
- `slot_minutes` — строго больше нуля (`Field(gt=0)`).
- Для рабочего дня (`is_working=true`) `start_time` и `end_time` обязательны и `start_time < end_time`.
- Для выходного дня времена принудительно обнуляются (`null`).
- `weekday` уникален в пределах одного `PUT` (защита от дублей).
- Отсутствие бизнеса → `404 Business not found`.

### Test results

- Все 13 проверок из раздела 5 пройдены.
- Сохранение в БД подтверждено прямым SQL-запросом до и после замены расписания.
- Невалидные запросы не изменяют данные в БД.

### Remaining issues

- `GET /business/{business_id}/schedule` по-прежнему возвращает `[]` для несуществующего бизнеса (404 не добавлен, чтобы не менять поведение предыдущего этапа).
- У schedule-эндпоинтов нет авторизации/проверки владельца бизнеса: любой клиент может перезаписать график. Требуется отдельный этап auth.
- `PUT` реализован как полная замена; частичное обновление одного дня не поддерживается (соответствует ТЗ).
- Из предыдущих этапов остались: вывод `DATABASE_URL` с секретом в `app\db\database.py`, логические ошибки в `refresh_google_token()`, дублирующий `return` в `create_booking`, неиспользуемая переменная `bookings` в `get_availability`.
- Фронтенд для настройки графика отсутствует (по плану проекта).
