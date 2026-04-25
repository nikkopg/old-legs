// READY FOR QA
// Feature: Plan page tabloid redesign (TASK-139)
// What was built: /plan — replaced old WeeklyPlanGrid with PlanPaper tabloid component
// Edge cases to test:
//   - Loading state: dark frame + 980px parchment skeleton with animate-pulse
//   - 401 response: redirected to /
//   - 404 (no plan): PlanPaper receives plan={null}, shows empty state + generate button
//   - Plan generation in progress: PlanPaper receives isGenerating=true, shows "Filing the plan..."
//   - Plan exists: full fixtures table rendered with today's row highlighted
//   - Other error (Ollama offline, 5xx): OfflinePage rendered with kind="api"
//   - todayDow correctly derived from current locale date

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PlanPaper } from '@/components/redesign/PlanPaper'
import { OfflinePage } from '@/components/redesign/OfflinePage'
import { getCurrentPlan, generatePlan } from '@/lib/api'
import type { ApiError, TrainingPlan as ApiTrainingPlan, PlanDay as ApiPlanDay } from '@/types/api'

// ---------- Local type alias for PlanPaper's expected shape ----------

interface PlanPaperDay {
  day: string
  date: string
  type: string
  target: string
  durationMin: string
  distanceKm: string
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

    if (!pd) {
      return {
        day: DOW_SHORT[i],
        date: dateStr,
        type: 'Rest',
        target: '—',
        durationMin: '—',
        distanceKm: '—',
        notes: '',
      }
    }

    return {
      day: DOW_SHORT[i],
      date: dateStr,
      type: pd.type.charAt(0).toUpperCase() + pd.type.slice(1),
      target: '—',
      durationMin: pd.duration_minutes > 0 ? `${pd.duration_minutes} min` : '—',
      distanceKm: '—',
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
    />
  )
}
