import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function POST() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session_user_id')

  // Best-effort call to backend to clear Strava tokens — ignore failures
  if (sessionCookie) {
    try {
      await fetch(`${API_URL}/auth/strava`, {
        method: 'DELETE',
        headers: { Cookie: `session_user_id=${sessionCookie.value}` },
      })
    } catch {
      // backend unreachable — still clear the session
    }
  }

  // Clear the cookie server-side (this is the authoritative clear)
  cookieStore.delete('session_user_id')

  return NextResponse.json({ ok: true })
}
