import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SettingsPaper } from '@/components/redesign/SettingsPaper'
import type { WatchStatusResponse } from '@/lib/api'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ---- Fixture helpers ----

function buildBaseProps(watchOverrides: {
  watchStatus?: WatchStatusResponse[]
  watchMfaMode?: boolean
} = {}) {
  return {
    user: {
      name: 'Test Runner',
      stravaAthleteId: '12345',
      subscribedSince: '1 Jan 2026',
      timezone: 'Asia/Jakarta',
      preferredUnit: 'km',
    },
    stats: {
      editionsReceived: 4,
      dispatchesFiled: 12,
      weeklyPlans: 4,
      lettersExchanged: 8,
    },
    voice: 'standard' as const,
    deliveryPrefs: {
      weeklyPlanMonday: true,
      weeklyReviewSunday: false,
    },
    theme: 'light' as const,
    onVoiceChange: vi.fn(),
    onToggleDelivery: vi.fn(),
    onThemeChange: vi.fn(),
    onDisconnect: vi.fn(),
    onNav: vi.fn(),
    preferences: {
      weeklyKmTarget: '30',
      availableDays: ['monday', 'wednesday', 'friday'],
      biggestStruggle: 'consistency',
      restingHr: '55',
      maxHr: '185',
      goalEvent: null,
      raceDate: '',
    },
    onPreferenceChange: vi.fn(),
    onAvailableDaysChange: vi.fn(),
    onGoalEventChange: vi.fn(),
    onSavePreferences: vi.fn(),
    isSavingPreferences: false,
    preferencesSaved: false,
    preferencesError: null,
    // Watch Integration defaults
    watchStatus: watchOverrides.watchStatus ?? [],
    watchEmail: '',
    watchPassword: '',
    watchMfaMode: watchOverrides.watchMfaMode ?? false,
    watchMfaCode: '',
    watchConnectLoading: false,
    watchConnectError: null,
    onWatchEmailChange: vi.fn(),
    onWatchPasswordChange: vi.fn(),
    onWatchMfaCodeChange: vi.fn(),
    onConnectWatch: vi.fn(),
    onWatchMfaSubmit: vi.fn(),
    onDisconnectWatch: vi.fn(),
    onWatchMfaCancel: vi.fn(),
    watchShowPassword: false,
    onWatchShowPasswordToggle: vi.fn(),
  }
}

// ---- Tests ----

describe('SettingsPaper — Watch Integration', () => {
  it('test 1: watchStatus=[] (disconnected) → "Connect" button renders', () => {
    render(<SettingsPaper {...buildBaseProps({ watchStatus: [] })} />)
    expect(screen.getByRole('button', { name: /Connect/i })).toBeDefined()
  })

  it('test 2: watchStatus=[garmin connected] → "Garmin — Connected" text renders', () => {
    const garminConnected: WatchStatusResponse = {
      platform: 'garmin',
      connected: true,
      last_synced_at: null,
      last_sync_error: null,
    }
    render(<SettingsPaper {...buildBaseProps({ watchStatus: [garminConnected] })} />)
    expect(screen.getByText(/Garmin — Connected/i)).toBeDefined()
  })

  it('test 3: watchMfaMode=true → "A verification code was sent to your device." renders', () => {
    render(<SettingsPaper {...buildBaseProps({ watchMfaMode: true })} />)
    expect(screen.getByText(/A verification code was sent to your device\./i)).toBeDefined()
  })
})
