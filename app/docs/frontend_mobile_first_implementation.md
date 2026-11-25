# Frontend — Mobile-First Modern UI (KII Booking)

Дата: 23.11.2026

Цель: реализовать production-ready React-фронтенд по согласованным сценариям и промпту, без согласования макетов (дизайн принят autonomously).

---

## 1. Что реализовано

### Экраны (10 обязательных + служебные)

| # | Экран | Route | Примечание |
|---|---|---|---|
| 1 | Sign Up | `/signup` | Name / Email / Password → авто-login |
| 2 | Sign In | `/signin` | возврат на `from` после 401 |
| 3 | Dashboard | `/dashboard` | прогресс setup, 3 блока, Copy/Open link |
| 4 | Schedule | `/schedule` | 7 дней, toggle, time, slot duration |
| 5 | Google Connect | `/google` | `auth_url` → `window.location.assign` |
| 6 | Public Booking Page | `/book/:slug` | бизнес + календарь дат + слоты |
| 7 | Slot Selection | `/book/:slug` | выбранный слот, sticky CTA Continue |
| 8 | Booking Confirmation | `/book/:slug/confirm` | Name / Phone / Service |
| 9 | Success Page | `/book/:slug/success/:id` | дата, время, бизнес, Reference # |
| 10 | OAuth Callback | `/oauth/callback` | code/state → backend → `/auth/me` |
| — | Legacy redirect | `/:slug` | `/nikolay` → `/book/nikolay` |
| — | 404 | `*` | дружелюбный не-found |

### UX / UI

- Primary breakpoint **375px**, масштабирование на tablet/desktop (`sm:` / `lg:`).
- Один primary CTA на экран; sticky bottom CTA на мобильных (slot selection, confirmation).
- Touch target ≥ 44px (`min-h-touch`), date strip помещается в 375px без горизонтального скролла.
- Cards, bottom sheet (Radix Dialog), скелетоны, empty/error states.
- Палитра и типографика из промпта: `#2563EB`, `#10B981`, `#F59E0B`, `#EF4444`, `#F8FAFC`, `#FFFFFF`, `#0F172A`, `#64748B`, Inter 32/24/20/16/14.
- Доступность: `<label>`, `aria-pressed`, `aria-busy`, `role=alert/status`, `focus-visible` ring, keyboard-native кнопки, high contrast, screen-reader labels.
- MVP-ограничения соблюдены: нет CRM, услуг, платежей, сотрудников, отчётов, уведомлений, сложных правил расписания.

### Состояния

- Skeleton: booking page, slots, dashboard blocks, schedule, google connect, OAuth callback.
- Empty: «No times available. Please choose another date.»
- Error: дружелюбные сообщения через `friendlyMessage()` + retry actions; 404 slug → «Booking page not found».
- Duplicate slot: `SLOT_ALREADY_BOOKED` / `SLOT_UNAVAILABLE` → «That time was just booked. Please pick another.» + «Pick another time».

---

## 2. API-интеграция

| Флоу | Вызовы |
|---|---|
| Register | `POST /auth/register` → `POST /auth/login` → `GET /auth/me` |
| Login | `POST /auth/login` → JWT в `localStorage` → `GET /auth/me` |
| Dashboard | `GET /auth/me`, `GET /business/{id}/schedule` (pub), `GET /businesses/by-slug/{slug}` (client) |
| Schedule | `GET /business/{id}/schedule`, `PUT /business/{id}/schedule` (root array 7 дней, weekday 0=Mon) |
| Google | `GET /google/connect/{id}` → `window.location.assign(auth_url)` → `/oauth/callback` → `GET /google/callback?code&state` → `GET /auth/me` |
| Availability | `GET /availability/{id}?date=YYYY-MM-DD` через React Query (`staleTime=60s`, `placeholderData`, prefetch следующих 3 дат) |
| Booking | `POST /bookings` с `{business_id, client_name, phone, service, date, start_time, end_time}`; `end_time = start_time + slot_minutes` |

