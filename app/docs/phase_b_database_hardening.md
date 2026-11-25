# Phase B — Database Hardening

Дата: 19.11.2026

Цель: повысить надёжность БД — добавить Alembic, начальную миграцию, ограничения/индексы и защиту от двойной записи.

---

## 1. Modified / created files

| Файл | Тип | Изменение |
|---|---|---|
| `requirements.txt` | modified | Добавлены `alembic==1.20.1`, `Mako==1.4.3`, `MarkupSafe==3.0.4` (кодировка UTF-16 сохранена). |
| `alembic.ini` | created | Конфигурация Alembic; `sqlalchemy.url` задаётся в `migrations/env.py`. |
| `migrations/env.py` | created | Подключение `DATABASE_URL` и `Base.metadata` всех моделей. |
| `migrations/script.py.mako`, `migrations/README` | created | Стандартные шаблоны Alembic. |
| `migrations/versions/b3df86a2ce15_initial_schema.py` | created | Initial migration: 3 таблицы, 4 unique constraint, 5 indexes. |
| `app/models/business.py` | modified | Именованные unique constraints на `email`, `slug`. |
| `app/models/business_schedule.py` | modified | `UniqueConstraint("business_id", "weekday")`. |
| `app/models/booking.py` | modified | Два составных индекса + unique `(business_id, date, start_time)`. |
| `app/main.py` | modified | Удалён `Base.metadata.create_all()`; `SELECT ... FOR UPDATE` на бизнесе; обработка `IntegrityError` → 409 + rollback. |
| `app\docs\phase_b_database_hardening.md` | created | Данный отчёт. |

---

## 2. Alembic

Команды:

```bash
pip install -r requirements.txt
python -m alembic upgrade head      # применить миграции
python -m alembic downgrade base    # откат (проверен)
python -m alembic check             # нет расхождений моделей и схемы
```

`migrations/env.py` (ключевое):

```python
from app.core.config import DATABASE_URL
from app.db.database import Base
from app.models.business import Business  # noqa: F401
from app.models.business_schedule import BusinessSchedule  # noqa: F401
from app.models.booking import Booking  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
target_metadata = Base.metadata
```

> Важно: `Base.metadata.create_all(bind=engine)` удалён из `app/main.py`, иначе он создавал бы таблицы без `alembic_version` и миграция падала бы. Для уже существующей БД без миграций нужно либо пересоздать её, либо вручную привести схему к миграции и выполнить `alembic stamp head`.

---

## 3. Initial migration

`migrations/versions/b3df86a2ce15_initial_schema.py` (revision `b3df86a2ce15`, `down_revision = None`) создаёт:

- `businesses`: `uq_businesses_email`, `uq_businesses_slug`, index `ix_businesses_id`
- `business_schedules`: `uq_business_schedules_business_weekday`, index `ix_business_schedules_id`
- `bookings`: `uq_bookings_business_date_start`, indexes `ix_bookings_business_id_date`, `ix_bookings_business_id_date_start_time`, `ix_bookings_id`

Фрагмент upgrade:

```python
op.create_table(
    'business_schedules',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('business_id', sa.Integer(), nullable=False),
    sa.Column('weekday', sa.Integer(), nullable=False),
    ...
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('business_id', 'weekday',
                        name='uq_business_schedules_business_weekday'),
)

op.create_table(
    'bookings',
    ...
    sa.UniqueConstraint('business_id', 'date', 'start_time',
                        name='uq_bookings_business_date_start'),
)
op.create_index('ix_bookings_business_id_date', 'bookings',
                ['business_id', 'date'], unique=False)
op.create_index('ix_bookings_business_id_date_start_time', 'bookings',
                ['business_id', 'date', 'start_time'], unique=False)
```

`downgrade()` удаляет индексы и таблицы в обратном порядке.

---

## 4. Double-booking prevention

### Model-level constraints (`app/models/booking.py`)

