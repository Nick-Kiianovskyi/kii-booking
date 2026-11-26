const TOKEN_KEY = 'kii_booking_token'
const CONNECTION_PREFIX = 'kii_booking_google_connected_'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * GET /auth/me does not expose `google_connected`. The SPA remembers a
 * successful OAuth callback per business so the dashboard can show the state.
 */
export function setGoogleConnected(businessId: number, connected: boolean): void {
  localStorage.setItem(`${CONNECTION_PREFIX}${businessId}`, String(connected))
}

export function isGoogleConnected(businessId: number): boolean {
  try {
    return localStorage.getItem(`${CONNECTION_PREFIX}${businessId}`) === 'true'
  } catch {
    return false
  }
}
