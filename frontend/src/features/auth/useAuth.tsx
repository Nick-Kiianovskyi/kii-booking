import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { clearToken, getToken, setToken } from '@/lib/token'
import type { AuthToken, LoginPayload, RegisterPayload } from '@/types/api'

interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await api.post<AuthToken>('/auth/login', payload, false)
    setToken(result.access_token)
    setTokenState(result.access_token)
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    await api.post('/auth/register', payload, false)
    await login({ email: payload.email, password: payload.password })
  }, [login])

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
  }, [])

  const value = useMemo(
    () => ({ token, isAuthenticated: Boolean(token), login, register, logout }),
    [token, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
