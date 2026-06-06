// READY FOR QA
// Feature: Plan Archive viewer page — /plan/[id]
// What was built:
//   Read-only view of a historical training plan. Fetches via GET /plan/{id},
//   maps through mapPlan(), renders PlanPaper in viewer mode (no generate, no streaming).
//   Delete section below PlanPaper: idle → confirming → deleting, then redirect to /settings.
//   Back link at top to /settings.
// Edge cases to test:
//   - Loading state → PageLoadingSkeleton
//   - 401 → router.replace('/')
//   - 404 → "Plan not found." error state
//   - Other error → "Could not load this plan." error state
//   - Delete idle → confirming → deleting → redirect to /settings
//   - Delete cancel → returns to idle
//   - Delete API failure → stays on page (no silent swallow — let it throw, catch and stay idle)
//   - Plan with is_active=true renders correctly in viewer
//   - todayDow='' disables today highlight in PlanPaper

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { PlanPaper } from '@/components/redesign/PlanPaper'
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton'
import { OL } from '@/components/redesign/NewspaperChrome'
import { getPlan, deletePlan } from '@/lib/api'
import type { ApiError, TrainingPlan as ApiTrainingPlan, PlanDay as ApiPlanDay } from '@/types/api'

// ---------- Local type aliases (mirror of plan/page.tsx) ----------

interface ActivityMatch {
  activityId: number
  distanceKm: number
  durationMin: number
  verdictShort: string | null
  verdictTag: string | null
  tone: 'critical' | 'good' | 'neutral' | null
}

interface PlanPaperDay {
  day: string
  date: string
  isoDate: string
  type: string
  target: string
  durationMin: string
  notes: string
}

interface PlanPaperPlan {
  days: PlanPaperDay[]
  weekLabel: string
  dateRange: string
  editorNote: string
  filedAt: string
}

// ---------- Helper: map API TrainingPlan → PlanPaperPlan (verbatim from plan/page.tsx) ----------

function mapPlan(raw: ApiTrainingPlan): PlanPaperPlan {
  const weekStart = new Date(raw.week_start_date)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const DOW_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const days: PlanPaperDay[] = DOW_KEYS.map((key, i) => {
    const pd: ApiPlanDay | undefined = raw.plan_data[key]
    const dayDate = new Date(weekStart)
    dayDate.setDate(dayDate.getDate() + i)
    const dateStr = dayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    const mm = String(dayDate.getMonth() + 1).padStart(2, '0')
    const dd = String(dayDate.getDate()).padStart(2, '0')
    const isoDate = `${dayDate.getFullYear()}-${mm}-${dd}`

    if (!pd) {
      return {
        day: DOW_SHORT[i],
        date: dateStr,
        isoDate,
        type: 'Rest',
        target: '—',
        durationMin: '—',
        notes: '',
      }
    }

    return {
      day: DOW_SHORT[i],
      date: dateStr,
      isoDate,
      type: pd.type.charAt(0).toUpperCase() + pd.type.slice(1),
      target: pd.target ?? '—',
      durationMin: pd.duration_minutes > 0 ? `${pd.duration_minutes} min` : '—',
      notes: pd.description,
    }
  })

  const noteValues = DOW_KEYS
    .map((k) => raw.pak_har_notes[k])
    .filter((n): n is string => !!n)
  const editorNote =
    noteValues.length > 0 ? noteValues.join('\n\n') : 'Run the plan as written.'

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  const weekNum = Math.ceil(
    (weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) /
      (7 * 86400000),
  )

  return {
    days,
    weekLabel: `Week ${weekNum}`,
    dateRange: `${fmtDate(weekStart)}–${fmtDate(weekEnd)}`,
    editorNote,
    filedAt:
      new Date(raw.created_at).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }) +
      ' · ' +
      new Date(raw.created_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }),
  }
}

// ---------- Error helpers ----------

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

function isNotFound(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 404
}

// ---------- Page ----------

type DeleteState = 'idle' | 'confirming' | 'deleting'

