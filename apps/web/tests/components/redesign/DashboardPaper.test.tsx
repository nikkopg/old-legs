import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { DashboardPaper } from '@/components/redesign/DashboardPaper'
import type { WeeklyReview } from '@/types/api'
import type { ProgressStep } from '@/hooks/useProgressStream'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ---- Fixtures ----

const baseWeeklyStats = {
  totalKm: 24.5,
  totalRuns: 4,
  totalTimeSec: 7200,
  plannedRuns: 5,
}

const baseSteps: ProgressStep[] = [
  { label: "Counting this week's runs", status: 'pending' },
  { label: 'Reading your zone breakdown', status: 'pending' },
  { label: 'Checking last week', status: 'pending' },
  { label: 'Writing the assessment', status: 'pending' },
  { label: 'Filing the headline', status: 'pending' },
]

const baseProps = {
  weeklyStats: baseWeeklyStats,
  todayPlan: null,
  lastRun: null,
  lastSyncedAt: null,
  weeklyReview: null,
  onGenerateReview: vi.fn(),
  reviewStreaming: false,
  reviewSteps: baseSteps,
  reviewElapsedMs: 0,
  reviewError: null,
  onOpenRun: vi.fn(),
  onOpenPlan: vi.fn(),
  onNav: vi.fn(),
}

function makeReview(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: 1,
    user_id: 1,
    week_start_date: '2026-05-12',
    planned_runs: 4,
    actual_runs: 3,
    review_text: 'Three runs in, one short.\n\nYou held the easy pace on Tuesday. That matters.',
    created_at: '2026-05-15T12:00:00',
    headline: 'Three runs. One gap.',
    verdict_tag: 'LIGHT WEEK',
    tone: 'neutral',
    ...overrides,
  }
}

// ---- Tests ----

