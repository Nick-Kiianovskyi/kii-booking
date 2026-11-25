# KII Booking — Full Technical Audit

Дата: 19.11.2026
Версии: FastAPI 0.162.2, SQLAlchemy 2.1.8, Pydantic 2.14.3, Python 3.14, PostgreSQL (Neon) / SQLite в тестах.

---

## 1. PROJECT HEALTH SCORE

**58 / 100** — рабочий функциональный прототип, но **не готов к production**.

| Блок | Оценка |
|---|---|
| Implemented feature coverage | 85 |
| Business logic correctness | 65 |
| Architecture / maintainability | 45 |
| Database design | 50 |
| API design / frontend readiness | 55 |
| Security | 40 |
| Production readiness | 25 |
| Testing | 10 |

---

## 2. STRENGTHS

1. Все 11 заявленных фич реализованы и вручную проверены по stage-отчётам.
2. `app/services/availability.py` — чистые функции без БД/HTTP, легко тестируются.
3. Централизованный `google_api_request()` для 401 → refresh → save → retry (нет дублирования в эндпоинтах).
4. bcrypt + python-jose JWT + `get_owned_business()` — авторизация работает, 403 подтверждён.
5. Pydantic v2-валидация расписания (weekday 0-6, уникальность, start<end, нормализация выходных).
6. Удаление бронирования корректно обрабатывает 404/410 Google, сетевые ошибки и 401→refresh.
7. Детальная документация каждого этапа в `app/docs/`.
8. Пул соединений настроен (`pool_pre_ping`, `pool_recycle`).

---

## 3. RISKS

| # | Риск | Вероятность | Влияние |
|---|---|---|---|
| 1 | Публичный `/google/test-event/{business_id}` создаёт события в чужом календаре | Высокая | Высокое |
| 2 | OAuth `state = business_id` без проверки → подмена/prank-связывание | Средняя | Высокое |
| 3 | Гонка при создании бронирования (check-then-insert без лока) | Средняя | Высокое |
| 4 | Нет Alembic — изменения моделей не применятся к существующей БД | Высокая | Высокое |
| 5 | Нет тестов в репозитории — регрессии не ловятся | Высокая | Среднее |
| 6 | `timeMin/timeMax` в UTC `Z` при слотах Europe/Kyiv → ошибки у полуночи | Средняя | Среднее |
| 7 | Нет `timeout` в HTTP-запросах к Google → зависание воркеров | Средняя | Среднее |
| 8 | `SECRET_KEY` по умолчанию development-значение | Средняя | Высокое |
| 9 | Токены Google хранятся plaintext | Средняя | Высокое |
| 10 | Нет CORS → React на другом origin не подключится | Высокая (для фронта) | Среднее |

---

## 4. CRITICAL ISSUES

1. **Публичные Google-endpoints.** `/google/connect/{id}`, `/google/callback`, `/google/test-event/{id}` не требуют авторизации. Любой, кто знает `business_id`, может создать событие в календаре бизнеса (`test-event`) или инициировать OAuth.
2. **OAuth без state-валидации.** `state` — это просто `business_id`, не проверяется на callback; нет обработки `error` и проверки `response.status_code`; `SessionLocal()` не закрывается; `refresh_token` может отсутствовать → `KeyError` → 500.
3. **Гонка двойной записи.** Проверка пересечения и вставка не атомарны; нет уникального/исключающего ограничения в БД. Два параллельных запроса создадут две брони на один слот.
4. **Отсутствие миграций.** `Base.metadata.create_all(bind=engine)` вызывается при импорте — создаёт только недостающие таблицы, не.change columns, не добавляет индексы/ограничения.
5. **Отсутствие автоматических тестов.** Все проверки были разовыми скриптами во temp; в репозитории нет `tests/`, CI и конфигурации pytest.
6. **Нет таймаутов и retry/backoff для Google.** `requests.request()` без `timeout` может блокировать воркер неопределённо долго; 429/5xx не обрабатываются.
7. **Токены и секреты.** Plaintext `google_access_token`/`google_refresh_token` в БД, development `SECRET_KEY` по умолчанию.

---

## 5. RECOMMENDED IMPROVEMENTS

**Безопасность (P0)**
- Защитить `/google/connect/{id}` и `/google/test-event/{id}` через `get_owned_business`; callback — через подписанный/одноразовый `state` + проверку `error`.
- Запретить production-режим для debug endpoints (`settings.DEBUG`).
- Задавать `SECRET_KEY` только из env, Fail Fast при старте без него.
- Шифровать токены (Fernet/KMS) или как минимум не логировать/не отдавать их в API.
- Добавить rate limiting на `/auth/login`, `/auth/register`, `/bookings`.

