// READY FOR QA
// Feature: WeeklyReviewCard (TASK-118)
// What was built:
//   Card component that surfaces Pak Har's weekly planned-vs-actual review on the dashboard.
//   - Fetches GET /review/current on mount via React Query
//   - Shows planned_runs vs actual_runs as a stat line ("X of Y runs")
//   - Displays review_text as plain prose with accent left border
//   - "Get this week's review" button triggers POST /review/generate
//   - Skeleton loading state (no spinner, no text)
// Edge cases to test:
//   - 404 from GET /review/current — no review yet: shows prompt + generate button
//   - 404 from POST /review/generate — no active plan: shows "No active plan" message
//   - 503 from POST /review/generate — Ollama down: shows Ollama error message
//   - 429 from POST /review/generate — rate limit: shows rate limit message
//   - Generate replaces the current card view with fresh data on success
//   - Generating while a review already exists (re-generate): button still works
//   - Loading skeleton shown on initial fetch (before data arrives)

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCurrentReview, generateWeeklyReview } from '@/lib/api'
import { Button } from '@/components/ui'
import type { ApiError, WeeklyReview } from '@/types/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotFoundError(err: unknown): boolean {
  const apiErr = err as ApiError
  return apiErr?.status === 404
}

function errorMessage(err: unknown): string {
  const apiErr = err as ApiError
  if (apiErr?.status === 503 || apiErr?.status === 504) {
    return 'Pak Har is unavailable right now. Make sure Ollama is running.'
  }
  if (apiErr?.status === 429) {
    return 'Too many requests. Wait a moment before trying again.'
  }
  if (apiErr?.status === 404) {
    return 'No active plan — generate a plan first.'
  }
  return apiErr?.detail ?? 'Something went wrong.'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ReviewSkeleton() {
  return (
    <div className="bg-surface rounded-md border border-border shadow-card p-4 flex flex-col gap-4">
      <div className="bg-surface-raised animate-pulse rounded-sm h-4 w-24" />
      <div className="flex flex-col gap-2">
        <div className="bg-surface-raised animate-pulse rounded-sm h-3 w-full" />
        <div className="bg-surface-raised animate-pulse rounded-sm h-3 w-5/6" />
        <div className="bg-surface-raised animate-pulse rounded-sm h-3 w-4/6" />
      </div>
    </div>
  )
}

interface ReviewBodyProps {
  review: WeeklyReview
  onRegenerate: () => void
  isRegenerating: boolean
}

function ReviewBody({ review, onRegenerate, isRegenerating }: ReviewBodyProps) {
  const paragraphs = review.review_text.split('\n').filter(Boolean)

  return (
    <div className="bg-surface rounded-md border border-border shadow-card p-4 flex flex-col gap-4">
      {/* Stat line */}
      <p className="font-mono text-xl font-semibold text-text-primary">
        {review.actual_runs} of {review.planned_runs} runs
      </p>

      {/* Pak Har's review text — accent left border, plain prose */}
      <div className="border-l-4 border-accent pl-4 flex flex-col gap-2">
        {paragraphs.map((paragraph, i) => (
          <p key={i} className="text-sm text-text-primary leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Re-generate */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRegenerate}
        loading={isRegenerating}
        className="self-start"
      >
        Get this week's review
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeeklyReviewCard() {
  const queryClient = useQueryClient()

  const {
    data: review,
    isLoading,
    isError: isFetchError,
    error: fetchError,
  } = useQuery<WeeklyReview, ApiError>({
    queryKey: ['review', 'current'],
    queryFn: getCurrentReview,
    retry: (failureCount, err) => {
      // 404 means no review yet — expected, don't retry
      if (isNotFoundError(err)) return false
      return failureCount < 2
    },
  })

  const {
    mutate: generate,
    isPending: isGenerating,
    isError: isGenerateError,
    error: generateError,
    reset: resetGenerate,
  } = useMutation<WeeklyReview, ApiError>({
    mutationFn: generateWeeklyReview,
    onSuccess: (data) => {
      // Populate the cache so the card immediately shows fresh data
      queryClient.setQueryData(['review', 'current'], data)
    },
  })

  function handleGenerate() {
    resetGenerate()
    generate()
  }

  // --- Loading skeleton ---
  if (isLoading) {
    return <ReviewSkeleton />
  }

  // --- Generate error (shown below existing review or on its own) ---
  const generateErrorMsg = isGenerateError ? errorMessage(generateError) : null

  // --- No review yet (GET returned 404) ---
  const noReviewYet = isFetchError && isNotFoundError(fetchError)
  if (noReviewYet && !review) {
    return (
      <div className="bg-surface rounded-md border border-border shadow-card p-4 flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Pak Har hasn't reviewed this week yet.
        </p>

        {generateErrorMsg && (
          <p className="text-sm text-error">{generateErrorMsg}</p>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          loading={isGenerating}
          className="self-start"
        >
          Get this week's review
        </Button>
      </div>
    )
  }

  // --- Other fetch error (non-404) ---
  if (isFetchError && !review) {
    return (
      <div className="bg-surface rounded-md border border-border shadow-card p-4 flex flex-col gap-4">
        <p className="text-sm text-text-muted">
          Could not load this week's review. Check that the API is running.
        </p>

        {generateErrorMsg && (
          <p className="text-sm text-error">{generateErrorMsg}</p>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleGenerate}
          loading={isGenerating}
          className="self-start"
        >
          Get this week's review
        </Button>
      </div>
    )
  }

  // --- Review loaded ---
  if (review) {
    return (
      <div className="flex flex-col gap-2">
        <ReviewBody
          review={review}
          onRegenerate={handleGenerate}
          isRegenerating={isGenerating}
        />
        {generateErrorMsg && (
          <p className="text-sm text-error px-1">{generateErrorMsg}</p>
        )}
      </div>
    )
  }

  // --- Generating for the first time (no prior review, mutation in flight) ---
  if (isGenerating) {
    return <ReviewSkeleton />
  }

  return null
}
