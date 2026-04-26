import { useQuery } from '@tanstack/react-query'
import { getUserMe } from '@/lib/api'
import type { ApiError, UserProfile } from '@/types/api'

function isUnauthorizedError(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

export interface UseUserResult {
  user: UserProfile | null
  isLoading: boolean
  isError: boolean
  isUnauthorized: boolean
}

export function useUser(): UseUserResult {
  const { data: user, isLoading, isError, error } = useQuery<UserProfile, ApiError>({
    queryKey: ['user', 'me'],
    queryFn: getUserMe,
    retry: (failureCount, err) => {
      if (isUnauthorizedError(err)) return false
      return failureCount < 2
    },
  })

  return {
    user: user ?? null,
    isLoading,
    isError,
    isUnauthorized: isUnauthorizedError(error),
  }
}
