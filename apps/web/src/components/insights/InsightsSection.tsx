// READY FOR QA
// Feature: Insights section — 6-week trend stats + Pak Har multi-week commentary (TASK-119)
// What was built:
//   - InsightsSection component rendered on the dashboard below the weekly review card
//   - Fetches GET /insights via React Query using getInsights() from lib/api.ts
//   - 3-stat row: avg weekly km, avg pace (formatted as M:SS /km), consistency %
//   - Pace trend label: plain text "Pace: improving | declining | stable" — no arrows, no colour coding
//   - Pak Har commentary block with accent left border, plain prose, no markdown
//   - "Based on N weeks of runs." footnote in muted text
//   - Loading state: skeleton blocks
//   - 404 state: "Not enough data yet. Keep running."
//   - 503/504 state: "Pak Har is unavailable right now. Make sure Ollama is running."
//   - All numeric stats: font-mono text-xl (.font-stats class)
// Edge cases to test:
//   - Fewer than 2 weeks of data → 404 → muted empty state shown, no crash
//   - Ollama offline → 503/504 → specific error message shown
//   - 401 → handled upstream by dashboard redirect; InsightsSection will show nothing loaded
//   - pace_trend values: all three ("improving", "declining", "stable")
//   - avg_pace_min_per_km with decimal seconds that round to 60 (e.g. 5.9999 → should produce 6:00)
//   - Very long pak_har_commentary (wraps correctly in the prose block)

'use client'

import { useQuery } from '@tanstack/react-query'
import { getInsights } from '@/lib/api'
import type { ApiError, Insights } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a float pace (e.g. 5.82) to a "M:SS /km" string.
 * Minutes = integer part. Seconds = round(decimal × 60), zero-padded.
 * Edge case: if rounded seconds === 60, carry one minute.
 */
function formatPaceFloat(paceMinPerKm: number): string {
  const totalMinutesFloat = paceMinPerKm
  let minutes = Math.floor(totalMinutesFloat)
  let seconds = Math.round((totalMinutesFloat - minutes) * 60)

  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }

  const paddedSeconds = String(seconds).padStart(2, '0')
  return `${minutes}:${paddedSeconds} /km`
}

function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'detail' in err
}

function getErrorStatus(err: unknown): number | undefined {
  if (isApiError(err)) return err.status
  return undefined
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function InsightsSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading insights">
      {/* Stat row skeleton */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="bg-surface-raised animate-pulse rounded-sm h-7 w-16" />
            <div className="bg-surface-raised animate-pulse rounded-sm h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Trend label skeleton */}
      <div className="bg-surface-raised animate-pulse rounded-sm h-4 w-32 mb-4" />
      {/* Commentary block skeleton */}
      <div className="border-l-4 border-accent pl-4 flex flex-col gap-2">
        <div className="bg-surface-raised animate-pulse rounded-sm h-4 w-full" />
        <div className="bg-surface-raised animate-pulse rounded-sm h-4 w-5/6" />
        <div className="bg-surface-raised animate-pulse rounded-sm h-4 w-3/4" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Loaded state
// ---------------------------------------------------------------------------

interface InsightsContentProps {
  data: Insights
}

function InsightsContent({ data }: InsightsContentProps) {
  return (
    <section>
      {/* 3-stat row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xl font-semibold text-text-primary">
            {data.avg_weekly_km.toFixed(1)}
          </span>
          <span className="text-sm text-text-muted">avg km / week</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xl font-semibold text-text-primary">
            {formatPaceFloat(data.avg_pace_min_per_km)}
          </span>
          <span className="text-sm text-text-muted">avg pace</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xl font-semibold text-text-primary">
            {data.consistency_pct}%
          </span>
          <span className="text-sm text-text-muted">consistency</span>
        </div>
      </div>

      {/* Pace trend — plain text, no colour coding, no arrows */}
      <p className="text-sm text-text-muted mb-4">
        Pace: {data.pace_trend}
      </p>

      {/* Pak Har commentary */}
      <div className="border-l-4 border-accent pl-4">
        <p className="text-sm text-text-primary leading-relaxed">{data.pak_har_commentary}</p>
      </div>

      {/* Weeks footnote */}
      <p className="text-sm text-text-muted mt-3">
        Based on {data.weeks_analyzed} {data.weeks_analyzed === 1 ? 'week' : 'weeks'} of runs.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// InsightsSection
// ---------------------------------------------------------------------------

export function InsightsSection() {
  const { data, isLoading, isError, error } = useQuery<Insights, ApiError>({
    queryKey: ['insights'],
    queryFn: getInsights,
    retry: (failureCount, err) => {
      const status = getErrorStatus(err)
      // Don't retry 401 (redirect handled upstream) or 404 (not enough data — permanent)
      if (status === 401 || status === 404) return false
      // Don't retry Ollama errors — they won't resolve with retries
      if (status === 503 || status === 504) return false
      return failureCount < 2
    },
  })

  if (isLoading) {
    return (
      <div className="bg-surface rounded-md border border-border shadow-card p-4">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
          6-week trends
        </p>
        <InsightsSkeleton />
      </div>
    )
  }

  if (isError) {
    const status = getErrorStatus(error)

    // 404 — not enough data yet
    if (status === 404) {
      return (
        <div className="bg-surface rounded-md border border-border shadow-card p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            6-week trends
          </p>
          <p className="text-sm text-text-muted">Not enough data yet. Keep running.</p>
        </div>
      )
    }

    // 503 / 504 — Ollama offline
    if (status === 503 || status === 504) {
      return (
        <div className="bg-surface rounded-md border border-border shadow-card p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            6-week trends
          </p>
          <p className="text-sm text-text-muted">
            Pak Har is unavailable right now. Make sure Ollama is running.
          </p>
        </div>
      )
    }

    // Generic error — don't crash, surface a plain message
    return (
      <div className="bg-surface rounded-md border border-border shadow-card p-4">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
          6-week trends
        </p>
        <p className="text-sm text-text-muted">
          Could not load insights. Check that the API is running.
        </p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-surface rounded-md border border-border shadow-card p-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
        6-week trends
      </p>
      <InsightsContent data={data} />
    </div>
  )
}
