# Check: DELETE /bookings/{booking_id}

Дата: 19.11.2026

Цель: привести удаление бронирования к заданному поведению — найти бронирование, прочитать `google_event_id`, удалить событие Google Calendar, удалить запись из БД и вернуть `{"message": "Booking deleted"}`.

---

## 1. Modified files

| Файл | Тип | Изменение |
|---|---|---|
| `app\services\google_calendar.py` | modified | Добавлен helper `delete_google_event()` с обработкой 404/410 и сетевых ошибок. |
| `app\main.py` | modified | Импорт helper'а; `delete_booking()` переписан под требуемый поток и формат ответа. |
| `app\docs\delete_booking_check.md` | created | Данный отчёт. |

---

## 2. Source code

### `app\services\google_calendar.py` — новый helper

```python
def delete_google_event(event_id: str, business: Business, db: Session) -> bool:
    """Delete a Calendar event.

    Returns True when the event was deleted or was already gone (404/410).
    Returns False on a Google/network error so the caller can keep the booking.
    """
    url = (
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/"
        f"{event_id}"
    )
    try:
        response = google_api_request("DELETE", url, business, db)
    except requests.RequestException:
        return False

    return response.status_code in (200, 202, 204, 404, 410)
```

### `app\main.py` — импорт

```python
from app.services.google_calendar import google_api_request, delete_google_event
```

### `app\main.py` — `DELETE /bookings/{booking_id}`

```python
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

    google_event_id = booking.google_event_id
    if google_event_id:
        if not current_business.google_access_token or not delete_google_event(
            google_event_id, current_business, db
        ):
            raise HTTPException(
                status_code=502, detail="Unable to delete Google Calendar event"
            )

    db.delete(booking)
    db.commit()
    return {"message": "Booking deleted"}
```

---

## 3. API examples

### Успешное удаление

```http
DELETE /bookings/12
Authorization: Bearer <jwt>
```

```json
{ "message": "Booking deleted" }
```

### Бронирование не найдено

```http
DELETE /bookings/999999
Authorization: Bearer <jwt>
```

`404` → `{"detail":"Booking not found"}`

### Чужое бронирование

```http
DELETE /bookings/12
Authorization: Bearer <jwt another business>
```

`403` → `{"detail":"Forbidden"}`

### Событие уже удалено в Google

```http
DELETE /bookings/12
Authorization: Bearer <jwt>
```

`200` → `{"message":"Booking deleted"}` — Google вернул `404`, helper считает это успехом, запись удаляется.

### Ошибка Google

```http
DELETE /bookings/12
Authorization: Bearer <jwt>
```

`502` → `{"detail":"Unable to delete Google Calendar event"}` — бронирование **остаётся** в БД, можно повторить позже.

---

## 4. Deletion flow

1. `db.query(Booking).filter(Booking.id == booking_id).first()` — поиск бронирования.
2. Если нет — `404 Booking not found`. Если владелец не текущий бизнес — `403 Forbidden`.
3. Сохраняем `google_event_id` в локальную переменную **до** удаления строки.
4. Если `google_event_id` есть:
   - нет `google_access_token` → `502`;
   - вызывается `delete_google_event()`, который через `google_api_request()` делает `DELETE` (с автообновлением токена при 401);
   - `200/202/204` — удалено; `404/410` — уже удалено; любое другое состояние или сетевое исключение → `False` → `502`.
5. Только после успеха Google-части: `db.delete(booking)` + `db.commit()`.
6. Возврат ровно `{"message": "Booking deleted"}`.

---

## 5. Edge cases

| Случай | Поведение |
|---|---|
| Booking не найден | `404 Booking not found` |
| Чужой бизнес | `403 Forbidden` (изоляция сохранена с предыдущего этапа) |
| `google_event_id` отсутствует | Google не вызывается, бронирование удаляется |
| Нет `google_access_token` | `502`, бронирование не удаляется |
| Событие уже удалено (`404`) | Считается успехом, бронирование удаляется |
| `410 Gone` | Считается успехом |
| Google `500`/`403` и др. | `502`, бронирование остаётся в БД |
| Сетевой `RequestException` | `502`, бронирование остаётся в БД |
| Google `401` | `refresh_google_token()` → повтор `DELETE` (Stage 5) |

---

## 6. Mandatory verification

Проверка performed на временной SQLite-БД с подменёнными HTTP-вызовами Google (реальные API не вызывались).

| Шаг | Expected | Actual |
|---|---|---|
| 1. Create booking | Бронирование + event `evt-1` в хранилище | PASS |
| 2. Verify event exists | `google_event_id == "evt-1"`, event в store | PASS |
| 3. Delete booking | `{"message":"Booking deleted"}`, DELETE вызван | PASS |
| 4. Verify event removed | event удалён из store, строка БД удалена | PASS |
| Booking not found | 404 | PASS |
| Event already deleted | «404» → бронирование удалено | PASS |
| Google error 500 | 502, бронирование и event остались | PASS |
| 401 → refresh → retry | 2 DELETE, 1 refresh, успех | PASS |
| No `google_event_id` | DELETE не вызывался | PASS |

Команда: `python C:\Users\nick\AppData\Local\Temp\opencode\verify_delete_booking.py` → `ALL DELETE CHECKS PASSED`.
Дополнительно: `python -m compileall -q app` → OK; `from app.main import app` → OK.

---

## WORK LOG

### Files modified

- `app\services\google_calendar.py` — добавлен `delete_google_event()`.
- `app\main.py` — обновлён импорт и `delete_booking()`.
- `app\docs\delete_booking_check.md` — отчёт.

### Deletion flow

Find booking → ownership check → read `google_event_id` → delete Google event (через `google_api_request` с refresh/retry) → delete DB row → `{"message":"Booking deleted"}`.

### Edge cases

Обработаны: отсутствующее бронирование (404), чужой бизнес (403), отсутствующий event id, отсутствующий токен (502), уже удалённое событие (404/410), ошибки Google и сетевые ошибки (502 с сохранением бронирования), истёкший токен (401 → refresh → retry).

### Verification results

9/9 проверок пройдены, включая обязательные 4 шага. compileall и импорт приложения — успешно. Production-БД и реальные Google API не задействованы.
