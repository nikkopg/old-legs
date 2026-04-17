// READY FOR QA
// Feature: Dashboard page (TASK-019)
// What was built: /dashboard — authenticated activity feed with loading skeletons,
//   empty state, error state, and 401 redirect to landing page.
// Edge cases to test:
//   - 0 activities returned (empty state message shown)
//   - 401 response (should redirect to /)
//   - API unreachable / 500 (error message shown)
//   - Slow load (3 skeleton blocks visible until data resolves)
//   - Activity with null average_hr (HR row hidden in ActivityCard)
//   - Long activity name (truncated via CSS)

'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout'
import { ActivityCard } from '@/components/activity'
import { getActivities } from '@/lib/api'
import type { ApiError } from '@/types/api'

// TODO: Replace placeholder once GET /user/me endpoint is implemented (see api-spec.md)
const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return (
    apiErr?.detail?.startsWith('API error 401') ||
    apiErr?.detail === 'Not authenticated'
  )
}

function ActivityListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-surface-raised animate-pulse rounded-sm h-16 w-full"
        />
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()

  const {
    data: activities,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['activities'],
    queryFn: getActivities,
    retry: (failureCount, err) => {
      // Do not retry on 401 — redirect to landing instead
      if (isUnauthorized(err)) return false
      return failureCount < 2
    },
  })

  // Redirect to landing page on 401
  useEffect(() => {
    if (isError && error) {
      const apiErr = error as ApiError
      if (
        apiErr.detail?.startsWith('API error 401') ||
        apiErr.detail === 'Not authenticated'
      ) {
        router.replace('/')
      }
    }
  }, [isError, error, router])

  return (
    <PageWrapper
      userName={PLACEHOLDER_USER_NAME}
      avatarUrl={PLACEHOLDER_AVATAR_URL}
      pageTitle="Your runs"
    >
      {isLoading && <ActivityListSkeleton />}

      {isError && !((error as ApiError).detail?.startsWith('API error 401') || (error as ApiError).detail === 'Not authenticated') && (
        <p className="text-sm text-muted">
          Could not load runs. Check that the API is running.
        </p>
      )}

      {!isLoading && !isError && activities && activities.length === 0 && (
        <p className="text-sm text-muted">
          No runs synced yet. Connect your Strava account to get started.
        </p>
      )}

      {!isLoading && !isError && activities && activities.length > 0 && (
        <div className="flex flex-col gap-3">
          {activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </PageWrapper>
  )
}
