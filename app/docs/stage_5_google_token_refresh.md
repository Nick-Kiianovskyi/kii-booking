# Этап 5. Автообновление Google Token

Дата: 19.11.2026

Цель: устранить ошибку `401 Unauthorized` при обращении к Google Calendar — централизованно detected 401, обновить access token, сохранить его в БД и автоматически повторить оригинальный запрос.

---

## 1. Modified files

| Файл | Тип | Изменение |
|---|---|---|
| `app\services\google_calendar.py` | modified | `refresh_google_token()` принимает опциональную сессию; добавлен `google_api_request()` с refresh/retry. |
| `app\main.py` | modified | Импорт заменён на `google_api_request`; все 4 места прямых Google-вызовов мигрированы; `google_test_event()` использует общий `get_db`. |
| `app\docs\stage_5_google_token_refresh.md` | created | Данный отчёт. |

Новые production-файлы не потребовались — логика собрана в уже существующем сервисе.

---

## 2. Source code

### `app\services\google_calendar.py` (полный файл)

```python
import requests
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.business import Business
from app.core.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
)


def refresh_google_token(business_id: int, db: Session | None = None) -> str | None:
    owns_session = db is None
    session = db or SessionLocal()
    try:
        business = session.query(Business).filter(Business.id == business_id).first()
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
        session.commit()
        return access_token
    finally:
        if owns_session:
            session.close()


def google_api_request(
    method: str,
    url: str,
    business: Business,
    db: Session,
    **kwargs,
) -> requests.Response:
    headers = dict(kwargs.pop("headers", None) or {})
    headers["Authorization"] = f"Bearer {business.google_access_token}"

    response = requests.request(method, url, headers=headers, **kwargs)
    if response.status_code != 401:
        return response

    new_token = refresh_google_token(business.id, db)
    if not new_token:
        return response

    business.google_access_token = new_token
    headers["Authorization"] = f"Bearer {new_token}"
    return requests.request(method, url, headers=headers, **kwargs)


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
```

### `app\main.py` — imports

```python
from app.services.google_calendar import get_google_auth_url
from app.services.google_calendar import google_api_request
```

### `app\main.py` — availability (helper `_load_available_slots`)

```python
    params = {
        "timeMin": f"{day.isoformat()}T00:00:00Z",
        "timeMax": f"{day.isoformat()}T23:59:59Z",
        "singleEvents": True,
        "orderBy": "startTime",
    }
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

    response = google_api_request("GET", url, business, db, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Unable to read Google Calendar")

    busy = parse_busy_events(response.json().get("items", []), day)
    return exclude_busy_slots(slots, busy, slot_minutes), slot_minutes
```

### `app\main.py` — booking creation (создание события Google)

```python
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
        response = google_api_request(
            "POST",
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            business,
            db,
            headers={"Content-Type": "application/json"},
            json=event,
        )
        event_response = response.json()

        if "id" in event_response:
            new_booking.google_event_id = event_response["id"]

        db.commit()
```

### `app\main.py` — `google_test_event()`

```python
@app.get("/google/test-event/{business_id}")
def google_test_event(business_id: int, db: Session = Depends(get_db)):

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        return {"error": "Business not found"}

    event = {
        "summary": "KII Booking Test",
        "description": "First test event",
        "start": {"dateTime": "2026-11-17T10:00:00", "timeZone": "Europe/Kyiv"},
        "end": {"dateTime": "2026-11-17T11:00:00", "timeZone": "Europe/Kyiv"},
    }
    response = google_api_request(
        "POST",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        business,
        db,
        headers={"Content-Type": "application/json"},
        json=event,
    )

    return response.json()
```

### `app\main.py` — `delete_booking()` (удаление события Google)

```python
    if booking.google_event_id and current_business.google_access_token:
        url = (
            "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
            f"{booking.google_event_id}"
        )
        google_api_request("DELETE", url, current_business, db)

    db.delete(booking)
    db.commit()
    return {"message": "Booking deleted", "id": booking_id}
```

---

## 3. Implementation details

