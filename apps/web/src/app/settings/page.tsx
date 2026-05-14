// READY FOR QA
// Feature: Settings page — TASK-142 (SettingsPaper tabloid redesign) + TASK-152 (Reset Context) + TASK-177 (delivery preference persistence)
// What was built:
//   Settings page wired to the SettingsPaper tabloid component.
//   - Loads getAuthStatus via React Query; redirects to / on 401 or !connected.
//   - deliveryPrefs are seeded from userProfile.auto_plan_enabled / auto_review_enabled on first load.
//   - handleToggleDelivery is async: optimistically flips local state, fires saveOnboarding with the
//     new boolean values alongside the current Runner's Brief fields, reverts silently on API failure.
//   - disconnectStrava() is called on onDisconnect, then redirects to /.
//   - Dark-frame wrapper matches dashboard/plan/coach page pattern.
//   - Loading → paper-coloured skeleton block with animate-pulse.
//   - minimal user prop built from auth status (name hardcoded to 'Athlete').
//   - minimal stats prop (all zeros — backend not yet wired).
//   - resetPakHarContext() wired to DELETE /coach/reset; two-step inline confirmation.
//   - On reset success: invalidates plan/activities/review/insights queries + clears chat
//     store, then redirects to /dashboard.
//   - On reset error: shows inline error message; state returns to 'error' for retry.
// Edge cases to test:
//   - Loading state → skeleton block shown, no flicker
//   - 401 response → router.replace('/') called immediately
//   - connected=false → router.replace('/') called
//   - onDisconnect → disconnectStrava() called, then router.replace('/')
//   - disconnectStrava() throws → error is swallowed, redirect still happens
//   - voice toggle → active voice card updates visually, onVoiceChange fires
//   - delivery toggles → knob animates immediately (optimistic), then persists to API
//   - delivery toggle API failure → toggle reverts to previous value silently
//   - delivery prefs seed from userProfile → correct values shown after load (not hardcoded true/true)
//   - onNav → pushes correct route for all 5 nav keys
//   - Reset Context first click → state transitions to 'confirming'
//   - Reset Context cancel → state returns to 'idle'
//   - Reset Context confirm → state transitions to 'loading', fires DELETE /coach/reset
//   - Reset success → all query caches removed (not just invalidated), chat store cleared, redirect /dashboard
//   - Reset failure → state transitions to 'error', inline message shown, retry available

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SettingsPaper } from '@/components/redesign/SettingsPaper'
import { PageLoadingSkeleton } from '@/components/redesign/PageLoadingSkeleton'
import { getAuthStatus, disconnectStrava, resetPakHarContext, saveOnboarding } from '@/lib/api'
import { useUser } from '@/hooks/useUser'
import { useChatStore } from '@/store/chat'
import type { ApiError, GoalEvent } from '@/types/api'
import { useTheme } from '@/hooks/useTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoiceLevel = 'gentle' | 'standard' | 'unfiltered'

interface DeliveryPreferences {
  weeklyPlanMonday: boolean
  weeklyReviewSunday: boolean
}

