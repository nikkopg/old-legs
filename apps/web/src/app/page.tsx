'use client'

import { useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

interface StravaAuthResponse {
  oauth_url: string
}

function ConnectStravaButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/auth/strava`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        setError('Could not initiate Strava authorization. Please try again.')
        setLoading(false)
        return
      }

      const data = (await res.json()) as StravaAuthResponse

      if (!data.oauth_url) {
        setError('Invalid response from server. Please try again.')
        setLoading(false)
        return
      }

      window.location.href = data.oauth_url
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="bg-[var(--color-accent)] text-white rounded-md px-6 py-3 text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Connecting...' : 'Connect Strava'}
      </button>
      {error && (
        <p className="text-[var(--color-error)] text-sm">{error}</p>
      )}
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-background)]">
      <h1 className="text-4xl font-bold text-[var(--color-text-primary)]">
        Old Legs
      </h1>
      <p className="text-[var(--color-text-muted)] text-sm">
        He&rsquo;s 70. He&rsquo;s already lapped you. And he has thoughts.
      </p>
      <div className="mt-4">
        <ConnectStravaButton />
      </div>
    </main>
  )
}
