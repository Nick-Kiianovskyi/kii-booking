import type { ApiErrorBody } from '@/types/api'
import { getToken } from './token'

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

export const API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, '')
  : import.meta.env.DEV
    ? 'http://127.0.0.1:8000'
    : ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code ?? 'HTTP_ERROR'
    this.details = details
  }
}

export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known: Record<string, string> = {
      BUSINESS_NOT_FOUND: 'This booking page is not available.',
      SLOT_UNAVAILABLE: 'That time is no longer available. Please pick another.',
      SLOT_ALREADY_BOOKED: 'That time was just booked. Please pick another.',
      INVALID_CREDENTIALS: 'Incorrect email or password.',
      EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
      UNAUTHORIZED: 'Please sign in again to continue.',
      FORBIDDEN: 'You do not have access to this page.',
    }
    if (known[error.code]) return known[error.code]
    if (error.status >= 500) return 'Something went wrong. Please try again.'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  auth?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options
  const requestHeaders = new Headers(headers)
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')
  if (auth) {
    const token = getToken()
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Network error', 'NETWORK_ERROR')
  }

  const text = await response.text()
  const data: unknown = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return null
        }
      })()
    : null

  if (!response.ok) {
    const payload = (data ?? {}) as ApiErrorBody
    throw new ApiError(
      response.status,
      payload.error?.message ?? payload.detail ?? 'Something went wrong',
      payload.error?.code,
      payload.error?.details,
    )
  }

  return data as T
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, { auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'POST', body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: 'PUT', body, auth }),
  delete: <T>(path: string, auth = true) => request<T>(path, { method: 'DELETE', auth }),
}