type ResetContextState = 'idle' | 'confirming' | 'loading' | 'error'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const clearChat = useChatStore((s) => s.clear)
  const { theme, setTheme } = useTheme()

  // Auth status query
  const {
    data: authData,
    isLoading: authLoading,
    error,
  } = useQuery<{ connected: boolean; message: string }, ApiError>({
    queryKey: ['authStatus'],
    queryFn: getAuthStatus,
    retry: false,
  })

  // User profile query
  const { user: userProfile, isLoading: userLoading } = useUser()

  const isLoading = authLoading || userLoading

  // Local-only preferences state (no backend yet)
  const [voice, setVoice] = useState<VoiceLevel>('standard')
  const [deliveryPrefs, setDeliveryPrefs] = useState<DeliveryPreferences>({
    weeklyPlanMonday: true,
    weeklyReviewSunday: true,
  })

  // Runner's Brief preferences state
  const [preferences, setPreferences] = useState({
    weeklyKmTarget: '',
    availableDays: [] as string[],
    biggestStruggle: '',
    restingHr: '',
    maxHr: '',
    goalEvent: null as GoalEvent | null,
    raceDate: '',
  })
  const [prefSeeded, setPrefSeeded] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [preferencesSaved, setPreferencesSaved] = useState(false)
  const [preferencesError, setPreferencesError] = useState<string | null>(null)

  // Reset context state machine
  const [resetContextState, setResetContextState] = useState<ResetContextState>('idle')

  // Redirect if not authenticated or not connected
  const isUnauthorized = error !== null && error !== undefined && (error as ApiError).status === 401
  const isNotConnected = !isLoading && authData !== undefined && !authData.connected

  useEffect(() => {
    if (isUnauthorized || isNotConnected) {
      router.replace('/')
    }
  }, [isUnauthorized, isNotConnected, router])

  // Seed Runner's Brief and delivery preferences from userProfile (once)
  useEffect(() => {
    if (userProfile && !prefSeeded) {
      setPreferences({
        weeklyKmTarget: userProfile.weekly_km_target !== null ? String(userProfile.weekly_km_target) : '',
        availableDays: userProfile.available_days ?? [],
        biggestStruggle: userProfile.biggest_struggle ?? '',
        restingHr: userProfile.resting_hr !== null && userProfile.resting_hr !== undefined ? String(userProfile.resting_hr) : '',
        maxHr: userProfile.max_hr !== null && userProfile.max_hr !== undefined ? String(userProfile.max_hr) : '',
        goalEvent: userProfile.goal_event ?? null,
        raceDate: userProfile.race_date ?? '',
      })
      setDeliveryPrefs({
        weeklyPlanMonday: userProfile.auto_plan_enabled ?? true,
        weeklyReviewSunday: userProfile.auto_review_enabled ?? true,
      })
      setPrefSeeded(true)
    }
  }, [userProfile, prefSeeded])

  // Navigation handler
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

  // Disconnect handler — fire-and-forget, redirect regardless
  const handleDisconnect = async () => {
    try {
      await disconnectStrava()
    } catch {
      // session may already be cleared server-side; proceed with redirect
    }
    router.replace('/')
  }

  // Delivery toggle handler — optimistically flips local state, persists to backend,
  // and reverts silently on failure.
  const handleToggleDelivery = async (key: keyof DeliveryPreferences) => {
    const next = !deliveryPrefs[key]
    setDeliveryPrefs((prev) => ({ ...prev, [key]: next }))

    const parsedKm = Number(preferences.weeklyKmTarget)
    const parsedRestingHr = preferences.restingHr !== '' ? Number(preferences.restingHr) : null
    const parsedMaxHr = preferences.maxHr !== '' ? Number(preferences.maxHr) : null

    try {
      await saveOnboarding({
        weekly_km_target: parsedKm,
        days_available: preferences.availableDays.length,
        available_days: preferences.availableDays,
        biggest_struggle: preferences.biggestStruggle.trim(),
        resting_hr: parsedRestingHr,
        max_hr: parsedMaxHr,
        goal_event: preferences.goalEvent,
        race_date: preferences.raceDate || null,
        auto_plan_enabled: key === 'weeklyPlanMonday' ? next : deliveryPrefs.weeklyPlanMonday,
        auto_review_enabled: key === 'weeklyReviewSunday' ? next : deliveryPrefs.weeklyReviewSunday,
      })
    } catch {
      // Revert toggle on failure — no error UI, just silent rollback
      setDeliveryPrefs((prev) => ({ ...prev, [key]: !next }))
    }
  }

  // Runner's Brief preference handlers
  const handlePreferenceChange = (
    field: 'weeklyKmTarget' | 'biggestStruggle' | 'restingHr' | 'maxHr' | 'raceDate',
    value: string,
  ) => {
    setPreferencesSaved(false)
    setPreferences((prev) => ({ ...prev, [field]: value }))
  }

  const handleAvailableDaysChange = (days: string[]) => {
    setPreferencesSaved(false)
    setPreferences((prev) => ({ ...prev, availableDays: days }))
  }

  const handleGoalEventChange = (value: GoalEvent | null) => {
    setPreferences((prev) => ({ ...prev, goalEvent: value }))
    setPreferencesSaved(false)
  }

  const handleSavePreferences = async () => {
    const parsedKm = Number(preferences.weeklyKmTarget)
    if (preferences.availableDays.length === 0) return
    const parsedRestingHr = preferences.restingHr !== '' ? Number(preferences.restingHr) : null
    if (parsedRestingHr !== null && (parsedRestingHr < 30 || parsedRestingHr > 100)) return
    const parsedMaxHr = preferences.maxHr !== '' ? Number(preferences.maxHr) : null
    if (parsedMaxHr !== null && (parsedMaxHr < 100 || parsedMaxHr > 220)) return
    setIsSavingPreferences(true)
    setPreferencesError(null)
    setPreferencesSaved(false)
    try {
      await saveOnboarding({
        weekly_km_target: parsedKm,
        days_available: preferences.availableDays.length,
        available_days: preferences.availableDays,
        biggest_struggle: preferences.biggestStruggle.trim(),
        resting_hr: parsedRestingHr,
        max_hr: parsedMaxHr,
        goal_event: preferences.goalEvent,
        race_date: preferences.raceDate || null,
      })
      setPreferencesSaved(true)
      // Invalidate cache so the next visit seeds from fresh data, then allow
      // re-seeding on this page when the refetch completes.
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })
      setPrefSeeded(false)
    } catch (err) {
      const apiErr = err as ApiError
      setPreferencesError(apiErr?.detail ?? 'Something went wrong.')
    } finally {
      setIsSavingPreferences(false)
    }
  }

  // Reset context handlers
  const handleResetContext = () => {
    setResetContextState('confirming')
  }

  const handleResetContextCancel = () => {
    setResetContextState('idle')
  }

  const handleResetContextConfirm = async () => {
    setResetContextState('loading')
    try {
      await resetPakHarContext()
      // Remove cached entries entirely — no stale flash on next mount
      queryClient.removeQueries({ queryKey: ['plan'] })
      queryClient.removeQueries({ queryKey: ['activities'] })
      queryClient.removeQueries({ queryKey: ['review'] })
      queryClient.removeQueries({ queryKey: ['insights'] })
      // Clear the in-memory chat store (Zustand)
      clearChat()
      router.replace('/dashboard')
    } catch {
      setResetContextState('error')
    }
  }

  // Loading state
  if (isLoading) {
    return <PageLoadingSkeleton />
  }

  // User and stats props wired to real data
  const user = {
    name: userProfile?.name ?? 'Athlete',
    stravaAthleteId: userProfile?.strava_athlete_id ?? null,
    subscribedSince: userProfile
      ? new Date(userProfile.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—',
    timezone: 'Asia/Jakarta',
    preferredUnit: 'km',
  }

  const stats = {
    editionsReceived: userProfile?.total_activities ?? 0,
    dispatchesFiled: userProfile?.total_activities ?? 0,
    weeklyPlans: userProfile?.weeks_on_plan ?? 0,
    lettersExchanged: 0,
  }

  return (
    <SettingsPaper
      user={user}
      stats={stats}
      voice={voice}
      deliveryPrefs={deliveryPrefs}
      theme={theme}
      onVoiceChange={setVoice}
      onToggleDelivery={handleToggleDelivery}
      onThemeChange={setTheme}
      onDisconnect={handleDisconnect}
      onNav={onNav}
      onResetContext={handleResetContext}
      resetContextState={resetContextState}
      onResetContextConfirm={handleResetContextConfirm}
      onResetContextCancel={handleResetContextCancel}
      preferences={preferences}
      onPreferenceChange={handlePreferenceChange}
      onAvailableDaysChange={handleAvailableDaysChange}
      onGoalEventChange={handleGoalEventChange}
      onSavePreferences={handleSavePreferences}
      isSavingPreferences={isSavingPreferences}
      preferencesSaved={preferencesSaved}
      preferencesError={preferencesError}
    />
  )
}
