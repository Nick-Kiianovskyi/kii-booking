import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Check, Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/hooks/useBusiness'
import { useSchedule } from '@/hooks/useSchedule'
import { friendlyMessage } from '@/lib/api'
import { isGoogleConnected } from '@/lib/token'

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-success' : 'bg-warning'}`} aria-hidden="true" />
      {children}
    </span>
  )
}

export function DashboardPage() {
  const me = useMe()
  const [copied, setCopied] = useState(false)
  const businessId = me.data?.id
  const schedule = useSchedule(businessId)
  const scheduleConfigured = Boolean(schedule.data?.some((item) => item.is_working))
  const connected = businessId ? isGoogleConnected(businessId) : false
  const bookingUrl = me.data ? `${window.location.origin}/book/${me.data.slug}` : ''
  const steps = [true, scheduleConfigured, connected].filter(Boolean).length

  if (me.isLoading) {
    return (
      <div className="page-container space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (me.isError || !me.data) {
    return (
      <div className="page-container space-y-4">
        <Alert tone="error">{friendlyMessage(me.error)}</Alert>
        <Button onClick={() => void me.refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
        </Button>
      </div>
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="page-container space-y-5">
      <div>
        <p className="text-sm text-muted">Dashboard</p>
        <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-tight">Hi, {me.data.name}</h1>
      </div>

      <Card>
        <Progress value={(steps / 3) * 100} label="Setup progress" />
        <ul className="mt-4 space-y-2 text-sm">
          {[
            ['Account created', true],
            ['Schedule configured', scheduleConfigured],
            ['Calendar connected', connected],
          ].map(([label, done]) => (
            <li key={String(label)} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  done ? 'bg-success text-white' : 'bg-line text-muted'
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className={done ? 'text-ink' : 'text-muted'}>{label as string}</span>
            </li>
          ))}
        </ul>
      </Card>

      {copied && <Alert tone="success">Booking link copied to clipboard.</Alert>}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
              Google Calendar
            </CardTitle>
            <CardDescription className="mt-1">Sync availability with your calendar.</CardDescription>
          </div>
          <StatusBadge ok={connected}>{connected ? 'Connected' : 'Not connected'}</StatusBadge>
        </div>
        {!connected && (
          <Button asChild variant="outline" className="mt-4">
            <Link to="/google">Connect Calendar</Link>
          </Button>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
              Schedule
            </CardTitle>
            <CardDescription className="mt-1">Your working days and time slots.</CardDescription>
          </div>
          <StatusBadge ok={scheduleConfigured}>
            {scheduleConfigured ? 'Configured' : 'Not configured'}
          </StatusBadge>
        </div>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/schedule">Edit Schedule</Link>
        </Button>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Booking link
        </CardTitle>
        <CardDescription className="mt-1 break-all">{bookingUrl}</CardDescription>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button onClick={copyLink}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy Link
          </Button>
          <Button asChild variant="outline">
            <Link to={`/book/${me.data.slug}`}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Booking Page
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
