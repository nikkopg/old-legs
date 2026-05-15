// READY FOR QA
// Page: /auth/connected (TASK-200)
// What was built: Intermediate success page shown after Strava OAuth completes.
//   Renders <StravaConnectedStamp /> which animates a rubber-stamp landing for ~1.4s,
//   then router.replace('/dashboard'). Pulls the subscriber number from the
//   session cookie set by the callback handler.
//
// Why an intermediate page: gives the user a moment to register the success
// before they're dropped into the dashboard. Replaces the previous immediate redirect.
//
// Edge cases to test:
//   - No session cookie → render with subscriber number "—" (still works as a smooth handoff)
//   - User hits back: redirects to /dashboard (no loop into OAuth)
//   - prefers-reduced-motion: stamp shows immediately, redirect after ~200ms

import { cookies } from 'next/headers'
import { ConnectedClient } from './_client'

export default async function ConnectedPage() {
  const cookieStore = await cookies()
  const sessionUserId = cookieStore.get('session_user_id')?.value ?? null
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return (
    <ConnectedClient
      subscriberNumber={sessionUserId ?? '—'}
      date={today}
    />
  )
}