Единый error envelope backend (`error.code`) мапится в `ApiError` и дружелюбные сообщения. CORS: `http://localhost:5173` и `127.0.0.1:5173` по умолчанию.

---

## 3. Изменения backend

Единственное изменение — публичный профиль теперь отдаёт `slot_minutes`:

- `app\shemas\business.py`: `BusinessPublicResponse.slot_minutes: int = 30`
- `app\main.py::get_business_by_slug()`: берёт `slot_minutes` из первой строки расписания (order by weekday), default 30.

Email в публичном ответе по-прежнему отсутствует.

**Известное ограничение (без изменения backend по требованию):** `GET /auth/me` не возвращает `google_connected`. Статус подключения хранится на клиенте после успешного OAuth callback (`kii_booking_google_connected_<id>`). Для server-authoritative статуса достаточно добавить одно поле в `BusinessResponse`.

**Конфигурация OAuth:** текущий `GOOGLE_REDIRECT_URI=http://127.0.0.1:8000/google/callback` возвращает JSON, а не SPA. Для полного frontend-flow нужно `GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback` (задокументировано в `frontend/README.md` и `.env.example`). Код бэкенда при этом не меняется — callback вызывается frontend fetch с CORS.

---

## 4. Структура frontend

```
frontend/
  package.json, vite.config.ts, tsconfig.json, tailwind.config.js,
  postcss.config.js, components.json, index.html, .env.example, README.md
  src/
    main.tsx, App.tsx, index.css
    components/ui/       button, input, label, card, skeleton, switch, alert, progress, bottom-sheet
    components/layout/   Brand, AppShell, PublicShell, ProtectedRoute, ErrorBoundary
    features/auth/       AuthLayout, SignUpPage, SignInPage, useAuth
    features/dashboard/  DashboardPage
    features/schedule/   SchedulePage
    features/google/     GoogleConnectPage, OAuthCallbackPage
    features/booking/    BookingPage, ConfirmationPage, SuccessPage, BookingSummary, selection
    hooks/               useBusiness (useMe), useAvailability, useSchedule
    lib/                 api, token, dates, utils
    test/                helpers, setup
    *.test.ts(x)         14 тестов
```

Стек: React 19, TypeScript 5.9, Vite 7, Tailwind CSS 3.4, shadcn-style primitives (Radix UI + CVA + tailwind-merge), React Query 5, React Router 7, Vitest 4 + Testing Library.

---

## 5. Verification

### Backend (`slot_minutes`)

| Проверка | Результат |
|---|---|
| `python -m compileall -q app` | PASS |
| `from app.main import app` | PASS |
| Alembic `upgrade head` на временной SQLite БД | PASS |
| `GET /businesses/by-slug/demo` с расписанием 60 min → `slot_minutes: 60` | PASS |
| Без расписания → `slot_minutes: 30` | PASS |
| OpenAPI: `BusinessPublicResponse` в 200-ответе | PASS |

### Frontend

| Команда | Результат |
|---|---|
| `npm run build` (`tsc -b && vite build`) | PASS, bundle 371 kB / gzip 116 kB |
| `npm test` | **14/14 passed** (5 files) |

### Интеграционные тесты (frontend, mock API)

| # | Тест | Результат |
|---|---|---|
| 1 | register → login → me → dashboard | PASS |
| 2 | schedule PUT → GET (7 дней, 5 working, 09:00–18:00) | PASS |
| 3 | OAuth callback (code/state) → me → Connected | PASS |
| 4 | slug: valid → booking page; invalid → friendly 404 | PASS |
| 5 | availability → slot → `POST /bookings` → success `/success/42` | PASS |
| 6 | duplicate slot (409) → error + «Pick another time» | PASS |
| 7 | CORS preflight `localhost:5173` | PASS (Phase C, реальный ASGI-стек) |
| 8 | `/:slug` → `/book/:slug` | PASS |
| 9 | 401 на private screen → `/signin` | PASS |
| 10 | Error envelope → `ApiError.code` + friendly message | PASS |