```python
__table_args__ = (
    Index("ix_bookings_business_id_date", "business_id", "date"),
    Index(
        "ix_bookings_business_id_date_start_time",
        "business_id", "date", "start_time",
    ),
    UniqueConstraint(
        "business_id", "date", "start_time", name="uq_bookings_business_date_start"
    ),
)
```

### Service-level locking (`app/main.py`)

```python
# Serialize all booking writes for this business.
business = (
    db.query(Business)
    .filter(Business.id == booking.business_id)
    .with_for_update()
    .first()
)
...
db.add(new_booking)
try:
    db.commit()
except IntegrityError:
    db.rollback()
    raise HTTPException(
        status_code=409, detail="Time slot is already booked for the selected date."
    )
db.refresh(new_booking)
```

Meханизмы:
1. `SELECT ... FOR UPDATE` блокирует строку бизнеса до `commit()` — параллельные запросы одного бизнеса выполняются последовательно (PostgreSQL).
2. Обычная проверка пересечения остаётся и выдаёт `400`.
3. `UNIQUE(business_id, date, start_time)` — последний рубеж на уровне БД; `IntegrityError` превращается в контролируемую ошибку `409` с `rollback()`.

Примечание: unique Protect от одинакового `start_time`; пересечения с разным временем ловятся проверкой `start_time < end_time AND end_time > start_time` под блокировкой.

---

## 5. API examples

```
POST /bookings  (первый запрос)            → 200 {"message":"Booking created","id":1}
POST /bookings  (тот же слот, после first) → 400 {"detail":"Time slot is already booked for the selected date."}
POST /bookings  (гонка, unique violation)  → 409 {"detail":"Time slot is already booked for the selected date."}
```

---

## 6. Mandatory verification

Проверка на временной SQLite-БД; миграции применялись реальным `alembic` CLI, HTTP Google подменён mock.

| # | Проверка | Результат |
|---|---|---|
| 1 | `alembic upgrade head` на чистой БД | PASS |
| 2 | `unique(business_id, weekday)` и оба booking index присутствуют в схеме (inspector); также unique booking constraint | PASS |
| 3 | `alembic downgrade base` → `upgrade head` (rollback миграции) | PASS |
| 4 | compiled SQL содержит `FOR UPDATE` для PostgreSQL | PASS |
| 5 | Первое бронирование создано | PASS |
| 6 | Повторное бронирование → контролируемый `400` | PASS |
| 7 | Прямая вставка дубля → `IntegrityError` отunique constraint | PASS |
| 8 | Дубль `weekday` в расписании → `IntegrityError` | PASS |
| 9 | Симуляция гонки (check обойдён, commit бросает IntegrityError) → `409`, `rollback()` вызван, лишних строк нет | PASS |
| 10 | `alembic check` → `No new upgrade operations detected` | PASS |

Команда: `python C:\Users\nick\AppData\Local\Temp\opencode\verify_phase_b.py` → `ALL PHASE B CHECKS PASSED`.
Дополнительно: `python -m compileall -q app` → OK; `from app.main import app` → OK.

---

## WORK LOG

### Migrations created

- `migrations/versions/b3df86a2ce15_initial_schema.py` — initial schema (`upgrade` / `downgrade`).
- Конфигурация: `alembic.ini`, `migrations/env.py`, `migrations/script.py.mako`, `migrations/README`.
- Зависимости добавлены в `requirements.txt`.

### Constraints added

- `uq_businesses_email`, `uq_businesses_slug`
- `uq_business_schedules_business_weekday` — `UNIQUE(business_id, weekday)`
- `uq_bookings_business_date_start` — `UNIQUE(business_id, date, start_time)`

### Indexes added

- `ix_businesses_id`, `ix_business_schedules_id`, `ix_bookings_id`
- `ix_bookings_business_id_date`
- `ix_bookings_business_id_date_start_time`

### Verification results

9/9 сценариев проверки пройдены, плюс `alembic check`. Миграция применяется и откатывается успешно; дубли блокируются на трёх уровнях (lock,service check, DB unique); `IntegrityError` превращается в `409` с корректным rollback. Реальные Google API и production-БД не использовались; временные файлы удалены.
