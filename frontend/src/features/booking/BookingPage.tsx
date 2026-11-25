import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAvailability, usePrefetchAvailability } from '@/hooks/useAvailability'
import { useBusiness } from '@/hooks/useBusiness'
import { addDays, addMinutesToTime, buildDateStrip, formatDate, shortWeekday, toISODate, weekdayOf } from '@/lib/dates'
import { friendlyMessage } from '@/lib/api'
import { PublicShell } from '@/components/layout/PublicShell'
import { selectionParam } from './selection'

export function BookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const business = useBusiness(slug)
  const [anchor, setAnchor] = useState(() => toISODate(new Date()))
  const [date, setDate] = useState(() => toISODate(new Date()))
  const [selected, setSelected] = useState<string | null>(null)

  const dates = useMemo(() => buildDateStrip(anchor, 7), [anchor])
  const availability = useAvailability(business.data?.id, date)
  usePrefetchAvailability(business.data?.id, dates)

  useEffect(() => {
    setSelected(null)
  }, [date])

  useEffect(() => {
    if (dates.length && !dates.includes(date)) setDate(dates[0])
  }, [dates, date])

  if (business.isLoading) {
    return (
      <PublicShell>
        <div className="space-y-4" aria-busy="true" aria-label="Loading booking page">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </PublicShell>
    )
  }

  if (business.isError || !business.data) {
    return (
      <PublicShell>
        <Card className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-danger" aria-hidden="true" />
          <h1 className="text-h3 text-lg font-semibold">Booking page not found</h1>
          <p className="mt-2 text-sm text-muted">{friendlyMessage(business.error)}</p>
        </Card>
      </PublicShell>
    )
  }

  const slots = availability.data?.available ?? []
  const slotMinutes = business.data.slot_minutes || 30

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Welcome</p>
          <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">{business.data.name}</h1>
          <p className="mt-2 text-sm text-muted">Pick a time that works for you. Takes less than a minute.</p>
        </div>

        <section aria-labelledby="date-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="date-heading" className="text-h3 text-lg font-semibold">
              Select a date
            </h2>
            <div className="flex gap-1">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-canvas"
                onClick={() => setAnchor((current) => addDays(current, -7))}
                aria-label="Previous week"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-canvas"
                onClick={() => setAnchor((current) => addDays(current, 7))}
                aria-label="Next week"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-1 pb-1" role="group" aria-label="Available dates">
            {dates.map((item) => {
              const active = item === date
              const weekend = weekdayOf(item) >= 5
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDate(item)}
                  aria-pressed={active}
                  className={`flex min-h-[76px] min-w-[42px] flex-1 flex-col items-center justify-center rounded-field border px-1 py-2 text-center transition-colors ${
                    active
                      ? 'border-primary bg-primary text-white'
                      : 'border-line bg-surface text-ink hover:border-primary/40'
                  }`}
                >
                  <span className={`text-xs ${active ? 'text-blue-100' : 'text-muted'}`}>{shortWeekday(item)}</span>
                  <span className="mt-1 text-lg font-semibold">{formatDate(item).split(' ')[1]}</span>
                  <span className={`text-[10px] ${active ? 'text-blue-100' : weekend ? 'text-muted/70' : 'text-muted'}`}>
                    {formatDate(item).split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="slots-heading">
          <h2 id="slots-heading" className="mb-3 text-h3 text-lg font-semibold">
            Available times
          </h2>

          {availability.isLoading && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Loading available times">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          )}

          {availability.isError && (
            <Card>
              <p className="text-sm text-muted">{friendlyMessage(availability.error)}</p>
              <Button variant="outline" className="mt-3" onClick={() => void availability.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
              </Button>
            </Card>
          )}

          {availability.isSuccess && slots.length === 0 && (
            <Card className="text-center">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted" aria-hidden="true" />
              <p className="font-medium">No times available.</p>
              <p className="mt-1 text-sm text-muted">Please choose another date.</p>
            </Card>
          )}

          {slots.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Available time slots">
              {slots.map((slot) => {
                const active = selected === slot
                return (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(slot)}
                    className={`flex min-h-touch items-center justify-center gap-1.5 rounded-field border px-3 py-3 text-base font-semibold transition-colors ${
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-primary/30 bg-primary-soft text-primary hover:border-primary'
                    }`}
                  >
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {slot.slice(0, 5)}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-sheet backdrop-blur sm:static sm:mt-6 sm:rounded-card sm:border sm:shadow-card">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Selected time</p>
              <p className="truncate font-semibold">
                {formatDate(date)} · {selected.slice(0, 5)}–{addMinutesToTime(selected, slotMinutes)}
              </p>
            </div>
            <Button
              className="w-auto shrink-0 px-6"
              onClick={() =>
                navigate(
                  `/book/${slug}/confirm?selection=${selectionParam({
                    date,
                    start: selected,
                    end: addMinutesToTime(selected, slotMinutes),
                  })}`,
                )
              }
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </PublicShell>
  )
}
