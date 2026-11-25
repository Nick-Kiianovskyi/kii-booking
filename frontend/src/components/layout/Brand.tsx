import { CalendarCheck2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-base font-bold tracking-tight text-ink" aria-label="KII Booking home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
        <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
      </span>
      KII Booking
    </Link>
  )
}
