import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicShell } from '@/components/layout/PublicShell'
import { useBusiness } from '@/hooks/useBusiness'
import { formatLongDate, normalizeTime } from '@/lib/dates'
import { BookingSummary } from './BookingSummary'

export function SuccessPage() {
  const { slug, bookingId } = useParams<{ slug: string; bookingId: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const business = useBusiness(slug)
  const date = params.get('date') ?? ''
  const start = params.get('start') ?? ''
  const end = params.get('end') ?? ''

  function bookAnother() {
    queryClient.removeQueries({ queryKey: ['availability'] })
    navigate(`/book/${slug}`, { replace: true })
  }

  return (
    <PublicShell>
      <div className="space-y-5">
        <Card className="text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success">
            <CalendarCheck2 className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Booking confirmed</h1>
          <p className="mt-2 text-sm text-muted">Your appointment has been created.</p>

          {business.isLoading && <Skeleton className="mx-auto mt-6 h-28 w-full" />}

          {business.data && date && start && end && (
            <div className="mt-6 text-left">
              <BookingSummary
                businessName={business.data.name}
                date={date}
                start={start}
                end={end}
              />
              <p className="mt-3 text-center text-xs text-muted">
                Reference #{bookingId} · {formatLongDate(date)}, {normalizeTime(start)}
              </p>
            </div>
          )}
        </Card>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button onClick={bookAnother}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Book Another
          </Button>
        </div>
      </div>
    </PublicShell>
  )
}
