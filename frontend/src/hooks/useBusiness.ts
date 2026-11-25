import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { BusinessPublic, BusinessProfile } from '@/types/api'

export function useBusiness(slug: string | undefined) {
  return useQuery({
    queryKey: ['business', slug],
    queryFn: () => api.get<BusinessPublic>(`/businesses/by-slug/${slug}`, false),
    enabled: Boolean(slug),
    staleTime: 5 * 60_000,
    retry: (count, error) =>
      count < 2 && (error as { status?: number }).status !== 404,
  })
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<BusinessProfile>('/auth/me'),
    staleTime: 60_000,
    retry: false,
  })
}