**Надёжность (P0/P1)**
- `timeout=(3, 10)` для всех HTTP-вызовов, backoff для 429/5xx.
- Атомарная проверка слота: `SELECT ... FOR UPDATE` или уникальный индекс `(business_id, date, start_time)` + обработка `IntegrityError`.
- Alembic + миграции вместо `create_all` в `main.py`.

**Архитектура (P1)**
- Разбить `main.py` на `APIRouter`: `auth`, `businesses`, `schedule`, `availability`, `bookings`, `google`.
- Ввести `BookingService` / `GoogleCalendarClient` со внедрением зависимостей; убрать HTTP из эндпоинтов.
- Переименовать `app/shemas` → `app/schemas`; `_init_.py` → `__init__.py`; удалить пустые `api/auth.py`, `api/bookings.py`.
- Убрать дубль `GET /bookings` / `GET /business/{id}/bookings`.

**Бизнес-логика (P1/P2)**
- Проверка "не в прошлом", выравнивание `end_time` по границам слотов, лимит глубины бронирования, буфер между записями.
- Per-business timezone вместо хардкода `Europe/Kyiv`; корректные `timeMin/timeMax` с учётом таймзоны; обработка `nextPageToken`.
- Статус синхронизации бронирования (`pending/synced/failed`) и outbox/очередь повторов при ошибке Google.

**API/Frontend (P1)**
- CORS middleware с allowlist origin.
- Публичный `GET /businesses/by-slug/{slug}` и/или `GET /book/{slug}`.
- Единый контракт ошибок (`{"detail": ...}` + code), правильные статусы (201 create, 204 delete).
- `response_model` для create/delete, теги OpenAPI, версионирование `/api/v1`.

---

## 6. MISSING MVP FEATURES

1. `GET /businesses/by-slug/{slug}` — публичная страница `/book/{slug}` (в архитектуре описана, не реализована).
2. Публичный профиль бизнеса (имя, расписание, услуги) без JWT.
3. Каталог услуг (сейчас `service` — свободный текст, нет entity/цены/длительности).
4. `GET /bookings/{id}` — деталь бронирования.
5. Отмена/перенос бронирования клиентом (сейчас DELETE требует JWT бизнеса).
6. `GET /google/status/{business_id}` — статус подключения календаря для кабинета.
7. Email/SMS-подтверждение записи (упоминается в продукте, не реализовано).
8. Валидация и подтверждение телефона/email клиента.

---

## 7. MISSING PRODUCTION FEATURES

1. Alembic-миграции и версионирование схемы.
2. Автотесты (unit + integration), pytest, coverage, CI.
3. CORS, security headers, HTTPS enforcement.
4. Rate limiting, account lockout, email verification.
5. Структурное логирование (JSON), correlation-id, error tracking (Sentry).
6. Health-check с проверкой БД и Google connectivity; readiness/liveness.
7. Secrets management, `.env.example`, валидация конфигурации при старте.
8. Docker/Docker Compose, deployment manifest, gunicorn/uvicorn workers.
9. Мониторинг и метрики (OpenTelemetry уже в зависимостях, но не используется).
10. Audit-log изменений расписания/броней/токенов.
11. API versioning и deprecation policy.
12. Шифрование токенов at rest, ротация `SECRET_KEY`.

---

## 8. TECHNICAL DEBT

| Область | Долг |
|---|---|
| Именование | `app/shemas` (опечатка), `_init_.py` вместо `__init__.py`, пустые `api/auth.py` и `api/bookings.py` |
| Монолит | `main.py` ~439 строк: 14 роутов + бизнес-логика + HTTP + БД |
| Дублирование | Два списка броней; повтор `db.query(Business).filter(Business.id == ...)`; URL календаря в 3 местах; 502-обработки |
| Импорты | Неиспользуемые `from app.models import booking`, `from app.shemas import business`, `ScheduleItem` |
| Схемы | `BookingResponse` содержит `class Config` вне модели (Pydantic v2 не применяет, `model_config == {}`) |
| Конфиг | `DATABASE_URL` присваивается дважды (`os.getenv` + `decouple.config`); dev default `SECRET_KEY` |
| Утилиты | Python-файл `requirements.txt` в UTF-16 — может сломать `pip install -r` |
| Хардкод | `Europe/Kyiv`, `primary` calendar, debug event даты 2026-11-17, тайминги |
| БД | `Business.business_id` в Booking nullable; нет `ondelete`; нет составных индексов; нет CheckConstraint на weekday и уникальности `(business_id, weekday)` |
| Документация | `status project 18112026.md` устарел (помечает реализованное как ❌) |

---

