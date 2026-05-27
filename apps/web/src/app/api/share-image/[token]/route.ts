import { NextRequest, NextResponse } from 'next/server'

// API_URL is for server-side container-to-container calls (set in docker-compose).
// Falls back to NEXT_PUBLIC_API_URL or localhost for non-Docker dev.
const API_BASE = process.env.API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const res = await fetch(`${API_BASE}/share-image/${token}`)
  if (!res.ok) return new NextResponse(null, { status: res.status })
  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
