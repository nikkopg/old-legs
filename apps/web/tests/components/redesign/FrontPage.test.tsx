import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { FrontPage, type WeeklyKmEntry } from '@/components/redesign/FrontPage'
import type { Activity } from '@/types/api'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ---- Fixtures ----

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    user_id: 1,
    strava_activity_id: 'strava-001',
    name: 'Morning Run',
    distance_km: 8.4,
    moving_time_seconds: 2820,
    average_pace_min_per_km: 5.6,
    average_hr: 148,
    max_hr: 172,
    elevation_gain_m: 55,
    activity_date: '2026-04-28T06:00:00Z',
    analysis: 'Steady effort on a humid morning.',
    analysis_generated_at: '2026-04-28T07:00:00Z',
    sync_status: 'synced',
    created_at: '2026-04-28T07:00:00Z',
    updated_at: '2026-04-28T07:00:00Z',
    verdict_short: 'Kept the pace honest.',
    verdict_tag: 'SOLID',
    tone: 'good',
    splits: null,
    ...overrides,
  }
}

const defaultWeeklyKm: WeeklyKmEntry[] = [
  { label: 'This', km: 18.2, runs: 3, current: true },
  { label: 'W-1', km: 32.5, runs: 5 },
  { label: 'W-2', km: 28.0, runs: 4 },
  { label: 'W-3', km: 24.1, runs: 4 },
]

const defaultProps = {
  activities: [makeActivity()],
  weeklyKm: defaultWeeklyKm,
  lastSyncedAt: '2026-04-28T07:00:00Z',
  onActivityClick: vi.fn(),
  onRefreshSync: vi.fn(),
  onNav: vi.fn(),
}

// ---- Tests ----

