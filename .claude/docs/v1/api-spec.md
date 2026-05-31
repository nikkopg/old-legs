# Old Legs — API Specification

> Maintained by the **Backend Agent**. Read by the **Frontend Agent** before building any data-fetching logic.
> Last updated: 2026-04-18

---

## Base URL
```
http://localhost:8000
```
Set via `NEXT_PUBLIC_API_URL` in the frontend `.env`.

---

## Authentication
All protected routes require a session cookie set after Strava OAuth.
Unauthenticated requests return `401 { "detail": "Not authenticated" }`.

---

## Endpoints

*Backend agent fills this in as endpoints are built and marked READY FOR QA.*

### Auth

#### `POST /auth/strava`
> Status: ✅ Implemented (TASK-003)

Initiates Strava OAuth flow. Returns redirect URL.

**Request (JSON body):**
```json
{
  "state": "optional-csrf-token"
}
```

**Response (200):**
```json
{
  "oauth_url": "https://www.strava.com/oauth/authorize?client_id=12345&redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Fauth%2Fstrava%2Fcallback&response_type=code&scope=read%2Cactivity%3Aread"
}
```

**Errors:**
- 500: STRAVA_CLIENT_ID or STRAVA_REDIRECT_URI not configured

---

#### `GET /auth/strava/callback`
> Status: ✅ Implemented (TASK-003)

Handles OAuth callback. Exchanges code for tokens, fetches athlete profile, creates/updates user.

**Query Parameters:**
- `code` (required): Authorization code from Strava
- `state` (optional): CSRF token (not validated yet)

**Response (200):**
```json
{
  "success": true,
  "message": "Strava account connected successfully",
  "user": {
    "id": 1,
    "name": "John Doe",
    "avatar_url": "https://s4-ssl...",
    "strava_athlete_id": "1234567",
    "created_at": "2026-04-11T10:30:00",
    "updated_at": "2026-04-11T10:30:00",
  }
}
```

**Errors:**
- 400: Missing authorization code
- 500: Strava credentials not configured
- 400/500: Strava API errors (invalid code, expired, etc.)

---

#### `DELETE /auth/strava`
> Status: ✅ Implemented (TASK-031)

Disconnect the current user's Strava account. Clears stored tokens and deletes the session cookie. The user record is retained.

**Auth:** Requires `session_user_id` httpOnly cookie.

**Request:** No body required.

**Response (200):**
```json
{"message": "Disconnected from Strava"}
```

**Errors:**
- 401: Not authenticated (missing or invalid session cookie)

---

#### `GET /auth/strava/status`
> Status: ✅ Implemented (TASK-003)

Check OAuth status for current session/user.

**Response (200) — unauthenticated:**
```json
{ "connected": false, "message": "No active session. Use /auth/strava to connect." }
```

**Response (200) — authenticated:**
```json
{
  "connected": true,
  "message": "Strava account connected.",
  "user": { "id": 1, "name": "Nikko", "avatar_url": "...", "strava_athlete_id": "112542884" }
}
```

This endpoint is intentionally public — it returns 200 regardless of auth state. The frontend uses it to determine login state without triggering a 401.

---

### Activities

#### `GET /activities`
> Status: ✅ Implemented (TASK-004)

Returns list of user's synced activities. Triggers a Strava sync on every load.

**Auth:** Requires `session_user_id` httpOnly cookie.

