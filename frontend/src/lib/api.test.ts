import { describe, expect, it, vi } from 'vitest'
import { api, ApiError, friendlyMessage } from './api'

describe('api client', () => {
  it('sends the bearer token and parses successful JSON', async () => {
    localStorage.setItem('kii_booking_token', 'jwt-token')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ id: 1 })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.get<{ id: number }>('/auth/me')

    expect(result).toEqual({ id: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/auth/me')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer jwt-token')
  })

  it('maps the standardized error envelope into ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              detail: 'Business not found',
              error: { code: 'BUSINESS_NOT_FOUND', message: 'Business not found' },
              path: '/businesses/by-slug/nope',
            }),
          ),
      }),
    )

    await expect(api.get('/businesses/by-slug/nope', false)).rejects.toMatchObject({
      status: 404,
      code: 'BUSINESS_NOT_FOUND',
      message: 'Business not found',
    })
    expect(friendlyMessage(new ApiError(404, 'Business not found', 'BUSINESS_NOT_FOUND'))).toBe(
      'This booking page is not available.',
    )
  })

  it('turns network failures into a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(api.get('/health', false)).rejects.toBeInstanceOf(ApiError)
    expect(friendlyMessage(new Error('unknown'))).toBe('Something went wrong. Please try again.')
  })
})
