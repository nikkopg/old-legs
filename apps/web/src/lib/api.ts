// READY FOR QA
// Feature: API client (TASK-018)
// What was built: Typed fetch wrapper + named functions for all implemented endpoints
// Edge cases to test:
//   - 401 response on any protected endpoint (should throw ApiError with detail)
//   - 429 rate limit on analyze, plan/generate, and coach/chat
//   - 503/504 when Ollama is unreachable
//   - streamChat: partial chunks, [DONE] terminator, network drop mid-stream
//   - streamChat: lines that are not "data: " prefixed (should be ignored)
//   - analyzeActivity on an already-analyzed activity (overwrites — should still return 200)
//   - getCurrentPlan when no plan exists (404 — ApiError thrown)

import type { Activity, ActivityListResponse, ApiError, TrainingPlan } from '@/types/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    let detail = `API error ${res.status}`
    try {
      const body = (await res.json()) as ApiError
      if (body.detail) detail = body.detail
    } catch {
      // response body wasn't JSON — keep the default message
    }
    const err: ApiError = { detail, status: res.status }
    throw err
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function initiateStravaOAuth(state?: string): Promise<{ oauth_url: string }> {
  return apiFetch<{ oauth_url: string }>('/auth/strava', {
    method: 'POST',
    body: JSON.stringify({ state: state ?? null }),
  })
}

export async function getAuthStatus(): Promise<{ connected: boolean; message: string }> {
  return apiFetch<{ connected: boolean; message: string }>('/auth/strava/status')
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function getActivities(): Promise<Activity[]> {
  const res = await apiFetch<ActivityListResponse>('/activities')
  return res.items
}

export async function getActivity(id: number): Promise<Activity> {
  return apiFetch<Activity>(`/activities/${id}`)
}

export async function analyzeActivity(id: number): Promise<{ analysis: string }> {
  return apiFetch<{ analysis: string }>(`/activities/${id}/analyze`, {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Training Plan
// ---------------------------------------------------------------------------

export async function getCurrentPlan(): Promise<TrainingPlan> {
  return apiFetch<TrainingPlan>('/plan/current')
}

export async function generatePlan(): Promise<TrainingPlan> {
  return apiFetch<TrainingPlan>('/plan/generate', {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Coach — SSE streaming
// ---------------------------------------------------------------------------

export async function streamChat(
  message: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/coach/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    let detail = `API error ${res.status}`
    try {
      const body = (await res.json()) as ApiError
      if (body.detail) detail = body.detail
    } catch {
      // response body wasn't JSON
    }
    const err: ApiError = { detail, status: res.status }
    throw err
  }

  const reader = res.body?.getReader()
  if (!reader) {
    throw { detail: 'No response body from /coach/chat' } satisfies ApiError
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue

      const payload = line.slice('data: '.length)

      if (payload === '[DONE]') {
        onDone()
        return
      }

      onChunk(payload)
    }
  }

  // Stream ended without a [DONE] marker — still signal completion
  onDone()
}
