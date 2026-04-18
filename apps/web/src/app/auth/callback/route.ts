import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  if (searchParams.get('error')) {
    return NextResponse.redirect(new URL('/?error=strava_denied', request.url))
  }

  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', request.url))
  }

  try {
    const res = await fetch(
      `${API_URL}/auth/strava/callback?code=${encodeURIComponent(code)}`,
      { method: 'GET', cache: 'no-store' }
    )

    if (!res.ok) {
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
    }

    // Extract session_user_id from backend Set-Cookie or response body
    let sessionUserId: string | null = null

    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      const match = setCookieHeader.match(/session_user_id=([^;]+)/)
      if (match) sessionUserId = match[1]
    }

    if (!sessionUserId) {
      const body = (await res.json()) as { user?: { id?: number } }
      const uid = body.user?.id
      if (uid !== undefined) sessionUserId = String(uid)
    }

    if (!sessionUserId) {
      return NextResponse.redirect(new URL('/?error=no_session', request.url))
    }

    const cookieStore = await cookies()
    cookieStore.set('session_user_id', sessionUserId, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    })

    return NextResponse.redirect(new URL('/dashboard', request.url))
  } catch {
    return NextResponse.redirect(new URL('/?error=server_unreachable', request.url))
  }
}
