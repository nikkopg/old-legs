// READY FOR QA
// What was built: Strava OAuth callback page (TASK-017)
// Flow: reads ?code from searchParams → calls GET /auth/strava/callback?code=... on backend
//       → forwards session_user_id cookie → redirects to /dashboard on success
// Edge cases to test:
//   - ?error param from Strava (user denied access)
//   - missing ?code param
//   - backend returns non-OK (invalid code, expired, network down)
//   - backend sets session cookie correctly and browser receives it after redirect
//   - double-submission of same code (Strava codes are single-use)

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

interface CallbackSearchParams {
  code?: string
  error?: string
  state?: string
}

interface ErrorPageProps {
  message: string
}

function ErrorPage({ message }: ErrorPageProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)]">
      <p className="text-[var(--color-error)] text-sm">{message}</p>
      <Link
        href="/"
        className="mt-4 text-[var(--color-text-muted)] text-sm underline underline-offset-4"
      >
        Try again
      </Link>
    </main>
  )
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<CallbackSearchParams>
}) {
  const params = await searchParams

  if (params.error) {
    return <ErrorPage message="Strava authorization was denied." />
  }

  const code = params.code

  if (!code) {
    return <ErrorPage message="No authorization code received." />
  }

  let sessionUserId: string | null = null
  let errorMessage: string | null = null

  try {
    const res = await fetch(
      `${API_URL}/auth/strava/callback?code=${encodeURIComponent(code)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      errorMessage = 'Authorization failed. Please try again.'
    } else {
      // Extract session_user_id from Set-Cookie headers
      const setCookieHeader = res.headers.get('set-cookie')
      if (setCookieHeader) {
        // Parse out session_user_id value from Set-Cookie string
        const match = setCookieHeader.match(/session_user_id=([^;]+)/)
        if (match) {
          sessionUserId = match[1]
        }
      }

      if (!sessionUserId) {
        // Fall back to extracting user id from response body
        // Backend returns: { success: true, user: { id: number, ... } }
        try {
          const body = (await res.json()) as {
            user?: { id?: number }
            user_id?: number
            id?: number
          }
          const uid = body.user?.id ?? body.user_id ?? body.id
          if (uid !== undefined) {
            sessionUserId = String(uid)
          }
        } catch {
          // body may not be JSON or may already be consumed — not fatal
        }
      }

      if (!sessionUserId) {
        errorMessage = 'Session could not be established. Please try again.'
      }
    }
  } catch {
    errorMessage = 'Could not reach the server. Please try again.'
  }

  if (errorMessage) {
    return <ErrorPage message={errorMessage} />
  }

  // Forward the session cookie to the browser response.
  // cookies().set() must be called before redirect() so the Set-Cookie header
  // is included in the response.
  const cookieStore = await cookies()
  cookieStore.set('session_user_id', sessionUserId!, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    // secure: true in production — not forced here to support local dev over HTTP
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  redirect('/dashboard')
}
