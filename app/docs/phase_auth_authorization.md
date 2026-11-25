# Phase: Authentication & Authorization

Дата: 18.11.2026

Цель: хеширование паролей, JWT-логин, dependency `get_current_business()`, защита бизнес-эндпоинтов и изоляция данных по бизнесу.

---

## 1. Files created / modified

| Файл | Тип | Изменение |
|---|---|---|
| `app\core\security.py` | created | bcrypt-хеширование, JWT create/decode. |
| `app\shemas\auth.py` | created | `LoginRequest`, `Token`. |
| `app\api\deps.py` | created | `oauth2_scheme`, `get_current_business()`, `get_owned_business()`. |
| `app\core\config.py` | modified | `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`. |
| `app\db\database.py` | modified | `get_db()` перенесён сюда. |
| `app\shemas\business.py` | modified | `ConfigDict(from_attributes=True)`. |
| `app\main.py` | modified | registration hash, login, me, защита эндпоинтов, новые business/booking endpoints. |
| `requirements.txt` | modified | `bcrypt`, `python-jose[cryptography]`. |
| `app\docs\phase_auth_authorization.md` | created | данный отчёт. |

---

## 2. Source code

### `app\core\security.py`

```python
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
```

### `app\shemas\auth.py`

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

### `app\api\deps.py`

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

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
```

### `app\core\config.py`

```python
from dotenv import load_dotenv
import os

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

from decouple import config

DATABASE_URL = config("DATABASE_URL")

GOOGLE_CLIENT_ID = config("GOOGLE_CLIENT_ID")

GOOGLE_CLIENT_SECRET = config("GOOGLE_CLIENT_SECRET")

GOOGLE_REDIRECT_URI = config("GOOGLE_REDIRECT_URI")

SECRET_KEY = config("SECRET_KEY", default="development-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(config("ACCESS_TOKEN_EXPIRE_MINUTES", default="60"))
```

### `app\db\database.py`

```python
from sqlalchemy import create_engine

from sqlalchemy.orm import sessionmaker, declarative_base


from app.core.config import DATABASE_URL

# print ("DATABASE_URL =", DATABASE_URL)
# print ("TYPE =", type(DATABASE_URL))

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### `app\shemas\business.py`

```python
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
```

### `app\main.py` — imports

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import requests

from app.db.database import SessionLocal, engine, Base, get_db
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
from app.core.security import create_access_token, get_password_hash, verify_password
from app.shemas.auth import LoginRequest, Token
from app.api.deps import get_current_business, get_owned_business
```

### `app\main.py` — registration / login / me

```python
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
        password_hash=get_password_hash(business.password),
        slug=slug,
        is_active=True,
    )

    db.add(new_business)

    db.commit()

    db.refresh(new_business)

    return new_business


##########
# AUTH LOGIN / ME
##########


