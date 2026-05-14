// READY FOR QA
// Feature: Dashboard page — TASK-184 (weekly review in Today's Lead)
// What was built:
//   Added non-blocking React Query for getCurrentReview().
//   Added onGenerateReview handler that calls generateWeeklyReview() and invalidates ['review'].
//   Passes weeklyReview and onGenerateReview to DashboardPaper.
//   DashboardPaper shows review_text prose when review exists, formula headline as fallback.
// Edge cases to test:
//   - Review exists → review_text shown as paragraphs, metadata "Filed week of X" above
//   - Review is null (404 / query fails) → heroHeadline() formula shown, "No weekly assessment yet. File this week →" link shown
//   - onGenerateReview click → POST /review/generate fires, ['review'] query invalidated on success
//   - review_text with multiple paragraphs (split on \n\n) → each rendered as <p>
//   - generateWeeklyReview() throws → silently ignored, user can retry
// Previous edge cases (TASK-137) still apply:
//   - No activities (lastRun=null) → DashboardPaper renders "No run dispatched yet."
//   - No plan (todayPlan=null) → DashboardPaper renders "No plan filed yet."
//   - isUnauthorized → redirect to /
//   - Non-auth API error → OfflinePage shown
//   - Loading state → skeleton block shown

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DashboardPaper } from '@/components/redesign/DashboardPaper'
import { OfflinePage } from '@/components/redesign/OfflinePage'
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton'
import { OnboardingModal } from '@/components/onboarding'
import { useDashboard } from '@/hooks/useDashboard'
import { useUser } from '@/hooks/useUser'
import { getCurrentReview, generateWeeklyReview } from '@/lib/api'
import { formatDuration, formatPace } from '@/lib/formatters'
import type { WeeklyReview } from '@/types/api'
import type { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { weeklyStats, todayPlan, lastRun, isLoading, isError, isUnauthorized } = useDashboard()
  const { user } = useUser()
  const [onboardingDone, setOnboardingDone] = useState(false)

  // Non-blocking weekly review query — failures are silently treated as null
  const { data: reviewData } = useQuery<WeeklyReview, ApiError>({
    queryKey: ['review'],
    queryFn: getCurrentReview,
    retry: false,
  })

  const [reviewGenerating, setReviewGenerating] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const onGenerateReview = async () => {
    setReviewGenerating(true)
    setReviewError(null)
    try {
      await generateWeeklyReview()
      await queryClient.invalidateQueries({ queryKey: ['review'] })
    } catch (err) {
      const apiErr = err as ApiError
      setReviewError(apiErr?.detail ?? 'Could not file the week. Is Ollama running?')
    } finally {
      setReviewGenerating(false)
    }
  }

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
    return <PageLoadingSkeleton />
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
    targetKm: user?.weekly_km_target ?? null,
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

  const lastSyncedAt = lastRun?.updated_at ?? null

  return (
    <>
      <DashboardPaper
        weeklyStats={mappedWeeklyStats}
        todayPlan={mappedTodayPlan}
        lastRun={mappedLastRun}
        lastSyncedAt={lastSyncedAt}
        weeklyReview={reviewData ?? null}
        onGenerateReview={onGenerateReview}
        reviewGenerating={reviewGenerating}
        reviewError={reviewError}
        onOpenRun={(id) => router.push(`/activities/${id}`)}
        onOpenPlan={() => router.push('/plan')}
        onNav={onNav}
      />
      {user !== null && !user.onboarding_completed && !onboardingDone && (
        <OnboardingModal onComplete={() => setOnboardingDone(true)} />
      )}
    </>
  )
}
