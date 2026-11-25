import { LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { Brand } from './Brand'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Brand to="/dashboard" />
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/signin', { replace: true })
            }}
            className="flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-field px-3 text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <nav aria-label="Business navigation" className="border-b border-line bg-surface lg:hidden">
        <div className="mx-auto flex w-full max-w-5xl gap-1 px-3 py-2">
          {[
            { to: '/dashboard', label: 'Dashboard' },
            { to: '/schedule', label: 'Schedule' },
            { to: '/google', label: 'Calendar' },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="min-h-touch flex-1 rounded-field px-2 py-2 text-center text-sm font-medium text-muted hover:bg-primary-soft hover:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
