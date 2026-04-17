// TASK-028: StatGrid component tests

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatGrid } from '@/components/activity/StatGrid'
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

describe('StatGrid', () => {
  it('renders distance stat', () => {
    render(<StatGrid activity={baseActivity} />)
    expect(screen.getByText('Distance')).toBeDefined()
    expect(screen.getByText(/10\.5 km/)).toBeDefined()
  })

  it('renders pace stat', () => {
    render(<StatGrid activity={baseActivity} />)
    expect(screen.getByText('Pace')).toBeDefined()
    expect(screen.getByText(/6:00/)).toBeDefined()
  })

  it('renders duration stat', () => {
    render(<StatGrid activity={baseActivity} />)
    expect(screen.getByText('Time')).toBeDefined()
    // 3780 seconds = 1:03:00
    expect(screen.getByText(/1:03:00/)).toBeDefined()
  })

  it('renders elevation stat', () => {
    render(<StatGrid activity={baseActivity} />)
    expect(screen.getByText('Elevation')).toBeDefined()
    expect(screen.getByText(/45 m/)).toBeDefined()
  })

  it('renders HR when present', () => {
    render(<StatGrid activity={baseActivity} />)
    expect(screen.getByText('Avg HR')).toBeDefined()
    expect(screen.getByText(/155 bpm/)).toBeDefined()
  })

  it('omits HR stat when average_hr is null', () => {
    const noHr = { ...baseActivity, average_hr: null }
    render(<StatGrid activity={noHr} />)
    expect(screen.queryByText('Avg HR')).toBeNull()
  })
})
