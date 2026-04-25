// READY FOR QA
// Page: Root landing page (/)
// What was built: Pre-auth entry point. Wraps <LandingPage /> in a full-viewport dark
//   container and wires up Strava OAuth flow via initiateStravaOAuth().
// Edge cases to test:
//   - connectState starts as 'idle'; button is visible and clickable
//   - Clicking "Connect Strava" sets state to 'connecting' immediately (spinner/text visible)
//   - On success, window.location.href is set to the returned oauth_url (redirect fires)
//   - On API failure, state transitions to 'error' and the Errata + Retry button appear
//   - Retry button triggers the same flow from the top (back to 'connecting' first)
//   - No auth check — unauthenticated users must be able to reach this page freely

'use client'

import { useState } from 'react'
import { LandingPage } from '@/components/redesign/LandingPage'
import { initiateStravaOAuth } from '@/lib/api'

type ConnectState = 'idle' | 'connecting' | 'error'

export default function RootPage() {
  const [connectState, setConnectState] = useState<ConnectState>('idle')

  async function handleConnect() {
    setConnectState('connecting')
    try {
      const { oauth_url } = await initiateStravaOAuth()
      window.location.href = oauth_url
    } catch {
      setConnectState('error')
    }
  }

  return (
    <LandingPage onConnect={handleConnect} connectState={connectState} />
  )
}
