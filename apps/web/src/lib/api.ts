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

import type { Activity, ActivityListResponse, ApiError, GoalEvent, Insights, PlanNextTarget, TrainingPlan, WeeklyReview, UserProfile, OnboardingRequest, OnboardingResponse } from '@/types/api'

export interface WatchStatusResponse {
  platform: string;
  connected: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export interface WatchSyncResponse {
  results: Record<string, string>;
}

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
      const body = await res.json()
      if (typeof body.detail === 'string') {
        detail = body.detail
      } else if (Array.isArray(body.detail) && body.detail.length > 0) {
        // FastAPI 422 — detail is an array of Pydantic error objects {type, loc, msg, input}
        detail = body.detail.map((e: { msg?: string }) => e.msg ?? String(e)).join('; ')
      }
    } catch {
      // response body wasn't JSON — keep the default message
    }
    console.warn(`[api] ${options?.method ?? 'GET'} ${path} → ${res.status}`, detail)
    const err: ApiError = { detail, status: res.status }
    throw err
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export async function getUserMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/user/me')
}

export async function saveOnboarding(body: OnboardingRequest): Promise<OnboardingResponse> {
  return apiFetch<OnboardingResponse>('/user/onboarding', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function saveGoalEvent(goalEvent: GoalEvent | null): Promise<OnboardingResponse> {
  return apiFetch<OnboardingResponse>('/user/onboarding', {
    method: 'POST',
    body: JSON.stringify({ goal_event: goalEvent }),
  })
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

export async function disconnectStrava(): Promise<void> {
  await fetch('/api/disconnect', { method: 'POST' })
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

export async function saveRpe(activityId: number, rpe: number | null): Promise<Activity> {
  return apiFetch<Activity>(`/activities/${activityId}/rpe`, {
    method: 'PATCH',
    body: JSON.stringify({ rpe }),
  })
}

// ---------------------------------------------------------------------------
// Training Plan
// ---------------------------------------------------------------------------

export async function getCurrentPlan(): Promise<TrainingPlan> {
  return apiFetch<TrainingPlan>('/plan/current')
}

export async function getPlanNextTarget(): Promise<PlanNextTarget> {
  return apiFetch<PlanNextTarget>('/plan/next-target')
}

export async function generatePlan(): Promise<TrainingPlan> {
  return apiFetch<TrainingPlan>('/plan/generate', {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export async function getInsights(): Promise<Insights> {
  return apiFetch<Insights>('/insights')
}

// ---------------------------------------------------------------------------
// Weekly Review
// ---------------------------------------------------------------------------

export async function getCurrentReview(): Promise<WeeklyReview> {
  return apiFetch<WeeklyReview>('/review/current')
}

export async function generateWeeklyReview(): Promise<WeeklyReview> {
  return apiFetch<WeeklyReview>('/review/generate', {
    method: 'POST',
  })
}

// ---------------------------------------------------------------------------
// Plan Verdict
// ---------------------------------------------------------------------------

export async function getPlanVerdict(
  activityId: number,
  target: string,
  sessionType: string,
): Promise<{ verdict_short: string | null; verdict_tag: string | null; tone: string | null }> {
  return apiFetch(`/activities/${activityId}/plan-verdict`, {
    method: 'POST',
    body: JSON.stringify({ target, session_type: sessionType }),
  })
}

// ---------------------------------------------------------------------------
// Coach — history management
// ---------------------------------------------------------------------------

export async function deleteChatHistory(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/coach/history', { method: 'DELETE' })
}

export async function resetPakHarContext(): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/coach/reset', { method: 'DELETE' })
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
      const body = await res.json()
      if (typeof body.detail === 'string') {
        detail = body.detail
      } else if (Array.isArray(body.detail) && body.detail.length > 0) {
        detail = body.detail.map((e: { msg?: string }) => e.msg ?? String(e)).join('; ')
      }
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

// ---------------------------------------------------------------------------
// Watch Integration
// ---------------------------------------------------------------------------

export async function getWatchStatus(): Promise<WatchStatusResponse[]> {
  return apiFetch<WatchStatusResponse[]>('/watch/status');
}

export async function connectWatch(
  platform: string,
  credentials: Record<string, string>
): Promise<WatchStatusResponse> {
  return apiFetch<WatchStatusResponse>('/watch/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, credentials }),
  });
}

export async function connectWatchMfa(
  platform: string,
  mfa_code: string
): Promise<WatchStatusResponse> {
  return apiFetch<WatchStatusResponse>('/watch/connect/mfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, mfa_code }),
  });
}

export async function disconnectWatch(platform: string): Promise<void> {
  await apiFetch<void>(`/watch/${platform}/disconnect`, { method: 'DELETE' });
}

export async function syncToWatch(): Promise<WatchSyncResponse> {
  return apiFetch<WatchSyncResponse>('/watch/sync', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Share image — upload PNG blob, get back a short-lived token
// ---------------------------------------------------------------------------

export async function uploadShareImage(blob: Blob): Promise<{ token: string }> {
  const form = new FormData()
  form.append('file', blob, 'share.png')
  // Do NOT pass Content-Type — browser must set it with the multipart boundary
  const res = await fetch(`${API_BASE}/share-image`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) {
    const err: ApiError = { detail: 'Upload failed', status: res.status }
    throw err
  }
  return res.json() as Promise<{ token: string }>
}
