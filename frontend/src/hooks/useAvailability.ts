import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AvailabilityResponse } from '@/types/api'

export function availabilityKey(businessId: number | undefined, date: string | undefined) {
  return ['availability', businessId, date] as const
}

async function fetchAvailability(businessId: number, date: string) {
  return api.get<AvailabilityResponse>(
    `/availability/${businessId}?date=${encodeURIComponent(date)}`,
    false,
  )
}

export function useAvailability(businessId: number | undefined, date: string | undefined) {
  return useQuery({
    queryKey: availabilityKey(businessId, date),
    queryFn: () => fetchAvailability(businessId!, date!),
    enabled: Boolean(businessId && date),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })
}

/** Warm the cache for neighboring dates so swiping dates feels instant. */
export function usePrefetchAvailability(
  businessId: number | undefined,
  dates: string[],
) {
  const queryClient = useQueryClient()
  const key = dates.join(',')

  useEffect(() => {
    if (!businessId) return
    for (const date of dates.slice(1, 4)) {
      void queryClient.prefetchQuery({
        queryKey: availabilityKey(businessId, date),
        queryFn: () => fetchAvailability(businessId, date),
        staleTime: 60_000,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, key, queryClient])
}
