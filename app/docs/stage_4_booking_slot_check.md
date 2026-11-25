# Этап 4. Проверка свободного времени перед записью

Дата: 18.11.2026

Цель: запретить создание бронирования в занятый или несуществующий слот.

---

## 1. Modified files

| Файл | Тип | Изменение |
|---|---|---|
| `app\main.py` | modified | Добавлен `_load_available_slots()`, переписан `POST /bookings`, упрощён `GET /availability`. |
| `app\docs\stage_4_booking_slot_check.md` | created | Данный отчёт. |

---

## 2. Source code

### `app\main.py` — общий загрузчик доступных слотов

```python
def _load_available_slots(
    business: Business, day: date, db: Session
) -> tuple[list, int]:
    schedule = (
        db.query(BusinessSchedule)
        .filter(
            BusinessSchedule.business_id == business.id,
            BusinessSchedule.weekday == day.weekday(),
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
        return [], 30

    slot_minutes = schedule.slot_minutes or 30
    slots = generate_time_slots(schedule.start_time, schedule.end_time, slot_minutes)

    if not business.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    params = {
        "timeMin": f"{day.isoformat()}T00:00:00Z",
        "timeMax": f"{day.isoformat()}T23:59:59Z",
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

    busy = parse_busy_events(response.json().get("items", []), day)
    return exclude_busy_slots(slots, busy, slot_minutes), slot_minutes
```

### `app\main.py` — `POST /bookings`

```python
@app.post("/bookings")

##################
#  CREATE BOOKING
#####################


def create_booking(booking: BookingCreate, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.id == booking.business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    if booking.start_time >= booking.end_time:
        raise HTTPException(
            status_code=400, detail="Start time must be before end time."
        )

    available_slots, slot_minutes = _load_available_slots(business, booking.date, db)
    if booking.start_time not in available_slots:
        raise HTTPException(status_code=400, detail="Selected slot is unavailable")

    current = datetime.combine(date.min, booking.start_time)
    end = datetime.combine(date.min, booking.end_time)
    step = timedelta(minutes=slot_minutes)
    while current < end:
        if current.time() not in available_slots:
            raise HTTPException(status_code=400, detail="Selected slot is unavailable")
        current += step

    existing_booking = (
        db.query(Booking)
        .filter(
            Booking.business_id == booking.business_id,
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
            if not new_token:
                raise HTTPException(status_code=502, detail="Unable to refresh Google token")
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
```

### `app\main.py` — `GET /availability/{business_id}`

```python
@app.get("/availability/{business_id}")
def get_availability(business_id: int, date: date, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    available, _ = _load_available_slots(business, date, db)
    return {"available": format_slots(available)}
```

---

## 3. API examples

### Свободный слот

Request:

```http
POST /bookings HTTP/1.1
Content-Type: application/json

{
  "business_id": 1,
  "client_name": "Иван",
  "phone": "+380000000000",
  "service": "Стрижка",
  "date": "2026-11-16",
  "start_time": "09:00",
  "end_time": "09:30"
}
```

Response `200 OK`:

```json
{"message": "Booking created", "id": 1}
```

### Занятый слот

```http
POST /bookings HTTP/1.1
Content-Type: application/json

{
  "business_id": 1,
  "client_name": "Пётр",
  "phone": "+380000000001",
  "service": "Стрижка",
  "date": "2026-11-16",
  "start_time": "10:00",
  "end_time": "10:30"
}
```

Response `400 Bad Request`:

```json
{"detail": "Selected slot is unavailable"}
```

### Некорректный слот

- время вне расписания (`08:00`);
- время не на сетке (`09:15` при `slot_minutes=30`);
- интервал, часть которого попадает в занятый слот.

Ответ тот же:

```json
{"detail": "Selected slot is unavailable"}
```

---

## 4. Mandatory verification

Проверка выполнялась прямым вызовом `create_booking()` с реальной SQLite-БД и подменёнными `requests.get` / `requests.post`.

| # | Тест | Expected | Actual |
|---|---|---|---|
| 1 | Free slot 09:00–09:30, пустой календарь | Booking создан, вызвано 1 событие Google | `{'message':'Booking created','id':1}`, 1 POST |
| 2 | Busy slot 10:00–10:30, событие 10:00–11:00 | 400 `Selected slot is unavailable`, записи нет | совпало |
| 3 | Invalid slot 08:00–08:30 (вне расписания) | 400 `Selected slot is unavailable` | совпало |
| 4 | Invalid slot 09:15–09:45 (не на сетке) | 400 `Selected slot is unavailable` | совпало |
| 5 | Частично занятый интервал 09:00–10:00, busy 09:30–10:00 | 400 `Selected slot is unavailable` | совпало |
| 6 | То же время, но другой бизнес | Booking создан | `{'message':'Booking created','id':2}` |

Дополнительно: `python -m compileall -q app` — без ошибок.

---

## WORK LOG

### Business rules added

1. Перед созданием бронирования загружаются доступные слоты бизнеса на запрошенную дату.
2. `start_time` обязан присутствовать в списке доступных слотов.
3. Весь запрошенный интервал `[start_time, end_time)` должен состоять из доступных слотов — это защищает от частичного пересечения с занятым временем.
4. Запрещена запись вне расписания, в выходной/закрытый день и на время, не совпадающее с сеткой `slot_minutes`.
5. Отказ возвращает `400 {"detail":"Selected slot is unavailable"}`.
6. Проверка пересечения с уже существующими локальными бронированиями теперь учитывает `business_id` (раньше проверяла все бронирования в БД).

### Modified functions

- `_load_available_slots()` — новая, вынесена из `get_availability()`, переиспользуется созданием бронирования.
- `create_booking()` — добавлена проверка доступности, исправлен порядок проверок, исправлена область проверки пересечений, устранён дублирующий `return`, `return` вынесен из блока Google-синхронизации.
- `get_availability()` — теперь тонкая обёртка над `_load_available_slots()`.

### Test scenarios

| Сценарий | Результат |
|---|---|
| Free slot | 200, бронирование создано, событие в Google отправлено |
| Busy slot | 400, бронирование не создано |
| Invalid slot (вне расписания) | 400, бронирование не создано |
| Invalid slot (off-grid) | 400, бронирование не создано |
| Частично занятый интервал | 400, бронирование не создано |
| Другой бизнес | 200, бронирование создано |

### Results

- Все 6 сценариев прошли.
- Подтверждено: отказ не создаёт строк в `bookings` и не отправляет события в Google.
- Компиляция проекта — OK.

### Remaining issues

- Проверка доступности делает синхронный запрос к Google Calendar на каждый `POST /bookings`; нет кэша и оптимистичной блокировки (два параллельных запроса могут получить один слот).
- Если событие Google не создалось, локальное бронирование всё равно сохраняется.
- У эндпоинтов по-прежнему нет авторизации.
- Не исправлен вывод `DATABASE_URL` в логах `app\db\database.py`.
