// READY FOR QA
// Feature: Activity detail page (TASK-020)
// What was built: /activities/[id] — run stats + Pak Har post-run analysis trigger
// Edge cases to test:
//   - Activity with no HR data (HR row absent from StatGrid)
//   - Very short run (<1km)
//   - Analysis not yet generated (shows AnalysisBlock empty state with "Get his take")
//   - Analysis loading state (spinner + "Pak Har is thinking.")
//   - Analysis already exists on activity (shows text immediately)
//   - 401 response (redirect to /)
//   - Activity not found — 404 (show error state)
//   - Ollama offline during analysis (error message shown inline)

'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import { PageWrapper } from '@/components/layout'
import { StatGrid } from '@/components/activity'
import { AnalysisBlock } from '@/components/coach'
import { getActivity, analyzeActivity } from '@/lib/api'
import { formatDate } from '@/lib/formatters'
import type { Activity, ApiError } from '@/types/api'

const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return (
    apiErr?.detail?.startsWith('API error 401') ||
    apiErr?.detail === 'Not authenticated'
  )
}

export default function ActivityDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = Number(params.id)

  const [analysis, setAnalysis] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const {
    data: activity,
    isLoading,
    isError,
    error,
  } = useQuery<Activity, ApiError>({
    queryKey: ['activity', id],
    queryFn: () => getActivity(id),
    enabled: !isNaN(id),
    retry: (failureCount, err) => {
      if (isUnauthorized(err)) return false
      return failureCount < 2
    },
  })

  useEffect(() => {
    if (isError && error && isUnauthorized(error)) {
      router.replace('/')
    }
  }, [isError, error, router])

  useEffect(() => {
    if (activity?.analysis) {
      setAnalysis(activity.analysis)
    }
  }, [activity])

  async function handleAnalyze() {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const result = await analyzeActivity(id)
      setAnalysis(result.analysis)
    } catch (err) {
      const apiErr = err as ApiError
      setAnalyzeError(apiErr.detail ?? 'Analysis failed.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const pageTitle = activity
    ? `${activity.name} — ${formatDate(activity.activity_date)}`
    : 'Activity'

  return (
    <PageWrapper
      userName={PLACEHOLDER_USER_NAME}
      avatarUrl={PLACEHOLDER_AVATAR_URL}
      pageTitle={pageTitle}
    >
      {isLoading && (
        <div className="flex flex-col gap-6">
          <div className="h-24 bg-surface-raised animate-pulse rounded-sm" />
          <div className="h-32 bg-surface-raised animate-pulse rounded-sm" />
        </div>
      )}

      {isError && !isUnauthorized(error) && (
        <p className="text-sm text-text-muted">
          Could not load this run. Check that the API is running.
        </p>
      )}

      {activity && (
        <div className="flex flex-col gap-8">
          <StatGrid activity={activity} />

          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide">
              Pak Har's take
            </h2>
            {analyzeError && (
              <p className="text-sm text-error">{analyzeError}</p>
            )}
            <AnalysisBlock
              analysis={analysis}
              isLoading={isAnalyzing}
              onRequest={handleAnalyze}
            />
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
