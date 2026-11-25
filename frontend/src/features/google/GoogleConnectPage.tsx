import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck2, RefreshCw } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/hooks/useBusiness'
import { api, friendlyMessage } from '@/lib/api'
import { isGoogleConnected } from '@/lib/token'
import type { GoogleConnectResponse } from '@/types/api'

export function GoogleConnectPage() {
  const me = useMe()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const connected = me.data ? isGoogleConnected(me.data.id) : false

  async function connect() {
    if (!me.data) return
    setError('')
    setLoading(true)
    try {
      const { auth_url } = await api.get<GoogleConnectResponse>(`/google/connect/${me.data.id}`)
      window.location.assign(auth_url)
    } catch (cause) {
      setError(friendlyMessage(cause))
      setLoading(false)
    }
  }

  if (me.isLoading) {
    return (
      <div className="page-container space-y-4" aria-busy="true" aria-label="Loading calendar connection">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-52 w-full" />
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

  return (
    <div className="page-container space-y-5">
      <div>
        <p className="text-sm text-muted">Business portal</p>
        <h1 className="mt-1 text-[32px] font-bold tracking-tight">Google Calendar</h1>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <CalendarCheck2 className="h-7 w-7" aria-hidden="true" />
        </span>
        <CardTitle>{connected ? 'Calendar connected' : 'Connect your calendar'}</CardTitle>
        <CardDescription className="mx-auto mt-2 max-w-sm">
          KII Booking checks your Google Calendar to identify available times. Your calendar stays the source of truth.
        </CardDescription>
        {connected ? (
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        ) : (
          <Button className="mt-6" loading={loading} onClick={connect}>
            Connect Google Calendar
          </Button>
        )}
      </Card>
    </div>
  )
}
