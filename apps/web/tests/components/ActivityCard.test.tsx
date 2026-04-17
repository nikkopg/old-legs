// TASK-028: ActivityCard component tests
// Requires: vitest, @testing-library/react, jsdom (see test-plan.md for setup)

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ActivityCard } from '@/components/activity/ActivityCard'
import type { Activity } from '@/types/api'

const baseActivity: Activity = {
  id: 1,
  user_id: 1,
  strava_activity_id: 'strava_001',
  name: 'Morning Run',
  distance_km: 10.5,
  moving_time_seconds: 3780,
  average_pace_min_per_km: 6.0,
  average_hr: 155,
  max_hr: 172,
  elevation_gain_m: 45,
  activity_date: '2026-04-15T07:30:00Z',
  analysis: null,
  analysis_generated_at: null,
  sync_status: 'synced',
  created_at: '2026-04-15T08:00:00Z',
  updated_at: '2026-04-15T08:00:00Z',
}

describe('ActivityCard', () => {
  it('renders the activity name', () => {
    render(<ActivityCard activity={baseActivity} />)
    expect(screen.getByText('Morning Run')).toBeDefined()
  })

  it('renders distance in km', () => {
    render(<ActivityCard activity={baseActivity} />)
    expect(screen.getByText(/10\.5/)).toBeDefined()
  })

  it('renders pace in min:sec format', () => {
    render(<ActivityCard activity={baseActivity} />)
    expect(screen.getByText(/6:00/)).toBeDefined()
  })

  it('renders HR when present', () => {
    render(<ActivityCard activity={baseActivity} />)
    expect(screen.getByText(/155/)).toBeDefined()
  })

  it('does not render HR row when average_hr is null', () => {
    const noHrActivity = { ...baseActivity, average_hr: null, max_hr: null }
    render(<ActivityCard activity={noHrActivity} />)
    expect(screen.queryByText(/bpm/i)).toBeNull()
  })

  it('renders the activity date', () => {
    render(<ActivityCard activity={baseActivity} />)
    // formatDate produces something like "Tue 15 Apr"
    expect(screen.getByText(/Apr/)).toBeDefined()
  })
})