1. **Централизация.** Вместо четырёх дублирующихся блоков `if response.status_code == 401:` в `main.py` используется один helpers `google_api_request()`. Он вызывается для любого Bearer-запроса к Google Calendar.
2. **Разделение сессий.** `refresh_google_token(business_id, db=None)` может работать:
   - со своей сессией (`SessionLocal()`) — тогда он её закрывает в `finally`;
   - с сессией вызывающего эндпоинта — тогда он делает `commit()` и **не** закрывает сессию, поэтому объект `Business` в эндпоинте видит новый токен.
3. **Один повтор.** `google_api_request()` делает максимум один retry — после повторной 401 запрос возвращается как есть (защита от бесконечного цикла).
4. **Сохранение токена.** Новый `access_token` записывается в `business.google_access_token` и коммитится в той же сессии; `refresh_token` не меняется (Google его не возвращает при refresh).
5. **Заголовки.** `Authorization` всегда перезаписывается из актуального токена; остальные заголовки (например `Content-Type: application/json`) и `params`/`json` сохраняются и переиспользуются при повторе.
6. **Неуспешный refresh.** Если нет `google_refresh_token` или OAuth вернул ошибку, исходный 401 возвращается вызывающему; availability превращает его в `502 Unable to read Google Calendar`, остальные вызовы просто продолжают работу со старым ответом.
7. **Оставшийся `requests` в `main.py`.** `import requests` сохранён только для `POST /google/callback` (обмен `code` на токены — не Bearer-запрос к Calendar API).

---

## 4. Mandatory verification

Проверка performed на временной SQLite-БД с подменёнными `app.services.google_calendar.requests.request` (Calendar API) и `...requests.post` (OAuth token endpoint). Реальные Google API не вызывались.

| Шаг | Что проверялось | Результат |
|---|---|---|
| 1. Simulate expired token | `google_access_token = "EXPIRED_TOKEN"`; первый вызов каждого метода возвращает 401 | PASS |
| 2. Perform refresh | token endpoint вызван 1 раз, `grant_type=refresh_token`, получен `NEW_TOKEN`, БД обновлена | PASS |
| 3. Retry Google request | Повторный вызов с `Authorization: Bearer NEW_TOKEN`, тот же метод/url/params/json | PASS |
| 4. Verify success | Availability вернул слоты 09:00…; бронирование создано с `google_event_id=evt-stage5`; событие удалено; test-event вернул id | PASS |
| Extra: refresh failure | Ошибка refresh → 502, повтора нет, токен в БД остался `EXPIRED_TOKEN` | PASS |

Команда: `python C:\Users\nick\AppData\Local\Temp\opencode\verify_stage5.py` → `ALL STAGE 5 CHECKS PASSED`.
Дополнительно: `python -m compileall -q app` → OK; `from app.main import app` → OK (20 routes).
Временная БД `kii-stage5-test.db` удалена после проверки.

---

## WORK LOG

### Helper functions added

- `google_api_request(method, url, business, db, **kwargs)` — выполняет Bearer-запрос, детектит 401, обновляет токен и один раз повторяет запрос.
- `refresh_google_token(business_id, db=None)` — расширен: теперь принимает сессию вызывающего, коммитит новый токен и закрывает только собственную сессию.

### Endpoints affected

- `GET /availability/{business_id}` — чтение busy-событий через helper.
- `POST /bookings` — создание события Google Calendar через helper.
- `GET /google/test-event/{business_id}` — тестовое создание события через helper (переведён на общий `get_db`).
- `DELETE /bookings/{booking_id}` — удаление события Google Calendar через helper.
- `GET /google/callback` — не изменён (обмен кода на токены, не Bearer-запрос).

### Refresh flow description

`Bearer <старый токен>` → ответ 401 → `refresh_google_token()` POST на `oauth2.googleapis.com/token` с `refresh_token` → новый `access_token` сохраняется в `business.google_access_token` и коммитится → заголовок перезаписывается → original request повторяется один раз → результат возвращается вызывающему эндпоинту. При провале refresh/original 401 отдаётся без повтора.

### Test results

5/5 проверок пройдены: availability, booking creation, event delete, event create, refresh failure. compileall и импорт приложения — успешно. Реальные Google API и production-БД не задействованы.

### Remaining issues

- Refresh-token может быть отозван Google — тогда пользователю нужно заново пройти OAuth (`GET /google/connect/{business_id}`).
- Нет отдельной обработки ошибки Google `invalid_grant` (сейчас просто 502 на availability).
- Токен обновляется только по факту 401, а не заранее по `expires_in`.
