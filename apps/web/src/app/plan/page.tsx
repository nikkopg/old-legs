// READY FOR QA
// Feature: Plan page tabloid redesign (TASK-139, updated TASK-148)
// What was built: /plan — PlanPaper with REALIZATION column matching activities to plan days
// Edge cases to test:
//   - Loading state: dark frame + 980px parchment skeleton with animate-pulse
//   - 401 response: redirected to /
//   - 404 (no plan): PlanPaper receives plan={null}, shows empty state + generate button
//   - Plan generation in progress: PlanPaper receives isGenerating=true, shows "Filing the plan..."
//   - Plan exists: full fixtures table rendered with today's row highlighted
//   - Other error (Ollama offline, 5xx): OfflinePage rendered with kind="api"
//   - todayDow correctly derived from current locale date
//   - activities still loading: realizations={} so plan renders immediately without blocking
//   - activities loaded: each plan day matched by isoDate to first activity on that date
//   - REST day where user ran anyway: ActivityMatch present, "RAN" label shown in accent

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PlanPaper } from '@/components/redesign/PlanPaper'
import { OfflinePage } from '@/components/redesign/OfflinePage'
import { getCurrentPlan, generatePlan, getActivities, getPlanVerdict } from '@/lib/api'
import type { ApiError, TrainingPlan as ApiTrainingPlan, PlanDay as ApiPlanDay, Activity } from '@/types/api'

// ---------- Local type aliases for PlanPaper's expected shape ----------

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
  isoDate: string       // YYYY-MM-DD for realization matching
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

// ---------- Helper: map API TrainingPlan → PlanPaperPlan ----------

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
    // Format as YYYY-MM-DD for activity matching
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

  // Combine all pak_har_notes into the editor's note
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

// ---------- Helper: build realizations map from activities ----------

const DOW_OFFSET: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

function buildRealizations(
  activities: Activity[],
  weekStartDate: string,
  planData: Record<string, ApiPlanDay>,
): Record<string, ActivityMatch | null> {
  const result: Record<string, ActivityMatch | null> = {}
  const base = new Date(weekStartDate)

  for (const dayName of Object.keys(DOW_OFFSET)) {
    const offset = DOW_OFFSET[dayName]
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const isoDate = `${d.getFullYear()}-${mm}-${dd}`

    // Only build the map for days that exist in the plan
    if (!(dayName in planData)) continue

    const activity = activities.find(
      (a) => a.activity_date.slice(0, 10) === isoDate,
    ) ?? null

    if (activity) {
      result[isoDate] = {
        activityId: activity.id,
        distanceKm: activity.distance_km,
        durationMin: Math.round(activity.moving_time_seconds / 60),
        verdictShort: activity.verdict_short ?? null,
        verdictTag: activity.verdict_tag ?? null,
        tone: activity.tone ?? null,
      }
    } else {
      result[isoDate] = null
    }
  }

  return result
}

// ---------- Helpers: error classification ----------

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

function isNotFound(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 404
}

// ---------- Page ----------

export default function PlanPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isGenerating, setIsGenerating] = useState(false)

  const {
    data: rawPlan,
    isLoading,
    isError,
    error,
  } = useQuery<ApiTrainingPlan, ApiError>({
    queryKey: ['plan', 'current'],
    queryFn: getCurrentPlan,
    retry: (failureCount, err) => {
      if (isUnauthorized(err) || isNotFound(err)) return false
      return failureCount < 2
    },
  })

  const { data: activities, isLoading: activitiesLoading } = useQuery<Activity[], ApiError>({
    queryKey: ['activities'],
    queryFn: getActivities,
    retry: 1,
  })

  useEffect(() => {
    if (isError && error && isUnauthorized(error)) {
      router.replace('/')
    }
  }, [isError, error, router])

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await generatePlan()
      await queryClient.invalidateQueries({ queryKey: ['plan', 'current'] })
    } catch {
      // PlanPaper handles the empty/error state; generation errors surface via
      // the re-fetch returning 404 again, which keeps plan={null}.
    } finally {
      setIsGenerating(false)
    }
  }

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

  const noPlanYet = isError && error && isNotFound(error)
  const otherError = isError && !noPlanYet && !isUnauthorized(error)

  const mappedPlan: PlanPaperPlan | null = rawPlan ? mapPlan(rawPlan) : null

  const realizations: Record<string, ActivityMatch | null> =
    !activitiesLoading && activities && rawPlan
      ? buildRealizations(activities, rawPlan.week_start_date.toString(), rawPlan.plan_data as Record<string, ApiPlanDay>)
      : {}

  const planDays: PlanPaperDay[] = mappedPlan?.days ?? []

  const planVerdictQueries = useQueries({
    queries: planDays
      .filter((d) => d.isoDate && realizations[d.isoDate] && d.target && d.target !== '—')
      .map((d) => {
        const match = realizations[d.isoDate]!
        return {
          queryKey: ['plan-verdict', match.activityId, d.target] as const,
          queryFn: () => getPlanVerdict(match.activityId, d.target, d.type),
          staleTime: Infinity,
        }
      }),
  })

  const planVerdicts: Record<string, { verdict_short: string | null; verdict_tag: string | null; tone: string | null } | null> =
    Object.fromEntries(
      planDays
        .filter((d) => d.isoDate && realizations[d.isoDate] && d.target && d.target !== '—')
        .map((d, i) => [d.isoDate, planVerdictQueries[i]?.data ?? null]),
    )

  const todayDow = new Date().toLocaleDateString('en-US', { weekday: 'short' })

  if (isLoading) {
    return (
      <div
        style={{ background: '#f4efe4', minHeight: '100vh' }}
        className="animate-pulse"
      />
    )
  }

  if (otherError) {
    return (
      <OfflinePage
        kind="api"
        onRetry={() => window.location.reload()}
        onNav={onNav}
      />
    )
  }

  return (
    <PlanPaper
      plan={mappedPlan}
      isGenerating={isGenerating}
      onGeneratePlan={handleGenerate}
      onOpenCoach={() => router.push('/coach')}
      onNav={onNav}
      todayDow={todayDow}
      realizations={realizations}
      planVerdicts={planVerdicts}
    />
  )
}
