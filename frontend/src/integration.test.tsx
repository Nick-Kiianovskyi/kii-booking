import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import App from './App'
import { renderApp } from '@/test/helpers'
import { SchedulePage } from '@/features/schedule/SchedulePage'
import { AppShell } from '@/components/layout/AppShell'

const PROFILE = {
  id: 3,
  name: 'Nikolay',
  email: 'n@example.com',
  slug: 'nikolay',
  is_active: true,
}

function ok(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(data)) })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

describe('integration flows', () => {
  it('register -> login -> me', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/register')) return ok(PROFILE)
      if (url.endsWith('/auth/login')) return ok({ access_token: 'jwt', token_type: 'bearer' })
      if (url.endsWith('/auth/me')) return ok(PROFILE)
      if (url.includes('/schedule')) return ok([])
      throw new Error(`Unexpected ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: '/signup' },
    )

    await user.type(screen.getByLabelText('Business name'), 'Nikolay Barber')
    await user.type(screen.getByLabelText('Email'), 'n@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(await screen.findByRole('heading', { name: 'Hi, Nikolay' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/register'))).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/login'))).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/me'))).toBe(true)
  })

  it('schedule PUT -> GET', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return ok(PROFILE)
      if (url.includes('/schedule') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Array<{ weekday: number; is_working: boolean }>
        return ok(body.map((item) => ({ ...item, id: item.weekday })))
      }
      if (url.includes('/schedule')) return ok([])
      throw new Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp(
      <Routes>
        <Route path="/schedule" element={<ScheduleHarness />} />
        <Route
          path="/dashboard"
          element={
            <>
              <div>Dashboard screen</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { route: '/schedule', token: 'jwt' },
    )

    await user.click(await screen.findByRole('button', { name: 'Save Schedule' }))
    expect(await screen.findByText('Dashboard screen')).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/dashboard')

    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT')
    expect(putCall).toBeDefined()
    const payload = JSON.parse(String(putCall?.[1]?.body)) as Array<{
      weekday: number
      is_working: boolean
      start_time: string | null
      end_time: string | null
    }>
    expect(payload).toHaveLength(7)
    expect(payload.filter((day) => day.is_working)).toHaveLength(5)
    expect(payload[0]).toMatchObject({ weekday: 0, start_time: '09:00', end_time: '18:00' })
  })

  it('oauth callback mock -> me -> connected status', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      const url = String(input)
      if (url.includes('/google/callback')) return ok({ message: 'Google connected', business_id: 3 })
      if (url.endsWith('/auth/me')) return ok(PROFILE)
      if (url.includes('/schedule')) return ok([])
      throw new Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderApp(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: '/oauth/callback?code=test-code&state=test-state', token: 'jwt' },
    )

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    })
    expect(localStorage.getItem('kii_booking_google_connected_3')).toBe('true')
    expect(await screen.findByText('Connected')).toBeInTheDocument()
  })

  it('syncs an already-connected account when returning from backend JSON', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      const url = String(input)
      if (url.endsWith('/auth/me')) return ok(PROFILE)
      if (url.includes('/schedule')) return ok([])
      throw new Error(`Unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderApp(
      <>
        <App />
        <LocationProbe />
      </>,
      { route: '/oauth/callback?connected=1', token: 'jwt' },
    )

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    })
    expect(localStorage.getItem('kii_booking_google_connected_3')).toBe('true')
  })
})

// The schedule test renders the screen inside the same shell used by App.tsx.
function ScheduleHarness() {
  return <AppShell><SchedulePage /></AppShell>
}
