# Phase C — Frontend Enablement

Дата: 19.11.2026

Цель: подготовить backend к React-фронтенду — CORS, публичный профиль по slug, единый формат ошибок и теги OpenAPI.

---

## 1. Modified / created files

| Файл | Тип | Изменение |
|---|---|---|
| `app\core\config.py` | modified | Добавлен `CORS_ALLOWED_ORIGINS` (env, comma-separated; default `localhost:5173`, `127.0.0.1:5173`). |
| `app\shemas\business.py` | modified | Добавлена `BusinessPublicResponse` (без `email`). |
| `app\shemas\error.py` | created | `ErrorBody`, `ErrorResponse` — единый контракт ошибок. |
| `app\main.py` | modified | CORS middleware, exception handlers, OpenAPI tags/global error responses, новый slug-endpoint, теги на всех 17 операциях. |
| `app\docs\phase_c_frontend_enablement.md` | created | Данный отчёт. |

---

## 2. CORS setup

`app\core\config.py`:

```python
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in config(
        "CORS_ALLOWED_ORIGINS",
        default="http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
```

`app\main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials="*" not in CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- Origin'ы задаются через env `CORS_ALLOWED_ORIGINS` (через запятую).
- `Authorization`, `Content-Type` и остальные заголовки разрешены — preflight `OPTIONS` обрабатывается middleware.
- При `CORS_ALLOWED_ORIGINS=*` `allow_credentials` автоматически выключается (браузер запрещает wildcard + credentials).

---

## 3. New endpoint

```python
@app.get(
    "/businesses/by-slug/{slug}",
    response_model=BusinessPublicResponse,
    tags=["businesses"],
)
def get_business_by_slug(slug: str, db: Session = Depends(get_db)):
    business = db.query(Business).filter(Business.slug == slug).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business
```

`BusinessPublicResponse` содержит `id`, `name`, `slug`, `is_active`. **Email намеренно не отдаётся** в публичном профиле.

Примеры:

```
GET /businesses/by-slug/demo-barber
200 → {"id":1,"name":"Demo Barber","slug":"demo-barber","is_active":true}

GET /businesses/by-slug/nope
404 → {
  "detail": "Business not found",
  "error": {"code":"BUSINESS_NOT_FOUND","message":"Business not found"},
  "path": "/businesses/by-slug/nope"
}
```

---

## 4. Standardized errors

Все ошибки (HTTPException, Starlette 404, validation 422, unexpected 500) проходят через обработчики и имеют одинаковый контракт:

```json
{
  "detail": "Business not found",
  "error": {
    "code": "BUSINESS_NOT_FOUND",
    "message": "Business not found",
    "details": null
  },
  "path": "/businesses/by-slug/nope"
}
```

- `detail` сохранён для обратной совместимости.
- `error.code` — стабильный machine-readable код (именованный map + slugify fallback + kod по статусу).
- `error.details` заполняется только для `422` (список ошибок Pydantic).
- `path` — путь запроса.

Обработчики зарегистрированы для `StarletteHTTPException`, `RequestValidationError` и `Exception`. Схема `ErrorResponse` подключена глобально через `FastAPI(responses=...)` — видна во всех операциях OpenAPI.

Примеры кодов: `BUSINESS_NOT_FOUND`, `SLOT_UNAVAILABLE`, `SLOT_ALREADY_BOOKED`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_OAUTH_STATE`, `GOOGLE_DELETE_FAILED`, `VALIDATION_ERROR`, `BAD_GATEWAY`.

---

## 5. OpenAPI tags

`OPENAPI_TAGS`: `system`, `auth`, `businesses`, `schedule`, `availability`, `bookings`, `google`.

Теги добавленыко всем 17 операциям (включая новый slug-endpoint). Заголовок API — `KII Booking API`, версия `1.0.0`. Swagger UI доступен на `/docs`, схема — `/openapi.json`.

---

## 6. Mandatory verification

Проверка 수행ена через реальный ASGI-стек приложения (`app.build_middleware_stack()`) на временной SQLite-БД, созданной `alembic upgrade head`. Реальный HTTP-сервер и сеть не использовались.

| # | Проверка | Результат |
|---|---|---|
| 0 | Применение миграции для тестовой БД | PASS |
| 1 | CORS origins конфигурируются env | PASS |
| 2 | Preflight `OPTIONS` с `Origin: http://localhost:5173` → 200 + `access-control-allow-origin` | PASS |
| 3 | Простой `GET` с React-origin → 200 + CORS header | PASS |
| 4 | Доп. origin разрешён, неизвестный origin заблокирован | PASS |
| 5 | Валидный slug → 200, публичные поля, без email | PASS |
| 6 | Невалидный slug → 404 + `BUSINESS_NOT_FOUND` | PASS |
| 7 | Validation error → 422 + `VALIDATION_ERROR` + details | PASS |
| 8 | `GET /auth/me` без JWT → 401 + `UNAUTHORIZED`, CORS header на ошибке | PASS |
| 9 | OpenAPI содержит slug-endpoint, теги у всех 17 операций, ErrorResponse в 404 | PASS |

Команда: `python C:\Users\nick\AppData\Local\Temp\opencode\verify_phase_c.py` → `ALL PHASE C CHECKS PASSED`.
Дополнительно: `python -m compileall -q app` → OK; `from app.main import app` → OK.

---

## WORK LOG

### Files modified

- `app\core\config.py`
- `app\shemas\business.py`
- `app\shemas\error.py` (created)
- `app\main.py`
- `app\docs\phase_c_frontend_enablement.md` (created)

### New endpoints

- `GET /businesses/by-slug/{slug}` — публичный профиль бизнеса (`id`, `name`, `slug`, `is_active`), 404 при отсутствии.

### CORS setup

- `CORSMiddleware` с origins из `CORS_ALLOWED_ORIGINS` (по умолчанию `http://localhost:5173`, `http://127.0.0.1:5173`).
- Разрешены все методы и заголовки; credentials отключаются при wildcard.
- CORS-заголовки присутствуют и на успешных, и на ошибочных ответах.

### Verification results

10/10 проверок пройдены (включая обязательные: React localhost request, valid slug, invalid slug). Compileall и импорт приложения успешны. Реальный браузер, сеть и production-БД не использовались; временные файлы удалены.