## 9. NEXT RECOMMENDED PHASE

**Phase 6 — API Hardening & Frontend Enablement.**

Цель: сделать API безопасным и достаточным для старта React-разработки, не меняя бизнес-логику.

Scope:
1. Разбить `main.py` на роутеры.
2. Защитить Google endpoints + валидный `state`.
3. Добавить CORS и публичный slug-endpoint.
4. alembic + первые миграции (индексы, NOT NULL, ограничения).
5. Покрыть ключевые сценарии автотестами (pytest + TestClient).

---

## 10. PRIORITIZED ACTION PLAN

| Приоритет | Действие | Оценка |
|---|---|---|
| P0 | Защитить `/google/connect`, `/google/test-event`, валидировать `state`, обработать `error` в callback | 0.5 дня |
| P0 | `SECRET_KEY` из env + Fail Fast; timeout на все Google-запросы | 0.5 дня |
| P0 | Атомарная проверка слота (лок/уникальный индекс) | 1 день |
| P1 | Alembic + миграция индексов/ограничений | 1 день |
| P1 | CORS + `GET /businesses/by-slug/{slug}` | 1 день |
| P1 | Разбиение main.py на APIRouter + сервисы | 2 дня |
| P1 | pytest: auth, availability, booking, delete, refresh | 2 дня |
| P2 | TimeUnit/align/past-date, timezone per business, pagination | 2 дня |
| P2 | Единый error contract, response models, версионирование | 1 день |
| P2 | Логирование, health DB check, rate limiting | 2 дня |
| P3 | Docker, CI, мониторинг, шифрование токенов | 3+ дня |

---

## WORK LOG

### Files inspected

- `app/main.py`
- `app/api/auth.py`, `app/api/bookings.py`, `app/api/deps.py`
- `app/core/config.py`, `app/core/security.py`
- `app/db/database.py`
- `app/services/availability.py`, `app/services/google_calendar.py`
- `app/shemas/auth.py`, `app/shemas/booking.py`, `app/shemas/business.py`, `app/shemas/business_schedule.py`
- `app/_init_.py`, `app/db/_init_.py`, `app/models/_init_.py`
- `app/docs/Architecture project.md`, `app/docs/status project 18112026.md` и все stage-отчёты
- `README.md`, `.gitignore`, `.env` (только имена переменных), `requirements.txt`

### Models inspected

- `Business` — id, name, email, password_hash, slug, is_active, google_connected, google_calendar_id, google_access_token, google_refresh_token, schedules
- `BusinessSchedule` — id, business_id (FK), weekday, start_time, end_time, slot_minutes, is_working
- `Booking` — id, business_id (FK, nullable), client_name, phone, service, date, start_time, end_time, google_event_id

### Endpoints inspected

- `GET /`, `GET /health`
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /google/connect/{business_id}`, `GET /google/callback`, `GET /google/test-event/{business_id}`
- `GET /availability/{business_id}`
- `POST /bookings`, `GET /bookings`, `DELETE /bookings/{booking_id}`
- `GET /business/{business_id}`, `GET /business/{business_id}/schedule`, `PUT /business/{business_id}/schedule`, `GET /business/{business_id}/bookings`
- (auto) `/docs`, `/redoc`, `/openapi.json`

### Architecture observations

- Имеется зачаточное разделение на `api/core/db/models/services/shemas`, но реально вся логика сосредоточена в `main.py`.
- `app/api` содержит только `deps.py`; `auth.py` и `bookings.py` пусты.
- Package-инициализаторы названы `_init_.py` (одна подчёркивание) — работают только благодаря namespace packages Python 3.
- Service layer существует частично: availability и google; бронирование/авторизация/расписание остаются в роутах.
- Нет unit-of-work, нет миграций, нет тестов, нет CORS, нет логирования.

### Final conclusions

Проект представляет собой **работающий MVP-бэкенд** с корректной ключевой бизнес-логикой и хорошо документированными этапами. Код Written в стиле «быстро сделать фичу»: монолитный `main.py`, дублирование запросов, хардкод таймзоны, отсутствие тестов и миграций.

Главные блокеры: **открытые Google-endpoints и отсутствие валидации OAuth state**, **гонка при бронировании**, **отсутствие Alembic и автотестов**, **отсутствие CORS и slug-endpoint для публичной страницы**.

Для React-фронтенда текущего API **достаточно для кабинета и базовой записи** (после включения CORS), но **недостаточно для публичной страницы `/book/{slug}`** — нужен публичный endpoint по slug и каталог услуг.

Рекомендуемый следующий этап — **Phase 6: API Hardening & Frontend Enablement**, затем Phase 7 — production infrastructure.
