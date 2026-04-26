// READY FOR QA
// Feature: Dashboard page — TASK-137 (DashboardPaper tabloid redesign)
// What was built:
//   Replaced the old hub layout with the DashboardPaper tabloid component.
//   - Uses useDashboard hook for weekly stats, today's plan, and last run.
//   - Separate non-blocking React Query for getInsights().
//   - Maps API shapes to DashboardPaperProps exactly per task spec.
//   - Dark-frame wrapper matches activities/page.tsx pattern.
//   - Loading → paper-coloured skeleton block with animate-pulse.
//   - isUnauthorized → router.replace('/').
//   - API error → OfflinePage with kind="api" and reload retry.
// Edge cases to test:
//   - No activities (lastRun=null) → DashboardPaper renders "No run dispatched yet."
//   - No plan (todayPlan=null) → DashboardPaper renders "No plan filed yet."
//   - Insights query fails (insights=null) → DashboardPaper renders "No column yet."
//   - isUnauthorized → redirect to /
//   - Non-auth API error → OfflinePage shown
//   - Loading state → skeleton block shown

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DashboardPaper } from '@/components/redesign/DashboardPaper'
import { OfflinePage } from '@/components/redesign/OfflinePage'
import { OnboardingModal } from '@/components/onboarding'
import { useDashboard } from '@/hooks/useDashboard'
import { useUser } from '@/hooks/useUser'
import { getInsights } from '@/lib/api'
import { formatDuration, formatPace } from '@/lib/formatters'
import type { Insights } from '@/types/api'
import type { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter()

  const { weeklyStats, todayPlan, lastRun, isLoading, isError, isUnauthorized } = useDashboard()
  const { user } = useUser()
  const [onboardingDone, setOnboardingDone] = useState(false)

  // Non-blocking insights query — failures are silently treated as null
  const { data: insightsData } = useQuery<Insights, ApiError>({
    queryKey: ['insights'],
    queryFn: getInsights,
    retry: false,
  })

  // Redirect to login if not authenticated
  useEffect(() => {
    if (isUnauthorized) {
      router.replace('/')
    }
  }, [isUnauthorized, router])

  // Navigation handler — maps nav keys to routes
  const onNav = (key: string) => {
    const routes: Record<string, string> = {
      dashboard: '/dashboard',
      activities: '/activities',
      plan: '/plan',
      coach: '/coach',
      settings: '/settings',
    }
    if (routes[key]) router.push(routes[key])
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{ background: '#f4efe4', minHeight: '100vh' }}
        className="animate-pulse"
      />
    )
  }

  // Error state (non-auth errors only — auth redirects are handled above via useEffect)
  if (isError && !isUnauthorized) {
    return (
      <OfflinePage
        kind="api"
        onRetry={() => window.location.reload()}
        onNav={onNav}
      />
    )
  }

  // --- Map API data to DashboardPaperProps ---

  const mappedWeeklyStats = {
    totalKm: weeklyStats.totalKm,
    totalRuns: weeklyStats.totalRuns,
    totalTimeSec: weeklyStats.totalTimeSeconds,
    targetKm: 40, // default — user preferences not yet in frontend
  }

  const mappedTodayPlan = todayPlan
    ? {
        type: todayPlan.type,
        durationMinutes: todayPlan.duration_minutes,
        targetHr: 148, // default until user pref wired
        description: todayPlan.description,
        date: new Date().toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
      }
    : null

  const mappedLastRun = lastRun
    ? {
        id: lastRun.id,
        date: new Date(lastRun.activity_date).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        title: lastRun.name,
        route: lastRun.name,
        distanceKm: lastRun.distance_km,
        time: formatDuration(lastRun.moving_time_seconds),
        pace: formatPace(lastRun.average_pace_min_per_km),
        avgHr: lastRun.average_hr,
        tone: lastRun.tone ?? ('neutral' as const),
        verdictTag: lastRun.verdict_tag ?? '',
        verdictShort: lastRun.verdict_short ?? lastRun.name,
        analysisSnippet: lastRun.analysis
          ? (lastRun.analysis.split(/[.!?]/)[0]?.trim() || null)
          : null,
      }
    : null

  const mappedInsights = insightsData
    ? {
        commentary: insightsData.pak_har_commentary,
        weeklyKmTrend: [], // not in insights endpoint — DashboardPaper handles gracefully
        avgHr: null,
        loadChangePct: null,
      }
    : null

  const lastSyncedAt = lastRun?.updated_at ?? null

  return (
    <>
      <DashboardPaper
        weeklyStats={mappedWeeklyStats}
        todayPlan={mappedTodayPlan}
        lastRun={mappedLastRun}
        insights={mappedInsights}
        lastSyncedAt={lastSyncedAt}
        onOpenRun={(id) => router.push(`/activities/${id}`)}
        onOpenPlan={() => router.push('/plan')}
        onOpenCoach={() => router.push('/coach')}
        onNav={onNav}
      />
      {user !== null && !user.onboarding_completed && !onboardingDone && (
        <OnboardingModal onComplete={() => setOnboardingDone(true)} />
      )}
    </>
  )
}
