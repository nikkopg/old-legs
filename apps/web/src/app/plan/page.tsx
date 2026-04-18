// READY FOR QA
// Feature: Weekly plan page (TASK-021)
// What was built: /plan — displays active training plan or empty state with generate button
// Edge cases to test:
//   - No plan yet (404 from GET /plan/current — shows empty state with "Build this week's plan")
//   - Plan generation in progress (spinner + "Pak Har is working on it.")
//   - Plan generation fails — Ollama offline (error message shown inline)
//   - Plan exists (WeeklyPlanGrid renders all 7 days correctly)
//   - Today's day highlighted with accent border
//   - Rest days rendered with muted opacity
//   - 401 response (redirect to /)

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageWrapper } from '@/components/layout'
import { WeeklyPlanGrid } from '@/components/plan'
import { Button, Spinner } from '@/components/ui'
import { getCurrentPlan, generatePlan } from '@/lib/api'
import type { ApiError, TrainingPlan } from '@/types/api'

const PLACEHOLDER_USER_NAME = 'Runner'
const PLACEHOLDER_AVATAR_URL = null

function isUnauthorized(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 401 || apiErr?.detail === 'Not authenticated'
}

function isNotFound(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 404
}

export default function PlanPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const {
    data: plan,
    isLoading,
    isError,
    error,
  } = useQuery<TrainingPlan, ApiError>({
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
    setGenerateError(null)
    try {
      await generatePlan()
      await queryClient.invalidateQueries({ queryKey: ['plan', 'current'] })
    } catch (err) {
      const apiErr = err as ApiError
      setGenerateError(apiErr.detail ?? 'Plan generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const noPlanYet = isError && error && isNotFound(error)
  const otherError = isError && !noPlanYet && !isUnauthorized(error)

  return (
    <PageWrapper
      userName={PLACEHOLDER_USER_NAME}
      avatarUrl={PLACEHOLDER_AVATAR_URL}
      pageTitle="This week"
    >
      {isLoading && (
        <div className="h-48 bg-surface-raised animate-pulse rounded-sm" />
      )}

      {isGenerating && (
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <Spinner size="sm" />
          <span>Pak Har is working on it.</span>
        </div>
      )}

      {!isLoading && !isGenerating && noPlanYet && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            No plan yet. Pak Har will build one based on your recent runs.
          </p>
          {generateError && (
            <p className="text-sm text-error">{generateError}</p>
          )}
          <Button variant="ghost" size="sm" onClick={handleGenerate}>
            Build this week's plan
          </Button>
        </div>
      )}

      {!isLoading && !isGenerating && otherError && (
        <p className="text-sm text-text-muted">
          Could not load the plan. Check that the API is running.
        </p>
      )}

      {!isLoading && !isGenerating && plan && (
        <div className="flex flex-col gap-6">
          <WeeklyPlanGrid plan={plan} />
          {generateError && (
            <p className="text-sm text-error">{generateError}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            Regenerate plan
          </Button>
        </div>
      )}
    </PageWrapper>
  )
}
