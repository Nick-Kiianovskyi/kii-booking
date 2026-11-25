import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicShell } from '@/components/layout/PublicShell'
import { useBusiness } from '@/hooks/useBusiness'
import { api, friendlyMessage } from '@/lib/api'
import type { BookingResult } from '@/types/api'
import { BookingSummary } from './BookingSummary'
import { readSelection } from './selection'

export function ConfirmationPage() {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const selection = readSelection(params.get('selection'))
  const business = useBusiness(slug)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!selection) return <Navigate to={`/book/${slug}`} replace />

  if (business.isLoading) {
    return (
      <PublicShell>
        <div className="space-y-4" aria-busy="true" aria-label="Loading confirmation">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PublicShell>
    )
  }

  if (business.isError || !business.data) {
    return (
      <PublicShell>
        <Alert tone="error">{friendlyMessage(business.error)}</Alert>
      </PublicShell>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (phone.trim().length < 5) {
      setError('Please enter a valid phone number.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api.post<BookingResult>(
        '/bookings',
        {
          business_id: business.data!.id,
          client_name: name.trim(),
          phone: phone.trim(),
          service: service.trim(),
          date: selection!.date,
          start_time: selection!.start,
          end_time: selection!.end,
        },
        false,
      )
      await queryClient.invalidateQueries({
        queryKey: ['availability', business.data!.id, selection!.date],
      })
      navigate(
        `/book/${slug}/success/${result.id}?date=${selection!.date}&start=${encodeURIComponent(selection!.start)}&end=${encodeURIComponent(selection!.end)}`,
        { replace: true },
      )
    } catch (cause) {
      setError(friendlyMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicShell>
      <div className="space-y-5">
        <div>
          <Link
            to={`/book/${slug}`}
            className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-muted hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change time
          </Link>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-tight">Confirm booking</h1>
        </div>

        <BookingSummary
          businessName={business.data.name}
          date={selection.date}
          start={selection.start}
          end={selection.end}
        />

        {error && (
          <Alert tone="error">
            {error}
            {error.includes('no longer') || error.includes('just booked') ? (
              <Link className="mt-1 block font-semibold underline" to={`/book/${slug}`}>
                Pick another time
              </Link>
            ) : null}
          </Alert>
        )}

        <form id="booking-form" onSubmit={submit} noValidate className="space-y-4">
          <Card className="space-y-4">
            <div>
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                autoComplete="name"
                placeholder="Your name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+380 00 000 00 00"
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="service">Service</Label>
              <Input
                id="service"
                placeholder="e.g. Haircut"
                required
                value={service}
                onChange={(event) => setService(event.target.value)}
              />
            </div>
          </Card>
        </form>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-sheet backdrop-blur sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button type="submit" form="booking-form" loading={submitting}>
            Confirm Booking
          </Button>
        </div>
      </div>
    </PublicShell>
  )
}
