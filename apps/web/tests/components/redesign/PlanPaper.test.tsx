import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { PlanPaper } from '@/components/redesign/PlanPaper'
import type { PlanNextTarget } from '@/types/api'
import type { ProgressStep } from '@/hooks/useProgressStream'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ---- Types ----

// PlanPaper's internal TrainingPlan shape (not the ApiTrainingPlan from types/api)
interface PlanDay {
  day: string
  date: string
  isoDate: string
  type: string
  target: string
  durationMin: string
  notes: string
}

interface TrainingPlan {
  days: PlanDay[]
  weekLabel: string
  dateRange: string
  editorNote: string
  filedAt: string
}

// ---- Fixtures ----

function makePlan(overrides: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    weekLabel: 'Week 20',
    dateRange: '12 May – 18 May',
    editorNote:
      'You ran three times last week. Good enough to plan from.\n\nKeep the easy days easy.',
    filedAt: '12 May',
    days: [
      {
        day: 'Mon',
        date: '12 May',
        isoDate: '2026-05-12',
        type: 'Easy',
        target: '5 km easy',
        durationMin: '30',
        notes: 'Conversational pace throughout.',
      },
      {
        day: 'Wed',
        date: '14 May',
        isoDate: '2026-05-14',
        type: 'Tempo',
        target: '4 km tempo',
        durationMin: '25',
        notes: 'Hold 4:30/km for the middle 2 km.',
      },
      {
        day: 'Fri',
        date: '16 May',
        isoDate: '2026-05-16',
        type: 'Rest',
        target: '—',
        durationMin: '0',
        notes: 'Walk. Stretch. Sleep.',
      },
    ],
    ...overrides,
  }
}

function makeNextTarget(overrides: Partial<PlanNextTarget> = {}): PlanNextTarget {
  return {
    week_start_date: '2026-05-18',
    is_next_week: true,
    reason: 'current_week',
    replaces_active_plan: false,
    ...overrides,
  }
}

const baseSteps: ProgressStep[] = [
  { label: 'Pulling your runs', status: 'pending' },
  { label: 'Reading your zones', status: 'pending' },
  { label: 'Writing the plan', status: 'pending' },
]

const baseProps = {
  plan: null,
  isStreaming: false,
  steps: baseSteps,
  elapsedMs: 0,
  streamError: null,
  onGeneratePlan: vi.fn(),
  onOpenCoach: vi.fn(),
  onNav: vi.fn(),
  todayDow: 'Sat', // safe default — not Mon, so no row highlights in most tests
  realizations: {} as Record<string, null>,
  planVerdicts: {},
  nextTarget: undefined,
  isNextWeek: false,
}

// ---- Tests ----