export default function PlanViewerPage() {
  const params = useParams()
  const id = Number(params.id)
  const router = useRouter()

  const queryClient = useQueryClient()
  const [deleteState, setDeleteState] = useState<DeleteState>('idle')

  const {
    data: rawPlan,
    isLoading,
    isError,
    error,
  } = useQuery<ApiTrainingPlan, ApiError>({
    queryKey: ['plan', id],
    queryFn: () => getPlan(id),
    retry: (failureCount, err) => {
      if (isUnauthorized(err) || isNotFound(err)) return false
      return failureCount < 2
    },
  })

  useEffect(() => {
    if (isError && error && isUnauthorized(error)) {
      router.replace('/')
    }
  }, [isError, error, router])

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

  async function handleDelete() {
    setDeleteState('deleting')
    try {
      await deletePlan(id)
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
      await queryClient.invalidateQueries({ queryKey: ['plan', 'current'] })
      await queryClient.invalidateQueries({ queryKey: ['plan', 'next-target'] })
      router.push('/settings')
    } catch {
      // Stay on page — don't swallow silently, reset to idle so user can retry
      setDeleteState('idle')
    }
  }

  if (isLoading) {
    return <PageLoadingSkeleton />
  }

  if (isError && error && isNotFound(error)) {
    return (
      <div style={{
        maxWidth: 760,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: OL.mono,
        fontSize: 13,
        color: OL.ink,
      }}>
        Plan not found.
      </div>
    )
  }

  if (isError || !rawPlan) {
    return (
      <div style={{
        maxWidth: 760,
        margin: '60px auto',
        padding: '0 20px',
        fontFamily: OL.mono,
        fontSize: 13,
        color: OL.ink,
      }}>
        Could not load this plan.
      </div>
    )
  }

  const mappedPlan: PlanPaperPlan = mapPlan(rawPlan)
  const realizations: Record<string, ActivityMatch | null> = {}
  const planVerdicts: Record<string, { verdict_short: string | null; verdict_tag: string | null; tone: string | null } | null> = {}

  return (
    <>
      {/* Back link */}
      <div style={{
        maxWidth: 980,
        margin: '0 auto',
        padding: '18px 20px 0',
      }}>
        <Link
          href="/settings"
          style={{
            fontFamily: OL.mono,
            fontSize: 11,
            color: OL.muted,
            textDecoration: 'none',
            letterSpacing: 1,
          }}
        >
          &larr; Back to desk
        </Link>
      </div>

      <PlanPaper
        plan={mappedPlan}
        raceGoal={null}
        isStreaming={false}
        steps={[]}
        elapsedMs={0}
        streamError={null}
        onGeneratePlan={() => {}}
        onOpenCoach={() => router.push('/coach')}
        onNav={onNav}
        todayDow={''}
        realizations={realizations}
        planVerdicts={planVerdicts}
        nextTarget={null}
        isNextWeek={false}
        onSyncToWatch={() => {}}
        syncState={'idle'}
        syncResults={{}}
        hasConnectedWatch={false}
      />

      {/* Delete section */}
      <div style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '28px 20px 48px',
      }}>
        {deleteState === 'idle' && (
          <button
            onClick={() => setDeleteState('confirming')}
            style={{
              background: 'transparent',
              border: `1px solid ${OL.ink}`,
              color: OL.ink,
              fontFamily: OL.mono,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: 'pointer',
              borderRadius: 0,
            }}
          >
            Delete this plan
          </button>
        )}

        {deleteState === 'confirming' && (
          <div>
            <p style={{
              fontFamily: OL.body,
              fontSize: 13,
              lineHeight: 1.6,
              color: OL.ink,
              margin: '0 0 12px',
            }}>
              Delete this plan? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleDelete}
                style={{
                  background: 'transparent',
                  border: `1px solid ${OL.accent}`,
                  color: OL.accent,
                  fontFamily: OL.mono,
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteState('idle')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: OL.muted,
                  fontFamily: OL.body,
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {deleteState === 'deleting' && (
          <button
            disabled
            style={{
              background: 'transparent',
              border: `1px solid ${OL.muted}`,
              color: OL.muted,
              fontFamily: OL.mono,
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              padding: '8px 16px',
              cursor: 'not-allowed',
              borderRadius: 0,
              opacity: 0.5,
            }}
          >
            Deleting...
          </button>
        )}
      </div>
    </>
  )
}
