// READY FOR QA
// Feature: Dashboard hub page — TASK-114 + TASK-118 (WeeklyReviewCard) + TASK-119 (InsightsSection)
// What was built:
//   The dashboard weekly hub now includes:
//     1. Weekly stats strip — total km, total runs, total time for the current Mon–Sun window
//     2. Today's plan card — highlights today's PlanDay (type badge + description + duration)
//        or a prompt to generate a plan if none exists
//     3. Last run snapshot — most recent activity (date, distance, pace, optional HR)
//        with Pak Har's stored one-liner analysis if available, or a static fallback line
//        that matches his voice
//     4. WeeklyReviewCard (TASK-118) — Pak Har's planned vs actual review for the current week
//     5. InsightsSection (TASK-119) — 6-week aggregated trends + Pak Har multi-week commentary
//     6. Chat CTA — a plain link to /coach
// Edge cases to test:
//   - No activities at all (stat strip shows zeros; last run section hidden; correct empty copy shown)
//   - No plan yet (today's plan section shows "No plan this week" + link to /plan)
//   - Activities exist but none in the current week (stats show zeros; last run still shown)
//   - Today is a rest day (today's plan shows the rest day card with muted style)
//   - lastRun has no analysis yet (fallback Pak Har line shown, not null)
//   - lastRun has no HR (HR stat row hidden)
//   - 401 on any fetch (redirect to /)
//   - API unreachable (non-401 error — error notice shown; rest of page does not crash)
//   - Loading state (skeleton blocks shown for each section)
//   - WeeklyReviewCard: 404 on GET /review/current → no review yet state; POST errors surfaced
//   - InsightsSection: 404 → "Not enough data yet"; 503/504 → Ollama error message

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout'
import { Badge } from '@/components/ui'
import { WeeklyReviewCard } from '@/components/review/WeeklyReviewCard'
import { InsightsSection } from '@/components/insights/InsightsSection'
import { useDashboard } from '@/hooks/useDashboard'
import { formatDistance, formatDuration, formatPace, formatDate } from '@/lib/formatters'
import type { PlanDay } from '@/types/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

// Pak Har fallback line shown when no LLM analysis is stored for the last run.
// Must match his voice — blunt, specific, no hollow positivity.
const PAK_HAR_NO_ANALYSIS_FALLBACK =
  "Run logged. That's the only part that matters right now. Get the analysis when you're ready."

const TYPE_BADGE: Record<string, 'success' | 'accent' | 'muted' | 'neutral'> = {
  easy: 'success',
  tempo: 'accent',
  long: 'accent',
  rest: 'muted',
  cross: 'neutral',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionSkeleton({ height = 'h-20' }: { height?: string }) {
  return <div className={`bg-surface-raised animate-pulse rounded-md ${height} w-full`} />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
      {children}
    </p>
  )
}

// --- Weekly stats strip ---

interface WeeklyStatsCellProps {
  label: string
  value: string
}

function WeeklyStatsCell({ label, value }: WeeklyStatsCellProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xl font-semibold text-text-primary">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  )
}

interface WeeklyStatsStripProps {
  totalKm: number
  totalRuns: number
  totalTimeSeconds: number
}

function WeeklyStatsStrip({ totalKm, totalRuns, totalTimeSeconds }: WeeklyStatsStripProps) {
  return (
    <section>
      <SectionLabel>This week</SectionLabel>
      <div className="grid grid-cols-3 gap-4 bg-surface border border-border rounded-md p-4">
        <WeeklyStatsCell label="km" value={totalKm.toFixed(1)} />
        <WeeklyStatsCell label="runs" value={String(totalRuns)} />
        <WeeklyStatsCell label="time" value={formatDuration(totalTimeSeconds)} />
      </div>
    </section>
  )
}

// --- Today's plan card ---

interface TodayPlanCardProps {
  planDay: PlanDay | null
  hasPlan: boolean
}