describe('PlanPaper', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Section label (NewspaperChrome `section` prop) ----

  describe('section label', () => {
    it('test 1: is_next_week=false → section text contains "Fixtures"', () => {
      render(<PlanPaper {...baseProps} isNextWeek={false} />)
      // Section renders as "§ Fixtures · Week of ..."
      expect(screen.getByText(/Fixtures/)).toBeDefined()
    })

    it('test 2: is_next_week=true → section text contains "Next Edition"', () => {
      render(
        <PlanPaper
          {...baseProps}
          isNextWeek={true}
          nextTarget={makeNextTarget({ week_start_date: '2026-05-18', is_next_week: true })}
        />,
      )
      expect(screen.getByText(/Next Edition/)).toBeDefined()
    })

    it('test 3: no nextTarget prop → section text contains "Fixtures" (safe default)', () => {
      render(<PlanPaper {...baseProps} nextTarget={undefined} isNextWeek={false} />)
      expect(screen.getByText(/Fixtures/)).toBeDefined()
      expect(screen.queryByText(/Next Edition/)).toBeNull()
    })
  })

  // ---- Generate button label ----

  describe('button label', () => {
    it('test 4: is_next_week=false, no plan → button reads "File this week\'s plan"', () => {
      render(<PlanPaper {...baseProps} plan={null} isNextWeek={false} />)
      expect(screen.getByRole('button', { name: /File this week's plan/i })).toBeDefined()
    })

    it("test 5: is_next_week=true, no plan → button reads \"File next week's plan\"", () => {
      render(<PlanPaper {...baseProps} plan={null} isNextWeek={true} />)
      expect(screen.getByRole('button', { name: /File next week's plan/i })).toBeDefined()
    })

    it("test 6: is_next_week=true, plan exists (regenerate button) → reads \"File next week's plan\"", () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          isNextWeek={true}
          isStreaming={false}
        />,
      )
      // The regenerate button at the bottom of the plan section
      const buttons = screen.getAllByRole('button', { name: /File next week's plan/i })
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---- Pre-generate caption ----

  describe('pre-generate caption', () => {
    it('test 7: reason="current_week" → caption contains date range (not "weekend" or "trained")', () => {
      const target = makeNextTarget({
        week_start_date: '2026-05-18',
        reason: 'current_week',
        is_next_week: false,
      })
      render(<PlanPaper {...baseProps} plan={null} nextTarget={target} isNextWeek={false} />)
      // Both the section label and the caption span match /Week of/ — use getAllByText
      // and find the caption span (monospace, smaller font, the second match)
      const matches = screen.getAllByText(/Week of/)
      expect(matches.length).toBeGreaterThanOrEqual(1)
      // The caption span is distinct: it ends with "." and contains a date range
      const caption = matches.find((el) => el.tagName.toLowerCase() === 'span' && el.textContent?.endsWith('.'))
      expect(caption).toBeDefined()
      expect(caption!.textContent).not.toMatch(/weekend/i)
      expect(caption!.textContent).not.toMatch(/trained|already/i)
    })

    it('test 8: reason="weekend" → caption contains "weekend"', () => {
      const target = makeNextTarget({
        week_start_date: '2026-05-18',
        reason: 'weekend',
        is_next_week: true,
      })
      render(<PlanPaper {...baseProps} plan={null} nextTarget={target} isNextWeek={true} />)
      expect(screen.getByText(/weekend/i)).toBeDefined()
    })

    it('test 9: reason="already_ran_this_week" → caption contains "trained" or "already"', () => {
      const target = makeNextTarget({
        week_start_date: '2026-05-18',
        reason: 'already_ran_this_week',
        is_next_week: true,
      })
      render(<PlanPaper {...baseProps} plan={null} nextTarget={target} isNextWeek={true} />)
      const caption = screen.getByText(/trained|already/i)
      expect(caption).toBeDefined()
    })

    it('test 10: no nextTarget → no crash, no caption rendered', () => {
      // Should render without throwing and show no pre-generate caption text
      render(<PlanPaper {...baseProps} plan={null} nextTarget={undefined} />)
      // The caption span is only rendered when preGenerateCaption is non-null
      // Check that no "Week of" or "weekend" or "already trained" text appears
      expect(screen.queryByText(/It's the weekend/)).toBeNull()
      expect(screen.queryByText(/already trained/i)).toBeNull()
      // The generate button should still render
      expect(screen.getByRole('button', { name: /File this week's plan/i })).toBeDefined()
    })
  })

  // ---- Today-row suppression ----
  // todayDow is a prop derived outside; we control it directly.
  // vi.useFakeTimers + vi.setSystemTime controls todayIso (used in "No run logged" logic)
  // but todayDow itself is a prop, so we pass "Mon" to trigger the today-accent.

  describe('today-row suppression', () => {
    it('test 11: isNextWeek=false, plan has Mon → Mon row shows "Today" label', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-11'))

      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          isNextWeek={false}
          todayDow="Mon"
        />,
      )
      // The "Today" label is a Caps element rendered beneath the day abbreviation
      expect(screen.getByText('Today')).toBeDefined()
    })

    it('test 12: isNextWeek=true, plan has Mon → Mon row does NOT show "Today" even when todayDow=Mon', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-11'))

      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          isNextWeek={true}
          todayDow="Mon"
        />,
      )
      // isToday = !isNextWeek && d.day === todayDow → false when isNextWeek=true
      expect(screen.queryByText('Today')).toBeNull()
    })
  })

  // ---- onGeneratePlan callback ----
  // Note: replace-confirmation modal logic lives in plan/page.tsx, not in PlanPaper.
  // Modal interaction is covered by the E2E spec (TASK-201-D3).
  // These tests verify that the component fires onGeneratePlan correctly.

  describe('onGeneratePlan callback', () => {
    it('test 13: clicking "File this week\'s plan" button (no plan) calls onGeneratePlan', async () => {
      const user = userEvent.setup()
      const onGeneratePlan = vi.fn()
      render(
        <PlanPaper
          {...baseProps}
          plan={null}
          isNextWeek={false}
          onGeneratePlan={onGeneratePlan}
        />,
      )
      await user.click(screen.getByRole('button', { name: /File this week's plan/i }))
      expect(onGeneratePlan).toHaveBeenCalledOnce()
    })

    it('test 14: clicking regenerate button (plan exists) calls onGeneratePlan', async () => {
      const user = userEvent.setup()
      const onGeneratePlan = vi.fn()
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          isNextWeek={false}
          isStreaming={false}
          onGeneratePlan={onGeneratePlan}
        />,
      )
      // The regenerate button is at the bottom of the plan section
      const buttons = screen.getAllByRole('button', { name: /File this week's plan/i })
      // Click the last one (bottom regenerate button)
      await user.click(buttons[buttons.length - 1])
      expect(onGeneratePlan).toHaveBeenCalledOnce()
    })
  })

  // ---- Watch Sync ----

  describe('Watch Sync', () => {
    it('test 15: hasConnectedWatch=false + plan → "Connect a watch in Settings" link renders', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={false}
        />,
      )
      expect(screen.getByRole('link', { name: /Connect a watch in Settings/i })).toBeDefined()
    })

    it('test 16: hasConnectedWatch=true + plan + onSyncToWatch → "Sync to Watch" button renders', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="idle"
        />,
      )
      expect(screen.getByRole('button', { name: /Sync to Watch/i })).toBeDefined()
    })

    it('test 17: syncState="syncing" → Sync button is disabled', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="syncing"
        />,
      )
      // Button label changes to "Syncing..." when in syncing state
      const btn = screen.getByRole('button', { name: /Syncing\.\.\./i })
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })

    it('test 18: syncState="done" → Sync button is disabled (regression: must not re-enable)', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="done"
          syncResults={{}}
        />,
      )
      const btn = screen.getByRole('button', { name: /Sync to Watch/i })
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })

    it('test 19: syncState="done" + syncResults garmin=pushed → "On your watch." text renders', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="done"
          syncResults={{ garmin: 'pushed' }}
        />,
      )
      expect(screen.getByText(/On your watch\./i)).toBeDefined()
    })

    it('test 20: syncState="done" + syncResults garmin=already_synced → "Already synced." text renders', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="done"
          syncResults={{ garmin: 'already_synced' }}
        />,
      )
      expect(screen.getByText(/Already synced\./i)).toBeDefined()
    })

    it('test 21: syncState="error" → error message renders', () => {
      render(
        <PlanPaper
          {...baseProps}
          plan={makePlan()}
          hasConnectedWatch={true}
          onSyncToWatch={vi.fn()}
          syncState="error"
        />,
      )
      expect(screen.getByText(/Sync failed/i)).toBeDefined()
    })
  })
})