**Response (200):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "strava_activity_id": "1234567890",
    "name": "Morning Run",
    "distance_km": 10.5,
    "moving_time_seconds": 3600,
    "average_pace_min_per_km": 5.714,
    "average_hr": 155,
    "max_hr": 172,
    "elevation_gain_m": 45,
    "activity_date": "2026-04-15T07:30:00",
    "analysis": null,
    "analysis_generated_at": null,
    "sync_status": "synced",
    "created_at": "2026-04-15T08:00:00",
    "updated_at": "2026-04-15T08:00:00"
  }
]
```

**Errors:**
- 401: Not authenticated

---

#### `GET /activities/{id}`
> Status: ✅ Implemented (TASK-004)

Returns single activity detail. Ownership-guarded (404 for other users' activities).

**Auth:** Requires `session_user_id` httpOnly cookie.

**Response (200):** Single ActivityRead object (same shape as list item above).

**Errors:**
- 401: Not authenticated
- 404: Activity not found or belongs to another user

---

#### `POST /activities/{id}/analyze`
> Status: ✅ Implemented (TASK-007)

Triggers Pak Har's post-run analysis for a specific activity. Calls Ollama, collects the
full streamed response, persists it on the activity record, and returns it as plain JSON
(not a stream). Re-analyzing an already-analyzed activity overwrites the previous result.

Rate limited: 20 requests/60s per user (shared in-memory sliding window with `/coach/chat`).

**Auth:** Requires `session_user_id` httpOnly cookie.

**Path parameter:** `id` — internal activity ID (integer)

**Request:** No body required.

**Response (200):**
```json
{
  "analysis": "That run was controlled — 8.2 km at 5:43/km with an average HR of 158 bpm sits right at the top of your aerobic zone. Your pace dropped in the last 2 km, which at that heart rate tells me you went out too fast for the conditions. Next run: start 15 seconds slower for the first 3 km and hold it. See if the back half takes care of itself."
}
```

After a successful call, the activity's `analysis` and `analysis_generated_at` fields are
also updated and will be reflected in subsequent `GET /activities/{id}` responses.

**Errors:**
- 401: Not authenticated
- 404: Activity not found or belongs to another user
- 429: Rate limit exceeded
- 503: Ollama not running or unreachable
- 504: Ollama did not respond within 60 seconds

---

### Training Plan

#### `POST /plan/generate`
> Status: ✅ Implemented (TASK-008)

Generates a new 7-day training plan using the last 4 weeks of activity data. Calls Ollama with Pak Har's plan prompt (non-streaming), persists the result, deactivates any prior active plan, and returns the new plan.

Rate limited: 20 requests/60s per user (shared window with `/coach/chat` and `/activities/{id}/analyze`).

**Auth:** Requires `session_user_id` httpOnly cookie.

**Request:** No body required.

**Response (200) — `TrainingPlanRead`:**
```json
{
  "id": 1,
  "user_id": 1,
  "week_start_date": "2026-04-14",
  "is_active": true,
  "plan_data": {
    "monday": {
      "day": "Monday",
      "type": "easy",
      "description": "40 min easy. HR under 145. Do not check your pace.",
      "duration_minutes": 40
    },
    "tuesday": {
      "day": "Tuesday",
      "type": "rest",
      "description": "Rest. You ran six days last week. This is not optional.",
      "duration_minutes": 0
    }
  },
  "pak_har_notes": {
    "week_summary": "Your last four weeks show 3 runs per week average. You are not ready for tempo work yet.",
    "monday": "Start slow. The first 10 minutes should feel embarrassingly easy.",
    "tuesday": null
  },
  "created_at": "2026-04-17T09:00:00",
  "updated_at": "2026-04-17T09:00:00"
}
```

**Errors:**
- 401: Not authenticated
- 429: Rate limit exceeded
- 503: Ollama not running or unreachable (RuntimeError from service)
- 504: Ollama timed out
- 500: Plan JSON could not be parsed from Ollama response

---

#### `GET /plan/current`
> Status: ✅ Implemented (TASK-008)

Returns the most recently generated active plan for the current user. No Ollama call — DB lookup only.

**Auth:** Requires `session_user_id` httpOnly cookie.

**Response (200):** `TrainingPlanRead` — same shape as `POST /plan/generate` response.

**Errors:**
- 401: Not authenticated
- 404: No active plan found (user needs to call `POST /plan/generate` first)

---

### Coach

#### `POST /coach/chat`
> Status: ✅ Implemented (TASK-006)

Send a message to Pak Har. Returns a Server-Sent Events stream.
Rate limited: 20 requests/60s per user (in-memory sliding window).

**Auth:** Requires `session_user_id` httpOnly cookie.

**Request (JSON body):**
```json
{ "message": "Why am I getting slower?" }
```

**Response:** `text/event-stream` — each line is `data: <chunk>`, terminated with `data: [DONE]`

**Error events (in-stream):** Once streaming begins, errors are delivered as SSE events:
```
data: [ERROR] Pak Har is unavailable right now. Make sure Ollama is running.
```
The stream ends immediately after an error event.

**Pre-stream errors (HTTP status codes):**
- 401: Not authenticated
- 422: Missing or empty message body
- 429: Rate limit exceeded

---

### User

#### `GET /user/me`
> Status: 🔲 Not built

Returns current user profile and summary stats.

---

## Frontend Requests
*Frontend agent adds requests here when they need a new endpoint or change to an existing one.*
