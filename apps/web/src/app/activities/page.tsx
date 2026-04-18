// READY FOR QA
// Feature: Activity list page (TASK-115)
// What was built:
//   - /activities page — full run list fetched via GET /activities, ordered by date descending
//   - ActivityCard components render each run with name, date, distance, pace, duration, HR
//   - Each ActivityCard is clickable and navigates to /activities/[id] (handled inside ActivityCard via Link)
//   - Loading state: 3 skeleton blocks (bg-surface-raised animate-pulse) while data fetches
//   - Empty state: "No runs synced yet. Connect your Strava account to get started."
//   - 401 response: redirects to /
//   - Non-401 errors: inline error message
//   - React Query with no retry on 401, up to 2 retries on other errors
// Edge cases to test:
//   - 0 activities returned (empty state shown)
//   - 401 response (redirect to /)
//   - API unreachable / 500 (error message shown, no crash)
//   - Slow load (3 skeleton blocks visible until data resolves)
//   - Activity with null average_hr (HR row hidden inside ActivityCard)
//   - Activity with null max_hr (only avg bpm shown)
//   - Long activity name (truncated via CSS inside ActivityCard)
//   - Large number of activities (all rendered, no pagination — TASK-107 adds that later)

'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout'
import { ActivityCard } from '@/components/activity'
import { getActivities } from '@/lib/api'
import type { ApiError } from '@/types/api'

// TODO: Replace placeholder once GET /user/me endpoint is implemented (TASK-103)
const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
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

export default function ActivitiesPage() {
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
      if (isUnauthorized(err)) return false
      return failureCount < 2
    },
  })

  useEffect(() => {
    if (isError && error) {
      if (isUnauthorized(error)) {
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

      {isError && !isUnauthorized(error) && (
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
          {[...activities]
            .sort(
              (a, b) =>
                new Date(b.activity_date).getTime() -
                new Date(a.activity_date).getTime(),
            )
            .map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
        </div>
      )}
    </PageWrapper>
  )
}
