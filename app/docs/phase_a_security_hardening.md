# Phase A — Security Hardening

Дата: 19.11.2026

Цель: устранить критические находки Technical Audit — открытые Google-endpoints, небезопасный OAuth `state`, отсутствие обработки ошибок и таймаутов, публичный debug-эндпоинт.

---

## 1. Modified files

| Файл | Тип | Изменение |
|---|---|---|
| `app\core\config.py` | modified | Добавлены `DEBUG` (default `False`) и `GOOGLE_REQUEST_TIMEOUT = (3, 10)`. |
| `app\core\security.py` | modified | Добавлены `create_oauth_state()` / `decode_oauth_state()` (подписанный, случайный, истекающий state). |
| `app\api\deps.py` | modified | Добавлен `require_debug_enabled()` (404, если `DEBUG=false`). |
| `app\services\google_calendar.py` | modified | Timeout на все HTTP-вызовы; `raise_for_status` + обработка ошибок при refresh; `get_google_auth_url()` теперь использует подписанный state и `urlencode`. |
| `app\main.py` | modified | `connect`/`test-event` защищены `get_owned_business`; callback переписан (валидация state/code/error/refresh_token, timeout, status checks); убран неиспользуемый `SessionLocal`. |
| `app\docs\phase_a_security_hardening.md` | created | Данный отчёт. |

---

## 2. Source code

### `app\core\config.py`

```python
DEBUG = config("DEBUG", default=False, cast=bool)
GOOGLE_REQUEST_TIMEOUT = (3, 10)  # (connect, read)
```

### `app\core\security.py`

```python
OAUTH_STATE_PURPOSE = "google-oauth-state"
OAUTH_STATE_EXPIRE_MINUTES = 10


def create_oauth_state(business_id: int) -> str:
    payload = {
        "sub": str(business_id),
        "purpose": OAUTH_STATE_PURPOSE,
        "jti": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=OAUTH_STATE_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_oauth_state(state: str) -> int | None:
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != OAUTH_STATE_PURPOSE or not payload.get("jti"):
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None
```

### `app\api\deps.py`

```python
def require_debug_enabled() -> None:
    """Hide debug-only endpoints unless DEBUG is explicitly enabled."""
    if not DEBUG:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
```

### `app\services\google_calendar.py`

```python
def get_google_auth_url(business_id: int) -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "prompt": "consent",
        "state": create_oauth_state(business_id),
    }
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
```

`refresh_google_token()` — HTTP POST с `timeout=GOOGLE_REQUEST_TIMEOUT`, `raise_for_status()`, возврат `None` при `RequestException`/невалидном JSON.

`google_api_request()` — `kwargs.setdefault("timeout", GOOGLE_REQUEST_TIMEOUT)` перед обоими вызовами `requests.request()` (первичный запрос и retry после 401).

### `app\main.py` — защищённые эндпоинты

```python
@app.get("/google/connect/{business_id}")
def connect_google(
    business_id: int,
    current_business: Business = Depends(get_owned_business),
):
    return {"auth_url": get_google_auth_url(current_business.id)}


@app.get("/google/test-event/{business_id}")
def google_test_event(
    business_id: int,
    db: Session = Depends(get_db),
    _debug: None = Depends(require_debug_enabled),
    current_business: Business = Depends(get_owned_business),
):
    ...
    response = google_api_request(..., current_business, db, ...)
    return response.json()
```

### `app\main.py` — callback

```python
@app.get("/google/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: Session = Depends(get_db),
):
    if error:
        detail = f"OAuth error: {error}"
        if error_description:
            detail += f" - {error_description}"
        raise HTTPException(status_code=400, detail=detail)

    if not state:
        raise HTTPException(status_code=400, detail="Missing state")
    business_id = decode_oauth_state(state)
    if business_id is None:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    business = db.query(Business).filter(Business.id == business_id).first()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    try:
        response = requests.post(token_url, data=data,
                                 timeout=GOOGLE_REQUEST_TIMEOUT)
        response.raise_for_status()
        token_response = response.json()
    except requests.RequestException:
        raise HTTPException(status_code=502,
                            detail="Unable to exchange Google authorization code")
    except ValueError:
        raise HTTPException(status_code=502, detail="Invalid response from Google")

    access_token = token_response.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502,
                            detail="Google did not return an access token")
    refresh_token = token_response.get("refresh_token")
    if not refresh_token and not business.google_refresh_token:
        raise HTTPException(status_code=400,
                            detail="Google did not return a refresh token")

    business.google_access_token = access_token
    if refresh_token:
        business.google_refresh_token = refresh_token
    business.google_connected = True
    db.commit()
    return {"message": "Google connected", "business_id": business_id}
```

---

## 3. API examples

