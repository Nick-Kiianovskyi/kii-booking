export interface BusinessPublic {
  id: number
  name: string
  slug: string
  is_active: boolean
  slot_minutes: number
}

export interface BusinessProfile {
  id: number
  name: string
  email: string
  slug: string
  is_active: boolean
}

export interface AuthToken {
  access_token: string
  token_type: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AvailabilityResponse {
  available: string[]
}

export interface ScheduleItem {
  weekday: number
  start_time: string | null
  end_time: string | null
  slot_minutes: number
  is_working: boolean
}

export interface ScheduleResponse extends ScheduleItem {
  id: number
}

export interface BookingPayload {
  business_id: number
  client_name: string
  phone: string
  service: string
  date: string
  start_time: string
  end_time: string
}

export interface BookingResult {
  message: string
  id: number
}

export interface GoogleConnectResponse {
  auth_url: string
}

export interface ApiErrorBody {
  detail: string
  error?: {
    code: string
    message: string
    details?: unknown
  }
  path?: string
}
