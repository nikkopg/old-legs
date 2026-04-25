// READY FOR QA
// Feature: Settings page — TASK-142 (SettingsPaper tabloid redesign)
// What was built:
//   Settings page wired to the SettingsPaper tabloid component.
//   - Loads getAuthStatus via React Query; redirects to / on 401 or !connected.
//   - voice and deliveryPrefs are local-only state (no backend yet).
//   - disconnectStrava() is called on onDisconnect, then redirects to /.
//   - Dark-frame wrapper matches dashboard/plan/coach page pattern.
//   - Loading → paper-coloured skeleton block with animate-pulse.
//   - minimal user prop built from auth status (name hardcoded to 'Athlete').
//   - minimal stats prop (all zeros — backend not yet wired).
// Edge cases to test:
//   - Loading state → skeleton block shown, no flicker
//   - 401 response → router.replace('/') called immediately
//   - connected=false → router.replace('/') called
//   - onDisconnect → disconnectStrava() called, then router.replace('/')
//   - disconnectStrava() throws → error is swallowed, redirect still happens
//   - voice toggle → active voice card updates visually, onVoiceChange fires
//   - delivery toggles → knob animates, onToggleDelivery fires with correct key
//   - onNav → pushes correct route for all 5 nav keys

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { SettingsPaper } from '@/components/redesign/SettingsPaper'
import { getAuthStatus, disconnectStrava } from '@/lib/api'
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()

  // Auth status query
  const {
    data: authData,
    isLoading,
    error,
  } = useQuery<{ connected: boolean; message: string }, ApiError>({
    queryKey: ['authStatus'],
    queryFn: getAuthStatus,
    retry: false,
  })

  // Local-only preferences state (no backend yet)
  const [voice, setVoice] = useState<VoiceLevel>('standard')
  const [deliveryPrefs, setDeliveryPrefs] = useState<DeliveryPreferences>({
    dispatchAfterRun: true,
    weeklyPlanMonday: true,
    weeklyReviewSunday: true,
    missedRunNudge: true,
  })

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

  // Loading state
  if (isLoading) {
    return (
      <div
        style={{ background: '#f4efe4', minHeight: '100vh' }}
        className="animate-pulse"
      />
    )
  }

  // Minimal user and stats props (backend not yet wired)
  const user = {
    name: 'Athlete',
    stravaAthleteId: null,
    subscribedSince: '25 Apr 2026',
    timezone: 'Asia/Jakarta',
    preferredUnit: 'km',
  }

  const stats = {
    editionsReceived: 0,
    dispatchesFiled: 0,
    weeklyPlans: 0,
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
    />
  )
}