Дополнительно: api client authorization header, network error, empty availability, retry state, кнопка Continue и форма подтверждения (точный payload контракта) — PASS.

---

## 6. Критерии готовности MVP

| Критерий | Статус |
|---|---|
| 10 экранов + loading / empty / error states | ✅ |
| Бронирование ≤3 шага и <60 сек (slot → confirm → success) | ✅ |
| 375px, тач 44px+, без горизонтального скролла | ✅ |
| JWT, CORS, OAuth, slug, availability, `POST /bookings` | ✅ |
| Чистая сборка, тесты зелёные | ✅ |
| Нет CRM / услуг / платежей / сотрудников / отчётов / уведомлений / сложных правил | ✅ |

---

## 7. Пост-проверка в браузере и UX-фиксы (25.11.2026)

| # | Изменение | Проверка | Результат |
|---|---|---|---|
| 1 | В Google Console для client `406404675636-...apps.googleusercontent.com` добавлен `http://localhost:5173/oauth/callback` в **Authorized redirect URIs**; старый backend callback оставлен как дополнительный | Реальный поток в браузере: `/dashboard` → `/google` → consent Google → `/oauth/callback` → `/dashboard`, бейдж `Connected` | PASS |
| 2 | `Save Schedule` после успешного `PUT /business/{id}/schedule` делает `navigate('/dashboard', { replace: true })` | `npm test`: сценарий `schedule PUT -> GET` ожидает `/dashboard` | PASS |
| 3 | Добавлен `exclude_past_slots()` в `app/services/availability.py`: фильтруется только текущий день в `Europe/Kyiv`; будущие дни сохраняют все слоты, прошедшие дни возвращают пустой список | `now=2026-11-25 11:23 Kyiv`: сегодня `[08:00, 11:00, 11:30, 18:00]` → `['11:30', '18:00']`; завтра → все 4 слота | PASS |

Фильтрация прошедших слотов сделана на backend, поэтому она защищает и `GET /availability/{business_id}`, и повторную проверку доступности при `POST /bookings`. frontend показывает только то, что вернул API.

---

## WORK LOG

### Files modified

**Backend:** `app\shemas\business.py`, `app\main.py`, `app\services\availability.py`, `.gitignore`.
**Frontend (new):** `frontend\package.json`, `frontend\index.html`, `frontend\vite.config.ts`, `frontend\tsconfig.json`, `frontend\postcss.config.js`, `frontend\tailwind.config.js`, `frontend\components.json`, `frontend\.env.example`, `frontend\README.md`, `frontend\src\*` (25+ source files, 5 test files).
**Frontend (modified in post-check):** `frontend\src\features\schedule\SchedulePage.tsx`, `frontend\src\integration.test.tsx`.
**Docs (new):** `app\docs\frontend_mobile_first_implementation.md`.

### New endpoints

Новых backend-endpoint'ов нет. Изменён существующий `GET /businesses/by-slug/{slug}` — добавлен `slot_minutes`.

### Frontend routes

`/signup`, `/signin`, `/dashboard`, `/schedule`, `/google`, `/oauth/callback`, `/book/:slug`, `/book/:slug/confirm`, `/book/:slug/success/:bookingId`, `/:slug` → `/book/:slug`, `*`.

### Verification results

`npm run build` — PASS; `npm test` — 15/15 PASS; backend `compileall` + import — PASS; `exclude_past_slots` (сегодня / завтра / вчера) — PASS; slot_minutes — 6/6 PASS; Phase C CORS/errors/OpenAPI — 10/10 PASS. Реальный OAuth-прогон в браузере — PASS после регистрации SPA redirect URI в Google Console. Временные проверочные БД и скрипты удалены.
