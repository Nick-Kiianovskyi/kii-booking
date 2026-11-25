import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import App from './App'
import { renderApp } from '@/test/helpers'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function appAt(route: string, token: string | null = null) {
  return renderApp(
    <>
      <App />
      <LocationProbe />
    </>,
    { route, token },
  )
}

describe('routing and authentication', () => {
  it('redirects /nikolay to /book/nikolay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () =>
          Promise.resolve(
            JSON.stringify({ detail: 'Business not found', error: { code: 'BUSINESS_NOT_FOUND' } }),
          ),
      }),
    )
    appAt('/nikolay')
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/book/nikolay')
    })
  })

  it('redirects unauthenticated users away from private screens', async () => {
    appAt('/schedule')
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/signin')
    })
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('signs in, fetches /auth/me and lands on the dashboard', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ access_token: 'jwt', token_type: 'bearer' })),
        })
      }
      if (url.endsWith('/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                id: 3,
                name: 'Nikolay',
                email: 'n@example.com',
                slug: 'nikolay',
                is_active: true,
              }),
            ),
        })
      }
      if (url.includes('/schedule')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify([])),
        })
      }
      throw new Error(`Unexpected URL ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    appAt('/signin')
    await user.type(screen.getByLabelText('Email'), 'n@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(await screen.findByRole('heading', { name: 'Hi, Nikolay' })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/dashboard')
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/auth/me'))).toBe(true)
  })
})
