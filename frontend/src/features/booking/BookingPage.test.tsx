import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BookingPage } from './BookingPage'
import { renderApp } from '@/test/helpers'

const BUSINESS = {
  id: 1,
  name: 'Demo Barber',
  slug: 'demo',
  is_active: true,
  slot_minutes: 30,
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function mockApi(available: string[] | null, status = 200) {
  const fetchMock = vi.fn().mockImplementation((input: string) => {
    if (String(input).includes('/businesses/by-slug/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(BUSINESS)),
      })
    }
    if (String(input).includes('/availability/')) {
      if (status !== 200) {
        return Promise.resolve({
          ok: false,
          status,
          text: () => Promise.resolve(JSON.stringify({ detail: 'Server error' })),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ available })),
      })
    }
    throw new Error(`Unexpected URL ${input}`)
  })
  vi.stubGlobal('fetch', fetchMock)
}

function renderBooking() {
  return renderApp(
    <>
      <Routes>
        <Route path="/book/:slug" element={<BookingPage />} />
        <Route path="/book/:slug/confirm" element={<div>Confirmation screen</div>} />
      </Routes>
      <LocationProbe />
    </>,
    { route: '/book/demo' },
  )
}

describe('BookingPage', () => {
  it('loads business and slots, then continues with the selected slot', async () => {
    mockApi(['09:00', '09:30', '10:00'])
    const { container } = renderBooking()

    expect(await screen.findByRole('heading', { name: 'Demo Barber' })).toBeInTheDocument()
    const slot = await screen.findByRole('button', { name: /09:30/ })
    expect(screen.queryByRole('button', { name: /Continue/ })).not.toBeInTheDocument()

    fireEvent.click(slot)
    expect(slot).toHaveAttribute('aria-pressed', 'true')

    const continueButton = await screen.findByRole('button', { name: 'Continue' })
    fireEvent.click(continueButton)

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toContain('/book/demo/confirm')
    })
    expect(screen.getByTestId('location').textContent).toContain('09%3A30')
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(0)
  })

  it('shows a friendly empty state when no slots exist', async () => {
    mockApi([])
    renderBooking()
    expect(await screen.findByText('No times available.')).toBeInTheDocument()
    expect(screen.getByText('Please choose another date.')).toBeInTheDocument()
  })

  it('shows a retryable error state when availability fails', async () => {
    mockApi(null, 503)
    renderBooking()
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })
})