function TodayPlanCard({ planDay, hasPlan }: TodayPlanCardProps) {
  const isRest = !planDay || planDay.type === 'rest'
  const badgeVariant = planDay ? (TYPE_BADGE[planDay.type] ?? 'neutral') : 'muted'

  return (
    <section>
      <SectionLabel>Today</SectionLabel>

      {!hasPlan && (
        <div className="bg-surface border border-border rounded-md p-4 flex flex-col gap-3">
          <p className="text-sm text-text-muted">
            No plan this week. Pak Har needs your recent runs to build one.
          </p>
          <Link
            href="/plan"
            className="text-sm text-accent underline-offset-2 hover:underline"
          >
            Build this week's plan
          </Link>
        </div>
      )}

      {hasPlan && !planDay && (
        <div className="bg-surface border border-border rounded-md p-4">
          <p className="text-sm text-text-muted">No session scheduled for today.</p>
        </div>
      )}

      {hasPlan && planDay && (
        <div
          className={[
            'bg-surface border rounded-md p-4 flex flex-col gap-3',
            isRest ? 'border-border opacity-70' : 'border-accent',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text-primary">
              {isRest ? 'Rest day' : planDay.type.charAt(0).toUpperCase() + planDay.type.slice(1)}
            </span>
            <Badge variant={badgeVariant}>{planDay.type}</Badge>
          </div>

          {!isRest && (
            <>
              {planDay.duration_minutes > 0 && (
                <span className="font-mono text-sm text-text-primary">
                  {planDay.duration_minutes} min
                </span>
              )}
              <p className="text-sm text-text-muted leading-relaxed">{planDay.description}</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// --- Last run snapshot ---

interface LastRunSnapshotProps {
  activity: NonNullable<ReturnType<typeof import('@/hooks/useDashboard').useDashboard>['lastRun']>
}

function LastRunSnapshot({ activity }: LastRunSnapshotProps) {
  const pakHarLine = activity.analysis
    ? // Only use the first sentence of the stored analysis so the card stays compact
      activity.analysis.split(/[.!?]/)[0]?.trim() + '.'
    : PAK_HAR_NO_ANALYSIS_FALLBACK

  return (
    <section>
      <SectionLabel>Last run</SectionLabel>
      <div className="bg-surface border border-border rounded-md p-4 flex flex-col gap-4">
        {/* Run meta */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-lg font-semibold text-text-primary">
            {formatDistance(activity.distance_km)}
          </span>
          <span className="font-mono text-sm text-text-muted">
            {formatPace(activity.average_pace_min_per_km)}/km
          </span>
          {activity.average_hr !== null && (
            <span className="text-xs text-text-muted">
              {activity.average_hr} bpm avg
            </span>
          )}
          <span className="text-xs text-text-muted ml-auto">
            {formatDate(activity.activity_date)}
          </span>
        </div>

        {/* Pak Har one-liner */}
        <p className="text-sm text-text-muted border-l-2 border-accent pl-3 leading-relaxed italic">
          {pakHarLine}
        </p>

        {/* Link to full analysis */}
        <Link
          href={`/activities/${activity.id}`}
          className="text-xs text-accent underline-offset-2 hover:underline self-start"
        >
          Full analysis
        </Link>
      </div>
    </section>
  )
}

// --- Chat CTA ---

function ChatCTA() {
  return (
    <section>
      <SectionLabel>Coach</SectionLabel>
      <div className="bg-surface border border-border rounded-md p-4 flex items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Have a question about your training? Pak Har will tell you what he actually thinks.
        </p>
        <Link
          href="/coach"
          className="shrink-0 text-sm text-accent underline-offset-2 hover:underline"
        >
          Talk to Pak Har
        </Link>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter()
  const { weeklyStats, todayPlan, lastRun, plan, isLoading, isError, isUnauthorized } =
    useDashboard()

  useEffect(() => {
    if (isUnauthorized) {
      router.replace('/')
    }
  }, [isUnauthorized, router])

  return (
    <PageWrapper
      userName={PLACEHOLDER_USER_NAME}
      avatarUrl={PLACEHOLDER_AVATAR_URL}
      pageTitle="Dashboard"
    >
      <div className="flex flex-col gap-6 max-w-2xl">
        {/* Error banner — only shown for non-auth errors */}
        {isError && !isUnauthorized && (
          <p className="text-sm text-text-muted">
            Could not load your data. Check that the API is running.
          </p>
        )}

        {/* Weekly stats */}
        {isLoading ? (
          <SectionSkeleton height="h-20" />
        ) : (
          <WeeklyStatsStrip
            totalKm={weeklyStats.totalKm}
            totalRuns={weeklyStats.totalRuns}
            totalTimeSeconds={weeklyStats.totalTimeSeconds}
          />
        )}

        {/* Today's plan */}
        {isLoading ? (
          <SectionSkeleton height="h-28" />
        ) : (
          <TodayPlanCard planDay={todayPlan} hasPlan={plan !== null} />
        )}

        {/* Last run snapshot */}
        {isLoading ? (
          <SectionSkeleton height="h-32" />
        ) : lastRun ? (
          <LastRunSnapshot activity={lastRun} />
        ) : (
          <section>
            <SectionLabel>Last run</SectionLabel>
            <div className="bg-surface border border-border rounded-md p-4">
              <p className="text-sm text-text-muted">
                No runs synced yet. Connect your Strava account to get started.
              </p>
            </div>
          </section>
        )}

        {/* Weekly review — Pak Har's planned vs actual commentary for this week */}
        {!isLoading && (
          <section>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              This week's review
            </p>
            <WeeklyReviewCard />
          </section>
        )}

        {/* 6-week insights — trend stats + Pak Har multi-week commentary */}
        {!isLoading && <InsightsSection />}

        {/* Chat CTA — always shown */}
        {!isLoading && <ChatCTA />}
      </div>
    </PageWrapper>
  )
}