describe('DashboardPaper', () => {
  describe('no review — idle state', () => {
    it('renders the heroHeadline formula when weeklyReview is null', () => {
      render(<DashboardPaper {...baseProps} />)
      // With 4 runs and 24.5 km, heroHeadline returns "24.5 km in. 4 runs filed."
      expect(screen.getByText(/24\.5 km in\. 4 runs filed\./)).toBeDefined()
    })

    it('renders "No weekly assessment yet. File this week →" link when idle and no review', () => {
      render(<DashboardPaper {...baseProps} />)
      expect(screen.getByText(/No weekly assessment yet\. File this week/)).toBeDefined()
    })

    it('calls onGenerateReview when the "File this week →" link is clicked', async () => {
      const user = userEvent.setup()
      const onGenerateReview = vi.fn()
      render(<DashboardPaper {...baseProps} onGenerateReview={onGenerateReview} />)
      await user.click(screen.getByText(/No weekly assessment yet\. File this week/))
      expect(onGenerateReview).toHaveBeenCalledOnce()
    })
  })

  describe('review exists — idle state', () => {
    it('renders review_text paragraphs when weeklyReview is set', () => {
      render(<DashboardPaper {...baseProps} weeklyReview={makeReview()} />)
      expect(screen.getByText(/Three runs in, one short\./)).toBeDefined()
    })

    it('renders the review headline', () => {
      render(<DashboardPaper {...baseProps} weeklyReview={makeReview()} />)
      expect(screen.getByText('Three runs. One gap.')).toBeDefined()
    })

    it('renders the verdict_tag via ToneBadge', () => {
      render(<DashboardPaper {...baseProps} weeklyReview={makeReview()} />)
      expect(screen.getByText('LIGHT WEEK')).toBeDefined()
    })

    it('renders "Filed week of" metadata', () => {
      render(<DashboardPaper {...baseProps} weeklyReview={makeReview()} />)
      expect(screen.getByText(/Filed week of/)).toBeDefined()
    })

    it('renders "Refresh his take →" link when idle and review exists', () => {
      render(<DashboardPaper {...baseProps} weeklyReview={makeReview()} />)
      expect(screen.getByText(/Refresh his take/)).toBeDefined()
    })

    it('calls onGenerateReview when "Refresh his take →" is clicked', async () => {
      const user = userEvent.setup()
      const onGenerateReview = vi.fn()
      render(
        <DashboardPaper
          {...baseProps}
          weeklyReview={makeReview()}
          onGenerateReview={onGenerateReview}
        />,
      )
      await user.click(screen.getByText(/Refresh his take/))
      expect(onGenerateReview).toHaveBeenCalledOnce()
    })

    it('does not render the headline when headline is null', () => {
      render(
        <DashboardPaper
          {...baseProps}
          weeklyReview={makeReview({ headline: null })}
        />,
      )
      expect(screen.queryByText('Three runs. One gap.')).toBeNull()
    })
  })

  describe('progress strip — streaming state (no review yet)', () => {
    const streamingSteps: ProgressStep[] = [
      { label: "Counting this week's runs", status: 'done' },
      { label: 'Reading your zone breakdown', status: 'running' },
      { label: 'Checking last week', status: 'pending' },
      { label: 'Writing the assessment', status: 'pending' },
      { label: 'Filing the headline', status: 'pending' },
    ]

    it('renders the progress strip when reviewStreaming is true', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={4200}
        />,
      )
      // Strip shows all step labels
      expect(screen.getByText("Counting this week's runs")).toBeDefined()
      expect(screen.getByText('Reading your zone breakdown')).toBeDefined()
    })

    it('does not render "File this week →" while streaming', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={0}
        />,
      )
      expect(screen.queryByText(/File this week/)).toBeNull()
    })

    it('renders the elapsed time in M:SS format', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={74000}
        />,
      )
      // 74 seconds = 1:14
      expect(screen.getByText('1:14')).toBeDefined()
    })

    it('renders 0:00 elapsed when elapsedMs is 0', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={0}
        />,
      )
      expect(screen.getByText('0:00')).toBeDefined()
    })
  })

  describe('progress strip — streaming state (review already exists)', () => {
    const streamingSteps: ProgressStep[] = [
      { label: "Counting this week's runs", status: 'done' },
      { label: 'Reading your zone breakdown', status: 'done' },
      { label: 'Checking last week', status: 'running' },
      { label: 'Writing the assessment', status: 'pending' },
      { label: 'Filing the headline', status: 'pending' },
    ]

    it('renders the progress strip even when a review exists (refresh flow)', () => {
      render(
        <DashboardPaper
          {...baseProps}
          weeklyReview={makeReview()}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={12000}
        />,
      )
      // Step labels should be visible
      expect(screen.getByText('Checking last week')).toBeDefined()
    })

    it('does not render "Refresh his take →" while streaming', () => {
      render(
        <DashboardPaper
          {...baseProps}
          weeklyReview={makeReview()}
          reviewStreaming={true}
          reviewSteps={streamingSteps}
          reviewElapsedMs={0}
        />,
      )
      expect(screen.queryByText(/Refresh his take/)).toBeNull()
    })
  })

  describe('error state — no review', () => {
    it('renders the error message when reviewError is set', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewError="Pak Har could not file this week."
        />,
      )
      expect(screen.getByText(/Pak Har could not file this week/)).toBeDefined()
    })

    it('renders "Try again →" link on error', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewError="Pak Har could not file this week."
        />,
      )
      expect(screen.getByText(/Try again/)).toBeDefined()
    })

    it('calls onGenerateReview when "Try again →" is clicked', async () => {
      const user = userEvent.setup()
      const onGenerateReview = vi.fn()
      render(
        <DashboardPaper
          {...baseProps}
          reviewError="Pak Har could not file this week."
          onGenerateReview={onGenerateReview}
        />,
      )
      await user.click(screen.getByText(/Try again/))
      expect(onGenerateReview).toHaveBeenCalledOnce()
    })

    it('does not render "File this week →" when error is set', () => {
      render(
        <DashboardPaper
          {...baseProps}
          reviewError="Something went wrong."
        />,
      )
      expect(screen.queryByText(/File this week/)).toBeNull()
    })
  })

  describe('error state — review exists', () => {
    it('renders error message below existing review', () => {
      render(
        <DashboardPaper
          {...baseProps}
          weeklyReview={makeReview()}
          reviewError="Pak Har could not file this week."
        />,
      )
      expect(screen.getByText(/Pak Har could not file this week/)).toBeDefined()
    })
  })

  describe('scoreboard', () => {
    it('renders totalKm in the scoreboard', () => {
      render(<DashboardPaper {...baseProps} />)
      // The value appears in both the lead body and scoreboard — check at least one
      const matches = screen.getAllByText('24.5 km')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('renders runs as actual/planned when plannedRuns is set', () => {
      render(<DashboardPaper {...baseProps} />)
      // 4 actual / 5 planned
      expect(screen.getByText('4 / 5')).toBeDefined()
    })

    it('renders runs as plain count when plannedRuns is null', () => {
      render(
        <DashboardPaper
          {...baseProps}
          weeklyStats={{ ...baseWeeklyStats, plannedRuns: null }}
        />,
      )
      expect(screen.getByText('4')).toBeDefined()
    })
  })

  describe('nav', () => {
    it('calls onNav with the correct key when Plan nav item is clicked', async () => {
      const user = userEvent.setup()
      const onNav = vi.fn()
      render(<DashboardPaper {...baseProps} onNav={onNav} />)
      await user.click(screen.getByText('Plan'))
      expect(onNav).toHaveBeenCalledWith('plan')
    })
  })
})
