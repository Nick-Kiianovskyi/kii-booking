# KII Booking Frontend

Mobile-first React SPA for KII Booking. Primary breakpoint: **375px**.

## Run locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Copy `.env.example` to `.env` to override the API base URL.

```env
VITE_API_URL=http://127.0.0.1:8000
```

The backend must allow this origin via `CORS_ALLOWED_ORIGINS`
(default: `http://localhost:5173,http://127.0.0.1:5173`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | TypeScript check + production bundle |
| `npm test` | Vitest + React Testing Library suite |
| `npm run preview` | Serve the production bundle |

## Routes

| Route | Screen |
|---|---|
| `/signup`, `/signin` | Business registration / sign in |
| `/dashboard` | Setup status, booking link |
| `/schedule` | Working hours and slot duration |
| `/google` | Google Calendar connection |
| `/oauth/callback` | OAuth return, forwards `code`/`state` to backend |
| `/book/:slug` | Public booking page + slot selection |
| `/book/:slug/confirm` | Name / Phone / Service confirmation |
| `/book/:slug/success/:bookingId` | Success screen |
| `/:slug` | Redirect to `/book/:slug` |

Successful **Save Schedule** returns to `/dashboard`. Availability never includes
slots that have already started **today** — the backend filters only the current
day in `Europe/Kyiv`, so future days keep all slots and both `/book/:slug` and
`POST /bookings` stay consistent.

## Google OAuth configuration

The backend redirect URI must point to the SPA callback so the browser returns
to the app after consent:

```env
GOOGLE_REDIRECT_URI=http://localhost:5173/oauth/callback
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`/oauth/callback` forwards `code` + `state` to `GET /google/callback`, refreshes
`GET /auth/me`, and shows the new connection status.

If Google returns you to `http://127.0.0.1:8000/google/callback` with a JSON
message instead of the SPA, the backend redirect URI was not applied. Restart
the backend, then open `http://localhost:5173/oauth/callback?connected=1` once
to sync the existing connection into the SPA.

> `GET /auth/me` does not expose `google_connected`, so the SPA stores the
> successful connection flag per business locally (`kii_booking_google_connected_<id>`).
> Adding `google_connected` to `BusinessResponse` would make this server-authoritative.

## Structure

```
src/
  components/       # reusable layout + shadcn-style UI primitives
  features/         # auth, dashboard, schedule, google, booking screens
  hooks/            # React Query hooks (me, business, availability, schedule)
  lib/              # API client, token storage, date helpers, cn()
  test/             # test helpers
  App.tsx           # route table
  main.tsx          # providers
```

Design system: Tailwind CSS tokens in `tailwind.config.js` + `src/index.css`;
components follow shadcn/ui conventions (`components.json`).
