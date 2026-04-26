// READY FOR QA
// Feature: Settings page — TASK-142 (SettingsPaper tabloid redesign) + TASK-152 (Reset Context)
// What was built:
//   Settings page wired to the SettingsPaper tabloid component.
//   - Loads getAuthStatus via React Query; redirects to / on 401 or !connected.
//   - voice and deliveryPrefs are local-only state (no backend yet).
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
//   - delivery toggles → knob animates, onToggleDelivery fires with correct key
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
import { getAuthStatus, disconnectStrava, resetPakHarContext } from '@/lib/api'
import { useUser } from '@/hooks/useUser'
import { useChatStore } from '@/store/chat'
import type { ApiError } from '@/types/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoiceLevel = 'gentle' | 'standard' | 'unfiltered'

interface DeliveryPreferences {
  dispatchAfterRun: boolean
  weeklyPlanMonday: boolean
  weeklyReviewSunday: boolean
  missedRunNudge: boolean
}

type ResetContextState = 'idle' | 'confirming' | 'loading' | 'error'

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const clearChat = useChatStore((s) => s.clear)

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
    dispatchAfterRun: true,
    weeklyPlanMonday: true,
    weeklyReviewSunday: true,
    missedRunNudge: true,
  })

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

  // Delivery toggle handler
  const handleToggleDelivery = (key: keyof DeliveryPreferences) => {
    setDeliveryPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
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
    return (
      <div
        style={{ background: '#f4efe4', minHeight: '100vh' }}
        className="animate-pulse"
      />
    )
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
      onVoiceChange={setVoice}
      onToggleDelivery={handleToggleDelivery}
      onDisconnect={handleDisconnect}
      onNav={onNav}
      onResetContext={handleResetContext}
      resetContextState={resetContextState}
      onResetContextConfirm={handleResetContextConfirm}
      onResetContextCancel={handleResetContextCancel}
    />
  )
}