| Запрос | Результат |
|---|---|
| `GET /google/connect/5` без JWT | `401 Could not validate credentials` |
| `GET /google/connect/5` JWT бизнеса 6 | `403 Forbidden` |
| `GET /google/connect/5` JWT бизнеса 5 | `200 {"auth_url": "...state=<JWT>..."}` |
| `GET /google/callback?code=...&state=<valid>` | `200 {"message":"Google connected","business_id":5}` |
| `GET /google/callback?code=...&state=<tampered>` | `400 Invalid or expired state` |
| `GET /google/callback?state=<valid>` | `400 Missing code` |
| `GET /google/callback?error=access_denied` | `400 OAuth error: access_denied` |
| `GET /google/callback?...` без refresh_token | `400 Google did not return a refresh token` |
| `GET /google/test-event/5` (prod, `DEBUG=false`) | `404 Not Found` |
| `GET /google/test-event/5` (DEBUG, чужой JWT) | `403 Forbidden` |

---

## 4. Security fixes

1. **Ownership** — `get_owned_business()` на `/google/connect/{id}` и `/google/test-event/{id}`; HTTP-клиент test-event использует `current_business`, а не путь.
2. **State** — вместо `business_id` подписанный JWT (HS256, `SECRET_KEY`) с `sub`, `purpose`, случайным `jti` и TTL 10 минут. Callback расшифровывает state и берёт `business_id` только из него.
3. **Callback** — обработаны `error`/`error_description`, отсутствующие `state`/`code`, невалидный/истёкший state, отсутствующий бизнес, HTTP-ошибки и невалидный JSON от Google, отсутствующие `access_token`/`refresh_token`. Сессия теперь приходит через `Depends(get_db)` и корректно закрывается.
4. **Timeout** — `(3, 10)` на обмен кода, refresh-токена и все Calendar-запросы (включая retry после 401).
5. **Debug** — `/google/test-event/{id}` спрятан за `DEBUG=true` (по умолчанию 404) и дополнительно защищён JWT-владельцем.

---

## 5. Mandatory verification

Проверка выполнена на временной SQLite-БД; все HTTP-вызовы Google подменены mock (реальный outgoing HTTP в тесте запрещён guard'ом).

| # | Проверка | Результат |
|---|---|---|
| 1 | Валидный OAuth flow: connect → state → callback → токены сохранены | PASS |
| 2 | state подписан, случаен (два вызова дают разные значения), timeout=(3,10) | PASS |
| 3 | Невалидный / истёкший / с чужим purpose state → 400 | PASS |
| 4 | Missing state, missing code, OAuth error → 400 | PASS |
| 5 | Missing refresh_token → 400, частичного обновления нет | PASS |
| 6 | Повторный consent без refresh_token сохраняет старый refresh_token | PASS |
| 7 | Чужой JWT → 403; нет JWT → 401; зависимости роутов подтверждены | PASS |
| 8 | Debug endpoint: 404 в prod, owner-only + использует свой токен при `DEBUG=true` | PASS |
| 9 | Timeout simulation: `requests.Timeout` → `google_api_request` пробрасывает, `delete_google_event` → False | PASS |
| 10 | Timeout на refresh и обмене кода → `None` / 502 без 500 | PASS |

Команда: `python C:\Users\nick\AppData\Local\Temp\opencode\verify_phase_a.py` → `ALL PHASE A CHECKS PASSED`.
Дополнительно: `python -m compileall -q app` → OK; `from app.main import app` → OK.

### Definition of Done

- ✅ `/google/connect` требует JWT
- ✅ `/google/test-event` защищён и скрыт в prod
- ✅ state подписанный/рандомизированный с TTL
- ✅ невалидный state → 400
- ✅ missing code → 400
- ✅ missing refresh_token → 400
- ✅ все Google-запросы используют timeout=(3,10)
- ✅ публичный эндпоинт не может манипулировать чужим календарём

---

## WORK LOG

### Files modified

- `app\core\config.py`
- `app\core\security.py`
- `app\api\deps.py`
- `app\services\google_calendar.py`
- `app\main.py`
- `app\docs\phase_a_security_hardening.md`

### Endpoints secured

- `GET /google/connect/{business_id}` — `get_owned_business()`
- `GET /google/test-event/{business_id}` — `require_debug_enabled()` + `get_owned_business()`
- `GET /google/callback` — остаётся публичным (вызов Google), но принимает `business_id` только из подписанного state

### Security fixes

Подписанный state с nonce и TTL; валидация state/code/OAuth error; безопасная обработка отсутствующего refresh_token; `timeout=(3,10)` на всех Google-запросах; `raise_for_status` и обработка JSON/сетевых ошибок; debug-endpoint скрыт по умолчанию; закрытие сессии через `Depends(get_db)`.

### Verification results

10/10 проверок пройдены, включая обязательные: валидный OAuth flow, невалидный state, неавторизованный доступ, timeout simulation. compileall и импорт приложения успешны. Реальные Google API и production-БД не использовались.