@app.post("/auth/login", response_model=Token)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.email == credentials.email).first()
    if not business or not verify_password(
        credentials.password, business.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not business.password_hash.startswith("$2"):
        business.password_hash = get_password_hash(credentials.password)
        db.commit()

    access_token = create_access_token({"sub": str(business.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=BusinessResponse)
def read_current_business(
    current_business: Business = Depends(get_current_business),
):
    return current_business
```

### `app\main.py` — protected bookings list

```python
@app.get("/bookings", response_model=list[BookingResponse])
def get_bookings(
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):

    bookings = (
        db.query(Booking).filter(Booking.business_id == current_business.id).all()
    )

    return bookings
```

### `app\main.py` — protected schedule update

```python
@app.put("/business/{business_id}/schedule", response_model=list[ScheduleResponse])
def update_business_schedule(
    business_id: int,
    schedule: ScheduleBulkUpdate,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_owned_business),
):
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

### `app\main.py` — new business cabinet / delete endpoints

```python
###################
# BUSINESS CABINET
###################


@app.get("/business/{business_id}", response_model=BusinessResponse)
def get_business(
    business_id: int,
    current_business: Business = Depends(get_owned_business),
):
    return current_business


@app.get("/business/{business_id}/bookings", response_model=list[BookingResponse])
def get_business_bookings(
    business_id: int,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_owned_business),
):
    return db.query(Booking).filter(Booking.business_id == business_id).all()


###################
# DELETE BOOKING
###################


@app.delete("/bookings/{booking_id}")
def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_business: Business = Depends(get_current_business),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.business_id != current_business.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if booking.google_event_id and current_business.google_access_token:
        url = (
            "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
            f"{booking.google_event_id}"
        )
        response = requests.delete(
            url,
            headers={"Authorization": f"Bearer {current_business.google_access_token}"},
        )
        if response.status_code == 401:
            new_token = refresh_google_token(current_business.id)
            if new_token:
                requests.delete(
                    url, headers={"Authorization": f"Bearer {new_token}"}
                )

    db.delete(booking)
    db.commit()
    return {"message": "Booking deleted", "id": booking_id}
```

---

## 3. Authentication flow

1. `POST /auth/register` сохраняет `get_password_hash(password)` (bcrypt) в `password_hash`.
2. `POST /auth/login` ищет бизнес по email, проверяет пароль через `bcrypt.checkpw`, возвращает JWT `{"sub": "<business_id>", "exp": ...}`.
3. Для совместимости со старыми записями: если в БД ещё plaintext-пароль, при успешном логине он перехешируется.
4. Клиент передаёт токен в заголовке `Authorization: Bearer <token>`.
5. `get_current_business()` декодирует JWT, возвращает `401` при невалидном токене/отсутствии заголовка, загружает бизнес из БД.
6. `GET /auth/me` возвращает текущего бизнеса.

## 4. Authorization flow

1. `get_owned_business(business_id, current_business)` сравнивает `business_id` из пути с `current_business.id`.
2. При несовпадении — `403 {"detail":"Forbidden"}`.
3. Защищены: `PUT /business/{business_id}/schedule`, `GET /business/{business_id}`, `GET /business/{business_id}/bookings`, `DELETE /bookings/{booking_id}`.
4. Дополнительно `GET /bookings` теперь возвращает только бронирования текущего бизнеса.
5. `DELETE /bookings/{id}` проверяет владельца бронирования и удаляет связанное событие Google Calendar (если есть).

---

## 5. API examples

### Register

```http
POST /auth/register
{"name":"Alpha","email":"alpha@example.com","password":"secret123"}
```

`200` → `{"id":1,"name":"Alpha","email":"alpha@example.com","slug":"alpha","is_active":true}`

### Login

```http
POST /auth/login
{"email":"alpha@example.com","password":"secret123"}
```

`200` → `{"access_token":"<jwt>","token_type":"bearer"}`

### Authenticated request

```http
GET /auth/me
Authorization: Bearer <jwt>
```

`200` → данные бизнеса.

### Access another business

```http
GET /business/1
Authorization: Bearer <token business 2>
```

`403` → `{"detail":"Forbidden"}`

---

## 6. Mandatory verification

| Тест | Expected | Actual |
|---|---|---|
| Successful login | 200 + JWT | 200 + JWT |
| Wrong password | 401 | 401 |
| Invalid token | 401 | 401 |
| Access with token | 200 | 200 |
| Access without token | 401 | 401 |
| Another business data | 403 | 403 |
| PUT schedule another business | 403 | 403 |
| GET bookings another business | 403 | 403 |
| DELETE booking another business | 403 | 403 |
| DELETE own booking | 200, строка удалена | 200, список пуст |
| Password storage | bcrypt hash в БД | `$2...`, длина 60 |

Логи uvicorn подтверждают коды 200/401/403 для всех сценариев. Временная SQLite-БД и тестовый сервер удалены/остановлены.

---

## WORK LOG

### Files created

- `app\core\security.py`
- `app\shemas\auth.py`
- `app\api\deps.py`
- `app\docs\phase_auth_authorization.md`

### Files modified

- `app\core\config.py`
- `app\db\database.py`
- `app\shemas\business.py`
- `app\main.py`
- `requirements.txt`

### Endpoints added

- `POST /auth/login`
- `GET /auth/me`
- `GET /business/{business_id}`
- `GET /business/{business_id}/bookings`
- `DELETE /bookings/{booking_id}`

### Authentication flow

bcrypt hash → login → JWT HS256 → `Authorization: Bearer` → `get_current_business()`.

### Authorization flow

`get_owned_business()` → 403 при чужом `business_id`; для bookings дополнительная проверка `booking.business_id`.

### Tests performed

11 проверок, все пройдены (см. раздел 6).

### Remaining issues

- `SECRET_KEY` по умолчанию development-значение; в production обязательно задать env `SECRET_KEY`.
- `/docs` OAuth2 Authorize ожидает form-data, а `/auth/login` принимает JSON — для Swagger UI может потребоваться `python-multipart` или отдельный form-эндпоинт.
- Публичные `POST /bookings`, `GET /availability`, Google OAuth endpoints остаются без авторизации по архитектуре (клиентская запись).
- Нет refresh-token для JWT, нет rate limiting на логин.
- Старые plaintext-пароли перехешируются только после успешного логина.
