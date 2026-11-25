import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ConfirmationPage } from './ConfirmationPage'
import { selectionParam } from './selection'
import { renderApp } from '@/test/helpers'

const SELECTION = { date: '2026-12-12', start: '10:00', end: '10:30' }
const BUSINESS = { id: 7, name: 'Demo Barber', slug: 'demo', is_active: true, slot_minutes: 30 }

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function mockApi(postStatus = 200) {
  const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/businesses/by-slug/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(BUSINESS)),
      })
    }
    if (url.endsWith('/bookings') && init?.method === 'POST') {
      if (postStatus !== 200) {
        return Promise.resolve({
          ok: false,
          status: postStatus,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                detail: 'Time slot is already booked for the selected date.',
                error: {
                  code: 'SLOT_ALREADY_BOOKED',
                  message: 'That time was just booked. Please pick another.',
                },
              }),
            ),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ message: 'Booking created', id: 42 })),
      })
    }
    throw new Error(`Unexpected URL ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderConfirm() {
  return renderApp(
    <>
      <Routes>
        <Route path="/book/:slug/confirm" element={<ConfirmationPage />} />
      </Routes>
      <LocationProbe />
    </>,
    { route: `/book/demo/confirm?selection=${selectionParam(SELECTION)}` },
  )
}

describe('ConfirmationPage', () => {
  it('creates a booking with the existing API contract and redirects to success', async () => {
    const fetchMock = mockApi()
    const user = userEvent.setup()
    renderConfirm()

    expect(await screen.findByRole('heading', { name: 'Confirm booking' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Anna')
    await user.type(screen.getByLabelText('Phone'), '+380671234567')
    await user.type(screen.getByLabelText('Service'), 'Haircut')
    await user.click(screen.getByRole('button', { name: 'Confirm Booking' }))

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('/book/demo/success/42')
    })
    const bookingCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/bookings'),
    )
    expect(JSON.parse(String(bookingCall?.[1]?.body))).toEqual({
      business_id: 7,
      client_name: 'Anna',
      phone: '+380671234567',
      service: 'Haircut',
      date: '2026-12-12',
      start_time: '10:00',
      end_time: '10:30',
    })
  })

  it('shows a friendly duplicate-slot error and a link to pick another time', async () => {
    mockApi(409)
    const user = userEvent.setup()
    renderConfirm()

    await user.type(await screen.findByLabelText('Name'), 'Anna')
    await user.type(screen.getByLabelText('Phone'), '+380671234567')
    await user.type(screen.getByLabelText('Service'), 'Haircut')
    await user.click(screen.getByRole('button', { name: 'Confirm Booking' }))

    expect(await screen.findByText(/That time was just booked/)).toBeInTheDocument()
    const retry = await screen.findByRole('link', { name: 'Pick another time' })
    expect(retry).toHaveAttribute('href', '/book/demo')
  })
})
