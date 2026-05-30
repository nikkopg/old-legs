import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const res = await fetch(`${API_URL}/auth/strava`, {
      method: 'POST',
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'oauth_init_failed' }, { status: res.status })
    }

    const body = (await res.json()) as { oauth_url: string }
    const response = NextResponse.json(body)

    // Forward the oauth_state cookie from the backend so it is scoped to this
    // origin (localhost:3000) rather than localhost:8000. Without this, the
    // callback route cannot read it because the browser treats the two ports
    // as separate cookie jars in some environments.
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      response.headers.set('set-cookie', setCookie)
    }

    return response
  } catch {
    return NextResponse.json({ error: 'server_unreachable' }, { status: 503 })
  }
}
