import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useQueryClient } from '@tanstack/react-query'
import { api, friendlyMessage } from '@/lib/api'
import { setGoogleConnected } from '@/lib/token'
import type { BusinessProfile } from '@/types/api'

interface CallbackResult {
  business_id: number
  message: string
}

export function OAuthCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const started = useRef(false)
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error')
  const alreadyConnected = params.get('connected') === '1'

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function finish() {
      if (oauthError) {
        setError('Google could not connect your calendar. Please try again.')
        return
      }

      try {
        if (!alreadyConnected && (!code || !state)) {
          setError('No connection response was found. Please start from the calendar page.')
          return
        }

        if (code && state) {
          await api.get<CallbackResult>(
            `/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
            false,
          )
        }

        const me = await api.get<BusinessProfile>('/auth/me')
        setGoogleConnected(me.id, true)
        await queryClient.invalidateQueries({ queryKey: ['me'] })
        navigate('/dashboard', { replace: true })
      } catch (cause) {
        setError(friendlyMessage(cause))
      }
    }

    void finish()
  }, [code, state, oauthError, alreadyConnected, navigate, queryClient])

  if (error) {
    return (
      <div className="page-container space-y-4">
        <Alert tone="error">{error}</Alert>
        <Button asChild>
          <Link to="/google">Back to Calendar</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="page-container space-y-5">
      <Card className="text-center" aria-busy="true" aria-label="Finishing calendar connection">
        <Skeleton className="mx-auto mb-4 h-12 w-12 rounded-full" />
        <CardTitle>Connecting your calendar…</CardTitle>
        <CardDescription className="mt-2">This will only take a moment.</CardDescription>
      </Card>
    </div>
  )
}
