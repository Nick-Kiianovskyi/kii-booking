import { CalendarCheck2 } from 'lucide-react'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col justify-center bg-canvas px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-card">
            <CalendarCheck2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">KII Booking</p>
          <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="card">{children}</div>
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
      </div>
    </div>
  )
}
