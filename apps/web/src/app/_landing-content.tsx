'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LandingPage } from '@/components/redesign/LandingPage'
import { initiateStravaOAuth } from '@/lib/api'

type ConnectState = 'idle' | 'connecting' | 'error'

const ERROR_MESSAGES: Record<string, string> = {
  strava_denied: "You declined access. Pak Har can't help without it.",
  missing_code: "Strava didn't send an authorisation code. Try again.",
  no_session: 'Login completed but no session was created. Try again.',
  auth_failed: 'Something went wrong with the login. Try again.',
  server_unreachable: "The server didn't answer. Make sure it's running.",
}

function resolveErrorMessage(code: string | null): string | undefined {
  if (!code) return undefined
  return ERROR_MESSAGES[code] ?? 'Something went wrong. Try again.'
}

export function LandingContent() {
  const searchParams = useSearchParams()
  const errorCode = searchParams.get('error')
  const initialErrorMessage = resolveErrorMessage(errorCode)

  const [connectState, setConnectState] = useState<ConnectState>(
    initialErrorMessage ? 'error' : 'idle'
  )
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    initialErrorMessage
  )

  // Re-sync if the URL param changes (e.g. browser back/forward)
  useEffect(() => {
    const code = searchParams.get('error')
    const msg = resolveErrorMessage(code)
    if (msg) {
      setErrorMessage(msg)
      setConnectState('error')
    } else {
      setErrorMessage(undefined)
      setConnectState('idle')
    }
  }, [searchParams])

  async function handleConnect() {
    setConnectState('connecting')
    setErrorMessage(undefined)
    try {
      const { oauth_url } = await initiateStravaOAuth()
      window.location.href = oauth_url
    } catch {
      setConnectState('error')
      setErrorMessage('Something went wrong. Try again.')
    }
  }

  return (
    <LandingPage
      onConnect={handleConnect}
      connectState={connectState}
      errorMessage={errorMessage}
    />
  )
}
