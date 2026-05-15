// READY FOR QA
// Feature: Dashboard page — TASK-188 (inline SSE progress strip for review generation)
// What was built:
//   Replaced generateWeeklyReview() mutation with useProgressStream<ReviewStreamComplete>.
//   Progress strip props (reviewSteps, reviewElapsedMs, reviewStreaming) wired into DashboardPaper.
//   On complete: local streamedReview state set immediately, ['review'] query invalidated.
//   On error: reviewError state set, user can retry via trigger().
// Edge cases to test:
//   - isStreaming=true → progress strip renders in DashboardPaper lead area (replaces "File this week →")
//   - progress events → step status updates (pending → running → done)
//   - complete event → strip unmounts, review prose renders from streamedReview immediately
//   - ['review'] invalidation after complete → React Query refetches, reviewData takes over from streamedReview
//   - error event → "Pak Har could not file this week." message + "Try again →" link calling trigger()
//   - reviewError while weeklyReview exists → error shown below existing review
//   - trigger() called while already streaming → no-op (hook guards double-trigger)
// Previous edge cases (TASK-184) still apply:
//   - Review exists → review_text shown as paragraphs, metadata "Filed week of X" above
//   - Review is null (404 / query fails) → heroHeadline() formula shown, "No weekly assessment yet. File this week →" link shown
//   - review_text with multiple paragraphs (split on \n\n) → each rendered as <p>
// Previous edge cases (TASK-137) still apply:
//   - No activities (lastRun=null) → DashboardPaper renders "No run dispatched yet."
//   - No plan (todayPlan=null) → DashboardPaper renders "No plan filed yet."
//   - isUnauthorized → redirect to /
//   - Non-auth API error → OfflinePage shown
//   - Loading state → skeleton block shown

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DashboardPaper } from '@/components/redesign/DashboardPaper'
import { OfflinePage } from '@/components/redesign/OfflinePage'
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton'
import { OnboardingModal } from '@/components/onboarding'
import { useDashboard } from '@/hooks/useDashboard'
import { useUser } from '@/hooks/useUser'
import { getCurrentReview, getCurrentPlan } from '@/lib/api'
import { useProgressStream } from '@/hooks/useProgressStream'
import { formatDuration, formatPace } from '@/lib/formatters'
import type { WeeklyReview, TrainingPlan } from '@/types/api'
import type { ApiError } from '@/types/api'

// Shape of the complete event data from POST /review/generate (SSE)
// Note: the field is `text` (not `review_text`) — mapping happens in onComplete
interface ReviewStreamComplete {
  text: string
  headline: string | null
  verdict_tag: string | null
  tone: 'critical' | 'good' | 'neutral' | null
}

const REVIEW_STEPS = [
  "Counting this week's runs",
  'Reading your zone breakdown',
  'Checking last week',
  'Writing the assessment',
  'Filing the headline',
]

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

  // Non-blocking plan query — used to compute planned runs this week
  const { data: planData } = useQuery<TrainingPlan, ApiError>({
    queryKey: ['plan'],
    queryFn: getCurrentPlan,
    retry: false,
  })

  // Count non-rest days in the active plan as planned sessions this week
  const plannedRunsThisWeek: number | null = planData
    ? Object.values(planData.plan_data).filter(
        (d) => d.type !== 'rest' && d.type !== 'off'
      ).length || null
    : null

  // Optimistic review data rendered immediately from the stream complete event
  // Once ['review'] query refetches, reviewData from React Query takes over
  const [streamedReview, setStreamedReview] = useState<ReviewStreamComplete | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

  const onStreamComplete = useCallback(
    (data: ReviewStreamComplete) => {
      setStreamedReview(data)
      setReviewError(null)
      queryClient.invalidateQueries({ queryKey: ['review'] })
    },
    [queryClient],
  )

  const onStreamError = useCallback((message: string) => {
    setReviewError(message)
  }, [])

  const { steps: reviewSteps, elapsedMs: reviewElapsedMs, isStreaming: reviewStreaming, streamedText: reviewStreamedText, trigger } =
    useProgressStream<ReviewStreamComplete>({
      url: `${apiBase}/review/generate`,
      method: 'POST',
      stepLabels: REVIEW_STEPS,
      onComplete: onStreamComplete,
      onError: onStreamError,
    })

  const onGenerateReview = useCallback(() => {
    setReviewError(null)
    trigger()
  }, [trigger])

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
    plannedRuns: plannedRunsThisWeek,
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

  // Effective review: prefer persisted data from React Query; fall back to optimistic stream data
  const effectiveReview: WeeklyReview | null =
    reviewData ??
    (streamedReview !== null
      ? {
          id: 0,
          user_id: 0,
          week_start_date: new Date().toISOString().slice(0, 10),
          planned_runs: 0,
          actual_runs: 0,
          review_text: streamedReview.text,
          created_at: new Date().toISOString(),
          headline: streamedReview.headline,
          verdict_tag: streamedReview.verdict_tag,
          tone: streamedReview.tone,
        }
      : null)

  return (
    <>
      <DashboardPaper
        weeklyStats={mappedWeeklyStats}
        todayPlan={mappedTodayPlan}
        lastRun={mappedLastRun}
        lastSyncedAt={lastSyncedAt}
        weeklyReview={effectiveReview}
        onGenerateReview={onGenerateReview}
        reviewStreaming={reviewStreaming}
        reviewStreamedText={reviewStreamedText}
        reviewSteps={reviewSteps}
        reviewElapsedMs={reviewElapsedMs}
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
