// READY FOR QA
// Page: Root landing page (/)
// What was built: Pre-auth entry point. Wraps <LandingContent /> in a Suspense boundary
//   so useSearchParams() can be called safely in the client layer.
// Edge cases to test:
//   - connectState starts as 'idle'; button is visible and clickable
//   - Clicking "Connect Strava" sets state to 'connecting' immediately (spinner/text visible)
//   - On success, window.location.href is set to the returned oauth_url (redirect fires)
//   - On API failure, state transitions to 'error' and the Errata + Retry button appear
//   - Retry button triggers the same flow from the top (back to 'connecting' first)
//   - No auth check — unauthenticated users must be able to reach this page freely
//   - BUG-026: ?error= param from /auth/callback redirects is read and shown in the Errata block:
//       strava_denied  → "You declined access. Pak Har can't help without it."
//       missing_code   → "Strava didn't send an authorisation code. Try again."
//       no_session     → "Login completed but no session was created. Try again."
//       auth_failed    → "Something went wrong with the login. Try again."
//       server_unreachable → "The server didn't answer. Make sure it's running."
//       (unknown)      → "Something went wrong. Try again."

import { Suspense } from 'react'
import { LandingContent } from './_landing-content'

export default function RootPage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  )
}
