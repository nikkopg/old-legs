// READY FOR QA
// Feature: Activities page — FrontPage tabloid layout (TASK-129)
// What was built:
//   - /activities replaced with <FrontPage> tabloid newspaper component
//   - Activities fetched via React Query using getActivities() from lib/api.ts
//   - weeklyKm computed from last 4 ISO calendar weeks (W-3, W-2, W-1, This) — weeks with no runs show km:0, runs:0
//   - onActivityClick → router.push('/activities/${id}')
//   - onRefreshSync → invalidates ['activities'] query, which re-fetches GET /activities (backend triggers Strava sync on every call)
//   - Loading state: dark frame + paper block with animate-pulse skeleton rows — no spinner, no text
//   - Error state: dark frame + paper block with italic error message
//   - Empty state: handled internally by FrontPage (pass empty array)
//   - 401 redirect to /
// Edge cases to test:
//   - 0 activities (FrontPage renders "No editions yet." state)
//   - 1 activity (lead renders, no previous editions)
//   - API unreachable / 500 (error state shown)
//   - 401 response (redirect to /)
//   - Activities spanning across ISO week boundaries (weekly km computed correctly)
//   - Current week only partially through (partial km shown in "This" bar)
//   - All 4 weeks have data (all bars render correctly)
//   - Some weeks have no runs (km:0, runs:0 rows still appear)
//   - weeklyKm ordering: W-3 oldest, This newest — FrontPage sidebar reverses to display oldest-first
//   - lastSyncedAt null (FrontPage shows "synced recently")
//   - Refresh sync button tapped (invalidates query, triggers refetch)

'use client'

import { useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { FrontPage } from '@/components/redesign/FrontPage'
import type { WeeklyKmEntry } from '@/components/redesign/FrontPage'
import { getActivities } from '@/lib/api'
import type { Activity, ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

/**
 * Returns the ISO week number (1–53) and ISO year for a given date.
 * ISO week starts on Monday; week 1 is the week containing the first Thursday of the year.
 */
function getISOWeekAndYear(date: Date): { week: number; year: number } {
  // Copy date so we don't mutate the original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday (day 4) by adjusting to ISO day 4
  const day = d.getUTCDay() || 7 // convert Sunday (0) → 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, year: d.getUTCFullYear() }
}

/**
 * Returns a stable ISO week key string "YYYY-WXX" for grouping.
 */
function isoWeekKey(date: Date): string {
  const { week, year } = getISOWeekAndYear(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Computes the ISO week key for a date offset by `weeksAgo` weeks from today.
 * weeksAgo = 0 → current week, 1 → last week, etc.
 */
function isoWeekKeyForOffset(weeksAgo: number): string {
  const now = new Date()
  const offset = new Date(now.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000)
  return isoWeekKey(offset)
}

/**
 * Computes weeklyKm entries for the last 4 ISO calendar weeks.
 * Returns oldest first: [W-3, W-2, W-1, This]
 */
function computeWeeklyKm(activities: Activity[]): WeeklyKmEntry[] {
  // Build a lookup from ISO week key → { km, runs }
  const weekMap = new Map<string, { km: number; runs: number }>()

  for (const activity of activities) {
    const key = isoWeekKey(new Date(activity.activity_date))
    const existing = weekMap.get(key) ?? { km: 0, runs: 0 }
    weekMap.set(key, {
      km: existing.km + activity.distance_km,
      runs: existing.runs + 1,
    })
  }

  // Build 4-week array: offsets 3, 2, 1, 0 → labels W-3, W-2, W-1, This
  const offsets: Array<{ offset: number; label: string; current: boolean }> = [
    { offset: 3, label: 'W-3', current: false },
    { offset: 2, label: 'W-2', current: false },
    { offset: 1, label: 'W-1', current: false },
    { offset: 0, label: 'This', current: true },
  ]

  return offsets.map(({ offset, label, current }) => {
    const key = isoWeekKeyForOffset(offset)
    const data = weekMap.get(key) ?? { km: 0, runs: 0 }
    return {
      label,
      km: Math.round(data.km * 10) / 10,
      runs: data.runs,
      current,
    }
  })
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ActivitiesPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#1a1612] flex justify-center items-start py-10 px-5">
      <div className="bg-[#f4efe4] text-[#141210] w-[980px] max-w-full px-9 pt-7 pb-10">
        {/* Top rail skeleton */}
        <div className="h-3 w-full animate-pulse bg-[rgba(20,18,16,0.08)] rounded mb-4" />

        {/* Masthead skeleton */}
        <div className="h-20 w-3/4 mx-auto animate-pulse bg-[rgba(20,18,16,0.08)] rounded mb-4" />

        {/* Double rule skeleton */}
        <div className="h-1 w-full animate-pulse bg-[rgba(20,18,16,0.08)] rounded mb-6" />

        {/* Lead story skeleton */}
        <div className="grid grid-cols-[1.35fr_1fr] gap-7 mb-6">
          <div className="space-y-3">
            <div className="h-3 w-1/3 animate-pulse bg-[rgba(20,18,16,0.08)] rounded" />
            <div className="h-16 w-full animate-pulse bg-[rgba(20,18,16,0.08)] rounded" />
            <div className="h-4 w-2/3 animate-pulse bg-[rgba(20,18,16,0.08)] rounded" />
          </div>
          <div className="h-40 animate-pulse bg-[rgba(20,18,16,0.08)] rounded" />
        </div>

        {/* Previous editions skeleton rows */}
        <div className="flex gap-7">
          <div className="flex-1 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 w-full animate-pulse bg-[rgba(20,18,16,0.08)] rounded"
              />
            ))}
          </div>
          {/* Sidebar skeleton */}
          <div className="w-[260px] shrink-0 space-y-3">
            <div className="h-4 w-1/2 animate-pulse bg-[rgba(20,18,16,0.08)] rounded" />
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-8 w-full animate-pulse bg-[rgba(20,18,16,0.08)] rounded"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ActivitiesPageError() {
  return (
    <div className="min-h-screen bg-[#1a1612] flex justify-center items-start py-10 px-5">
      <div className="bg-[#f4efe4] text-[#141210] w-[980px] max-w-full px-9 pt-7 pb-10">
        <p className="font-body italic text-[13px] opacity-60 p-8">
          Could not load your runs. Make sure the API is running.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivitiesPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    data: activities,
    isLoading,
    isError,
    error,
  } = useQuery<Activity[], ApiError>({
    queryKey: ['activities'],
    queryFn: getActivities,
    retry: (failureCount, err) => {
      if (isUnauthorized(err)) return false
      return failureCount < 2
    },
  })

  // Redirect to login on 401
  useEffect(() => {
    if (isError && error && isUnauthorized(error)) {
      router.replace('/')
    }
  }, [isError, error, router])

  const handleActivityClick = useCallback(
    (id: number) => {
      router.push(`/activities/${id}`)
    },
    [router],
  )

  // GET /activities triggers a Strava sync on every call (per api-spec-v2.md).
  // Invalidating the query re-fetches getActivities(), which causes the backend to sync.
  const handleRefreshSync = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['activities'] })
  }, [queryClient])

  if (isLoading) {
    return <ActivitiesPageSkeleton />
  }

  if (isError && !isUnauthorized(error)) {
    return <ActivitiesPageError />
  }

  const items = activities ?? []
  const weeklyKm = computeWeeklyKm(items)

  return (
    <FrontPage
      activities={items}
      weeklyKm={weeklyKm}
      lastSyncedAt={null}
      onActivityClick={handleActivityClick}
      onRefreshSync={handleRefreshSync}
    />
  )
}
