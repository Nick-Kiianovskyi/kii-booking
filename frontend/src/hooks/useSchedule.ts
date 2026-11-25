import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ScheduleResponse } from '@/types/api'

export function useSchedule(businessId: number | undefined) {
  return useQuery({
    queryKey: ['schedule', businessId],
    queryFn: () => api.get<ScheduleResponse[]>(`/business/${businessId}/schedule`, false),
    enabled: Boolean(businessId),
    staleTime: 30_000,
  })
}