describe('FrontPage', () => {
  describe('empty activities array', () => {
    it('shows the empty state message in the lead area', () => {
      render(<FrontPage {...defaultProps} activities={[]} />)
      expect(screen.getByText(/No editions yet/)).toBeDefined()
    })

    it('still renders the "No previous editions." placeholder when empty', () => {
      render(<FrontPage {...defaultProps} activities={[]} />)
      expect(screen.getByText('No previous editions.')).toBeDefined()
    })

    it('does not render the Scoreboard when empty', () => {
      render(<FrontPage {...defaultProps} activities={[]} />)
      expect(screen.queryByText('The Scoreboard')).toBeNull()
    })
  })

  describe('single activity (lead only)', () => {
    it('renders the lead verdict headline', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity()]} />)
      expect(screen.getByText(/Kept the pace honest/i)).toBeDefined()
    })

    it('shows "No previous editions." in the previous editions section', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity()]} />)
      expect(screen.getByText('No previous editions.')).toBeDefined()
    })

    it('renders the Scoreboard box', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity()]} />)
      expect(screen.getByText('The Scoreboard')).toBeDefined()
    })
  })

  describe('lead activity stats', () => {
    it('renders the distance stat', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity({ distance_km: 8.4 })]} />)
      // Distance value and "km" label are sibling elements inside a scoreboard cell;
      // use a function matcher to locate the container element that includes the value text
      const distCell = screen.getByText((content, element) =>
        element?.tagName !== 'SCRIPT' && content.includes('8.4'),
      )
      expect(distCell).toBeDefined()
    })

    it('renders average HR when present', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity({ average_hr: 148 })]} />)
      expect(screen.getByText('148 bpm')).toBeDefined()
    })

    it('renders max HR when present', () => {
      render(<FrontPage {...defaultProps} activities={[makeActivity({ max_hr: 172 })]} />)
      expect(screen.getByText('172 bpm')).toBeDefined()
    })

    it('shows "—" for average HR when HR data is null', () => {
      render(
        <FrontPage
          {...defaultProps}
          activities={[makeActivity({ average_hr: null, max_hr: null })]}
        />,
      )
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })

    it('shows "—" for max HR when HR data is null', () => {
      // AVG HR and MAX HR both show — when null; query both
      render(
        <FrontPage
          {...defaultProps}
          activities={[makeActivity({ average_hr: null, max_hr: null })]}
        />,
      )
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('activity with distance_km === 0 (missed run)', () => {
    it('renders a dash in the stats column for a missed edition', () => {
      const lead = makeActivity({ distance_km: 8.4 })
      const missed = makeActivity({ id: 2, distance_km: 0, name: 'MISSED Run', tone: 'critical', verdict_tag: 'NO SHOW' })
      render(<FrontPage {...defaultProps} activities={[lead, missed]} />)
      // The missed run edition renders a large "—" in accent colour
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })

    it('does not render a distance value for a missed run in previous editions', () => {
      const lead = makeActivity({ distance_km: 8.4 })
      const missed = makeActivity({ id: 2, distance_km: 0, name: 'MISSED Run', tone: 'critical', verdict_tag: 'NO SHOW' })
      render(<FrontPage {...defaultProps} activities={[lead, missed]} />)
      // Should not show "0.0 km" for the missed run
      expect(screen.queryByText('0.0')).toBeNull()
    })
  })

  describe('multiple activities (previous editions)', () => {
    it('renders previous edition activity names', () => {
      const lead = makeActivity({ id: 1, name: 'Morning Run' })
      const prev = makeActivity({ id: 2, name: 'Evening Easy', verdict_short: 'Easy does it.', activity_date: '2026-04-27T06:00:00Z' })
      render(<FrontPage {...defaultProps} activities={[lead, prev]} />)
      expect(screen.getByText('Evening Easy')).toBeDefined()
    })

    it('renders the previous edition headline', () => {
      const lead = makeActivity({ id: 1 })
      const prev = makeActivity({ id: 2, verdict_short: 'Easy does it.', activity_date: '2026-04-27T06:00:00Z' })
      render(<FrontPage {...defaultProps} activities={[lead, prev]} />)
      expect(screen.getByText(/Easy does it/i)).toBeDefined()
    })

    it('calls onActivityClick with the correct id when a previous edition is clicked', async () => {
      const user = userEvent.setup()
      const onActivityClick = vi.fn()
      const lead = makeActivity({ id: 1 })
      const prev = makeActivity({ id: 2, verdict_short: 'Easy does it.', activity_date: '2026-04-27T06:00:00Z' })
      render(<FrontPage {...defaultProps} activities={[lead, prev]} onActivityClick={onActivityClick} />)
      await user.click(screen.getByText(/Easy does it/i))
      expect(onActivityClick).toHaveBeenCalledWith(2)
    })
  })

  describe('lead activity click', () => {
    it('calls onActivityClick with the lead activity id when the lead is clicked', async () => {
      const user = userEvent.setup()
      const onActivityClick = vi.fn()
      render(
        <FrontPage
          {...defaultProps}
          activities={[makeActivity({ id: 42 })]}
          onActivityClick={onActivityClick}
        />,
      )
      await user.click(screen.getByText(/Kept the pace honest/i))
      expect(onActivityClick).toHaveBeenCalledWith(42)
    })
  })

  describe('weeklyKm standings', () => {
    it('renders all four weekly labels', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('This')).toBeDefined()
      expect(screen.getByText('W-1')).toBeDefined()
      expect(screen.getByText('W-2')).toBeDefined()
      expect(screen.getByText('W-3')).toBeDefined()
    })

    it('renders each week km value in the standings', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('18.2')).toBeDefined()
      expect(screen.getByText('32.5')).toBeDefined()
    })

    it('renders current week summary in the standings footer', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText(/3 runs · 18\.2 km so far/)).toBeDefined()
    })

    it('renders "—" in standings footer when no current week entry', () => {
      const noCurrentWeek = defaultWeeklyKm.map((w) => ({ ...w, current: false }))
      render(<FrontPage {...defaultProps} weeklyKm={noCurrentWeek} />)
      // Footer shows "—" when currentWeek is undefined
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('lastSyncedAt', () => {
    it('shows "synced recently" when lastSyncedAt is null', () => {
      render(<FrontPage {...defaultProps} lastSyncedAt={null} />)
      expect(screen.getByText(/synced recently/)).toBeDefined()
    })

    it('shows "synced recently" when lastSyncedAt is undefined', () => {
      render(<FrontPage {...defaultProps} lastSyncedAt={undefined} />)
      expect(screen.getByText(/synced recently/)).toBeDefined()
    })

    it('shows a time-based string when lastSyncedAt is set', () => {
      // Pass a recent ISO timestamp; timeAgo returns something like "X min ago" or "just now"
      render(<FrontPage {...defaultProps} lastSyncedAt={new Date().toISOString()} />)
      expect(screen.getByText(/synced just now|synced \d+ min ago|synced \d+h ago|synced \d+d ago/)).toBeDefined()
    })
  })

  describe('refresh sync', () => {
    it('renders the refresh button', () => {
      render(<FrontPage {...defaultProps} isSyncing={false} />)
      expect(screen.getByRole('button', { name: /Tap Refresh for latest/i })).toBeDefined()
    })

    it('calls onRefreshSync when the refresh button is clicked', async () => {
      const user = userEvent.setup()
      const onRefreshSync = vi.fn()
      render(<FrontPage {...defaultProps} onRefreshSync={onRefreshSync} isSyncing={false} />)
      await user.click(screen.getByRole('button', { name: /Tap Refresh for latest/i }))
      expect(onRefreshSync).toHaveBeenCalledOnce()
    })

    it('shows "Syncing_" text and disables button while syncing', () => {
      render(<FrontPage {...defaultProps} isSyncing={true} />)
      const btn = screen.getByRole('button', { name: /Syncing_/i })
      expect(btn).toBeDefined()
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('nav', () => {
    it('renders all nav items', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('Front Page')).toBeDefined()
      expect(screen.getByText('Dispatches')).toBeDefined()
      expect(screen.getByText('Plan')).toBeDefined()
      expect(screen.getByText('Letters')).toBeDefined()
      expect(screen.getByText('Desk')).toBeDefined()
    })

    it('calls onNav with the correct key when a nav item is clicked', async () => {
      const user = userEvent.setup()
      const onNav = vi.fn()
      render(<FrontPage {...defaultProps} onNav={onNav} />)
      await user.click(screen.getByText('Plan'))
      expect(onNav).toHaveBeenCalledWith('plan')
    })

    it('activeNav is "activities" for the Dispatches item', () => {
      render(<FrontPage {...defaultProps} />)
      const dispatchesLink = screen.getByText('Dispatches').closest('a')
      expect(dispatchesLink?.style.fontWeight).toBe('800')
    })
  })

  describe('sidebar', () => {
    it('renders "Pak Har" coach on duty', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('Pak Har')).toBeDefined()
    })

    it('renders the Notices section', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('Notices')).toBeDefined()
    })

    it('renders The Standings label', () => {
      render(<FrontPage {...defaultProps} />)
      expect(screen.getByText('The Standings')).toBeDefined()
    })
  })
})
