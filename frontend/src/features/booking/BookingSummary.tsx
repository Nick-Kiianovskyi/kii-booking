import { CalendarDays, Clock } from 'lucide-react'
import { formatDate, normalizeTime } from '@/lib/dates'

export function BookingSummary({
  businessName,
  date,
  start,
  end,
}: {
  businessName: string
  date: string
  start: string
  end: string
}) {
  return (
    <div className="rounded-field bg-canvas p-4">
      <p className="text-base font-semibold">{businessName}</p>
      <div className="mt-3 grid gap-2 text-sm text-muted">
        <p className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>{formatDate(date)}</span>
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>
            {normalizeTime(start)} – {normalizeTime(end)}
          </span>
        </p>
      </div>
    </div>
  )
}
