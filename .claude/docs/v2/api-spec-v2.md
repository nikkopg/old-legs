# Old Legs — API Specification v2

> Maintained by the **Backend Agent**. Read by the **Frontend Agent** before building any data-fetching logic.
> Last updated: 2026-05-03

---

## Base URL
```
http://localhost:8000
```
Set via `NEXT_PUBLIC_API_URL` (browser) and `API_URL` (Next.js server-side) in the web service.

---

## Authentication
All protected routes require the `session_user_id` httpOnly cookie set after Strava OAuth.
Unauthenticated requests return `401 { "detail": "Not authenticated" }`.

---

## All Endpoints

### Auth

#### `POST /auth/strava`
> Status: ✅ v1

Initiates Strava OAuth. Returns redirect URL.

**Request:** `{ "state": "optional-csrf-token" }`

**Response (200):** `{ "oauth_url": "https://www.strava.com/oauth/authorize?..." }`

---

#### `GET /auth/strava/callback`
> Status: ✅ v1

Handles OAuth callback. Exchanges code for tokens, creates/updates user, sets `session_user_id` cookie.

**Query params:** `code` (required), `state` (optional)

**Response (200):**
```json
{
  "success": true,
  "user": { "id": 1, "name": "Nikko", "avatar_url": "...", "strava_athlete_id": "112542884" }
}
```

---

#### `DELETE /auth/strava`
> Status: ✅ v1

Disconnect Strava. Clears tokens, deletes session cookie. User record retained.

**Response (200):** `{ "message": "Disconnected from Strava" }`

---

#### `GET /auth/strava/status`
> Status: ✅ v1

Public endpoint — returns 200 regardless of auth state. Frontend uses this to determine login state.

**Response (200) — unauthenticated:** `{ "connected": false, "message": "No active session." }`

**Response (200) — authenticated:** `{ "connected": true, "user": { ... } }`

---

### User

#### `GET /user/me`
> Status: ✅ v2 (TASK-103) — implemented 2026-04-19

Returns current user profile and stored preferences. The `onboarding_completed` field tells the frontend whether to redirect a new user to the onboarding flow.

**Auth:** Required.

**Response (200) — `UserProfile` schema:**
```json
{
  "id": 1,
  "name": "Nikko",
  "avatar_url": "https://...",
  "strava_athlete_id": "112542884",
  "onboarding_completed": false,
  "weekly_km_target": 30,
  "days_available": 4,
  "biggest_struggle": "consistency",
  "resting_hr": 58,
  "max_hr": 185,
  "max_hr_observed": 183,
  "goal_event": "half_marathon",
  "race_date": "2026-10-18",
  "available_days": ["monday", "wednesday", "friday", "saturday"],
  "total_activities": 42,
  "total_distance_km": 387.5,
  "weeks_on_plan": 3,
  "created_at": "2026-04-18T00:00:00",
  "updated_at": "2026-04-19T00:00:00"
}
```

| Field | Type | Notes |
|---|---|---|
| `weekly_km_target` | `float` | Runner's current weekly km — captures present capacity, not an aspiration. Label in UI: "Current weekly km". |
| `resting_hr` | `integer \| null` | Set by runner during onboarding or via Runner's Brief. Used in Karvonen zone formula. Defaults to 60 bpm if null. |
| `max_hr` | `integer \| null` | User-provided max HR. Highest priority in zone calculation. |
| `max_hr_observed` | `integer \| null` | Auto-cached from activity history — max of all `max_hr` values seen across synced runs. Used when `max_hr` is null. |
| `goal_event` | `string \| null` | Runner's training goal. One of: `general_fitness`, `5k`, `10k`, `half_marathon`, `marathon`, `ultra`. Null until set via onboarding. |
| `race_date` | `date \| null` | ISO date string (`YYYY-MM-DD`). Target race date. Used by Pak Har for periodization — taper (<2 weeks), sharpening (2–7 weeks), base building (≥8 weeks). Null if no race scheduled. |
| `available_days` | `string[] \| null` | Specific days the runner can train: `"monday"` … `"sunday"`. Null until set. Supersedes `days_available` (int) for new saves; old int kept as fallback. Pak Har schedules sessions only on listed days. |
| `auto_plan_enabled` | `bool` | If `true`, a new weekly plan is generated automatically when the user's local time is Monday 05:00–06:00. Defaults to `true`. |
| `auto_review_enabled` | `bool` | If `true`, a weekly review is generated automatically when the user's local time is Sunday 20:00–21:00. Defaults to `true`. |
| `coach_voice` | `string` | Controls how blunt Pak Har is. One of: `"gentle"`, `"standard"`, `"unfiltered"`. Defaults to `"standard"`. |
| `timezone` | `string` | IANA timezone key used to fire scheduled jobs at the user's local time. Defaults to `"Asia/Jakarta"`. |
| `ntfy_topic` | `string \| null` | ntfy.sh topic name or full self-hosted URL. When set, the scheduler sends a push notification after each auto-generated plan or review. Null means notifications are off. |

**Errors:** 401

---

#### `GET /user/export`
> Status: ✅ v2 (T5) — implemented 2026-05-31

Download all user data as a ZIP archive. No Ollama call. No Strava call.

**Auth:** Required.

**Request:** No body. Auth cookie only.

**Response (200):** `application/zip` file download.

| Header | Value |
|---|---|
| `Content-Type` | `application/zip` |
| `Content-Disposition` | `attachment; filename="old-legs-export-YYYY-MM-DD.zip"` |

**ZIP contents (six JSON files):**

| File | Contents |
|---|---|
| `profile.json` | User profile fields: `name`, `avatar_url`, `weekly_km_target`, `days_available`, `available_days`, `biggest_struggle`, `resting_hr`, `max_hr`, `goal_event`, `race_date`, `coach_voice`, `timezone`, `auto_plan_enabled`, `auto_review_enabled`, `created_at`. **Never** includes `strava_access_token`, `strava_refresh_token`, or any encrypted field. |
| `activities.json` | All `Activity` records: `id`, `name`, `start_date`, `distance_m`, `moving_time_s`, `avg_hr`, `max_hr`, `avg_speed_ms`, `splits`, `grade_adjusted_pace`, `verdict_short`, `verdict_tag`, `tone`. |
| `plans.json` | All `TrainingPlan` records: `id`, `week_start_date`, `is_active`, `days`, `created_at`. |
| `reviews.json` | All `WeeklyReview` records: `id`, `week_start_date`, `content`, `created_at`. |
| `chat.json` | All `ChatMessage` records: `id`, `role`, `content`, `created_at`. |
| `insights.json` | Always an empty list — insights are computed on demand, not stored. |

All datetime values are serialised as ISO strings via `json.dumps(..., default=str)`. Arrays are empty (not omitted) when the user has no data.

**Errors:** 401

---

#### `POST /user/onboarding`
> Status: ✅ v2 (TASK-102) — implemented 2026-04-19

Save or update user onboarding preferences. Sets `onboarding_completed = true` on the user record after successful save.

**Auth:** Required.

**Request — `OnboardingRequest` schema:**
```json
{
  "weekly_km_target": 30,
  "days_available": 4,
  "biggest_struggle": "consistency",
  "goal_event": "half_marathon",
  "race_date": "2026-10-18",
  "available_days": ["monday", "wednesday", "friday", "saturday"]
}
```

**Field constraints:**
- `weekly_km_target` — float, >= 0. Represents the runner's current weekly volume (capacity), not a target.
- `days_available` — integer, 1–7
- `biggest_struggle` — string, non-empty free text
- `goal_event` — optional; one of `"general_fitness"`, `"5k"`, `"10k"`, `"half_marathon"`, `"marathon"`, `"ultra"`, or `null`. Any other value returns 422.
- `race_date` — optional; ISO date string `YYYY-MM-DD`, or `null` to clear. Always overwritten (passing `null` clears a previously saved date).
- `available_days` — optional; array of day name strings (`"monday"` … `"sunday"`). If provided, must be non-empty and contain only valid day names (422 otherwise). Null omits the field and leaves the existing value unchanged.
- `auto_plan_enabled` — optional boolean; defaults to `true`. Persisted as-is — no null coercion.
- `auto_review_enabled` — optional boolean; defaults to `true`. Persisted as-is.
- `coach_voice` — optional string; one of `"gentle"`, `"standard"`, `"unfiltered"`. Defaults to `"standard"`. Any other value returns 422.
- `timezone` — optional IANA timezone key (e.g. `"Asia/Jakarta"`, `"America/New_York"`). If provided, must be a valid IANA key — 422 otherwise. Null leaves existing value unchanged. Defaults to `"Asia/Jakarta"` on new users.
- `ntfy_topic` — optional string (max 256 chars). Bare topic name (`"my-topic"`) or full URL for self-hosted ntfy (`"https://ntfy.example.com/my-topic"`). Empty string clears the topic (stored as `null`). Null omits the field and leaves the existing value unchanged.

**Response (200):** `{ "message": "Preferences saved." }`

**Errors:** 401, 422

---

### Activities

#### `GET /activities`
> Status: ✅ v2 (TASK-107) — filtering, search, and server-side pagination added
> Last updated: 2026-04-24

Returns a paginated list of user's synced activities. Triggers Strava sync on every load.

**Auth:** Required.

**Query params (all optional):**
| Param | Type | Default | Notes |
|---|---|---|---|
| `start_date` | ISO date string | — | Filter activities on or after this date (e.g. `2026-03-01`) |
| `end_date` | ISO date string | — | Filter activities on or before this date (inclusive of full day) |
| `min_distance_km` | float (≥ 0) | — | Minimum distance in km |
| `max_distance_km` | float (≥ 0) | — | Maximum distance in km |
| `search` | string | — | Case-insensitive substring match on activity name |
| `page` | integer (≥ 1) | `1` | Page number (1-based) |
| `per_page` | integer (1–100) | `20` | Results per page; capped at 100 |

All filters are ANDed. Invalid param values (e.g. `per_page=200`, `page=0`) return **422**.

**Response (200):**
```json
{
  "items": [
    {
      "id": 1,
      "strava_activity_id": "123456789",
      "name": "Morning Run",
      "distance_km": 10.5,
      "moving_time_seconds": 3600,
      "average_pace_min_per_km": 5.71,
      "average_hr": 155,
      "max_hr": 172,
      "elevation_gain_m": 45,
      "activity_date": "2026-04-24T07:00:00",
      "sync_status": "synced",
      "analysis": "Solid effort. HR stayed in zone 2 for most of it...",
      "analysis_generated_at": "2026-04-24T08:05:00",
      "verdict_short": "Held pace but HR drifted in the last two km.",
      "verdict_tag": "FADED LATE",
      "tone": "critical",
      "splits": null,
      "streams": null,
      "user_id": 1,
      "created_at": "2026-04-24T07:10:00",
      "updated_at": "2026-04-24T08:05:00"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

**`ActivityRead` field notes:**
| Field | Type | Notes |
|---|---|---|
| `verdict_short` | `string \| null` | One-line verdict ≤12 words. Null until `/analyze` is called. |
| `verdict_tag` | `string \| null` | One of: `PACED POORLY`, `ON PLAN`, `HELD THE LINE`, `FADED LATE`, `FUELING`, `RESTRAINED`, `STEADY`, `NO SHOW`. Null if extraction failed. |
| `tone` | `string \| null` | One of: `critical`, `good`, `neutral`. Null if extraction failed. |
| `splits` | `array \| null` | Per-km split dicts from Strava detail fetch. Each dict: `{km, moving_time, distance, avg_speed_ms, hr\|null, cad\|null, elev\|null}`. Null until second-pass sync runs. |
| `streams` | `object \| null` | High-resolution Strava streams data (per-second arrays, downsampled to ≤500 points). Keys: `n` (int), `time`, `dist`, `vel`, `hr\|null`, `cad\|null`, `alt\|null`, `grade\|null`, `latlng\|null`. Null until explicitly fetched (TASK-166). |
| `rpe` | `integer \| null` | Runner's Rate of Perceived Exertion (1–10). Set via `PATCH /activities/{id}/rpe`. Null until the runner submits it. |

**Errors:** 401, 422

⚠️ **Frontend note (TASK-115):** Response shape changed from a plain array to a paginated object. Read `response.items` (not the response directly) and handle `total`/`page`/`per_page` for pagination UI.

---

#### `GET /activities/{id}`
> Status: ✅ v2 (TASK-133) — `ActivityRead` now includes `verdict_short`, `verdict_tag`, `tone`

Returns single activity. Ownership-guarded (404 for other users' activities).

**Auth:** Required.

**Response (200):** Single `ActivityRead` object (see `ActivityRead` field notes under `GET /activities` for verdict field details).

**Errors:** 401, 404

---

#### `POST /activities/{id}/analyze`
> Status: ✅ v2 (TASK-190) — converted to SSE streaming 2026-05-15

Triggers Pak Har's post-run analysis as an SSE stream. Makes **two** sequential Ollama calls:

1. **Long-form analysis** (streaming, collected) — Pak Har's full coaching feedback for the run.
2. **Structured verdict extraction** (non-streaming) — extracts `verdict_short`, `verdict_tag`, and `tone` from the long-form text. Best-effort; if Ollama returns malformed JSON or out-of-range values, all three fields are `null` in the complete event.

Re-analyzing overwrites all five fields (`analysis`, `analysis_generated_at`, `verdict_short`, `verdict_tag`, `tone`) on the `Activity` row. DB write happens after the complete event is emitted. Rate limited: 20 req/60s shared window.

**Auth:** Required.

**Response: `text/event-stream`**

Progress event (emitted before each stage begins):
```json
{"type": "progress", "step": "<label>", "elapsed_ms": 120}
```

Complete event (emitted after all stages succeed):
```json
{
  "type": "complete",
  "data": {
    "analysis": "That run was controlled. HR drift in the final km is worth watching.",
    "verdict_short": "Held pace but HR drifted in the last km.",
    "verdict_tag": "FADED LATE",
    "tone": "critical"
  }
}
```

Error event (emitted on any exception):
```json
{"type": "error", "message": "Pak Har is unavailable right now. Make sure Ollama is running."}
```

**Complete event `data` field notes:**
| Field | Type | Notes |
|---|---|---|
| `analysis` | `string` | Full Pak Har analysis text. Always present on success. |
| `verdict_short` | `string \| null` | One sentence, ≤12 words. No praise, no fluff. Null if extraction failed. |
| `verdict_tag` | `string \| null` | One of: `PACED POORLY`, `ON PLAN`, `HELD THE LINE`, `FADED LATE`, `FUELING`, `RESTRAINED`, `STEADY`, `NO SHOW`. Null if extraction failed or value out of range. |
| `tone` | `string \| null` | One of: `critical`, `good`, `neutral`. Null if extraction failed. |

**Progress event `step` labels (in order):**
1. `"Pulling your splits"`
2. `"Reading the zones"`
3. `"Checking your history"`
4. `"Writing the dispatch"`
5. `"Filing the verdict"`

**Pre-stream errors (HTTP error codes, no SSE body):**
- `401` — Not authenticated
- `404` — Activity not found or does not belong to this user
- `429` — Rate limit exceeded

**In-stream errors (HTTP 200, error event in stream body):**
- Ollama unreachable → error event with `"Pak Har is unavailable..."` message
- Ollama read timeout → error event with timeout message
- Any unhandled exception → error event with exception message

The `analysis`, `verdict_short`, `verdict_tag`, and `tone` fields are persisted to the activity row and available via `GET /activities/{id}` after this call completes.

⚠️ **Frontend note (TASK-190):** Response shape changed from `application/json` (`{ "analysis": str }`) to `text/event-stream`. Read the stream for progress/complete/error events. The analysis text and verdict fields are in `complete.data` (not the response body directly). No need to call `GET /activities/{id}` to get the analysis — it is in the complete event.

---

#### `PATCH /activities/{id}/rpe`
> Status: ✅ v2 — implemented 2026-05-14

Save or update the runner's Rate of Perceived Exertion (RPE) for a specific activity. RPE is included in Pak Har's post-run analysis context when present — cross-referenced against HR zone and splits to flag calibration mismatches.

**Auth:** Required. Ownership-guarded (404 for other users' activities).

**Request body — `ActivityRpeUpdate` schema:**
```json
{ "rpe": 7 }
```

| Field | Type | Notes |
|---|---|---|
| `rpe` | `integer \| null` | 1–10 scale. `null` clears the value. Values outside 1–10 return 422. |

**Response (200):** Full `ActivityRead` object (see `GET /activities/{id}`), with `rpe` set to the new value.

**Errors:** 401, 404, 422

---

#### `POST /activities/{id}/plan-verdict`
> Status: ✅ v2 (TASK-149) — implemented 2026-04-25

Plan-aware verdict for a matched activity. Compares what the training plan required against what the runner actually did. Returns a short Pak Har verdict specific to the plan context — this is distinct from `verdict_short` on the activity (which has no plan context).

**Stateless** — nothing is persisted. Always returns 200.

**Auth:** Required.

**Request body:**
```json
{
  "target": "40 min, HR < 140 bpm",
  "session_type": "EASY"
}
```

| Field | Type | Notes |
|---|---|---|
| `target` | `string` | Short measurable target from the plan day (e.g. `"40 min, HR < 140 bpm"`, `"8 km easy"`) |
| `session_type` | `string` | Session type label from the plan day (e.g. `"EASY"`, `"TEMPO"`, `"LONG"`) |

**Response (200) — `PlanVerdictResponse`:**
```json
{
  "verdict_short": "5 minutes short and HR drifted over 140 in the last km.",
  "verdict_tag": "PACED POORLY",
  "tone": "critical"
}
```

All fields are `null` if:
- Ollama is unreachable or returns malformed JSON
- Ollama returns an out-of-range `verdict_tag` or `tone` value

Note: prior to 2026-05-14 this endpoint skipped the Ollama call when `activity.analysis` was null. That guard was removed — the verdict only needs raw metrics (distance, duration, pace, HR) which are always present.

**`PlanVerdictResponse` field notes:**
| Field | Type | Notes |
|---|---|---|
| `verdict_short` | `string \| null` | One sentence, ≤12 words. No praise, no fluff. |
| `verdict_tag` | `string \| null` | One of: `PACED POORLY`, `ON PLAN`, `HELD THE LINE`, `FADED LATE`, `FUELING`, `RESTRAINED`, `STEADY`, `NO SHOW`. Null if extraction failed or value was out of range. |
| `tone` | `string \| null` | One of: `critical`, `good`, `neutral`. Null if extraction failed. Note: fallback sets `tone: "neutral"` (not null) when returning early (no analysis / Ollama error). |

**Errors:** 401, 404

---

### Training Plan

#### `POST /plan/generate`
> Status: ✅ v2 — implemented 2026-04-19 (TASK-108: user_preferences injected into plan prompt)
> Updated: 2026-04-25 (TASK-147: `target` field added to each `PlanDay`)
> Updated: 2026-05-15 (TASK-189) — converted to SSE streaming
> Updated: 2026-05-16 (TASK-201-A2 + TASK-201-A3) — week-aware prompt directive; complete event now includes `is_next_week` and `target_week_reason`

Generates a new 7-day plan. Streams progress events as each stage runs, then a complete event
containing the full plan. Deactivates prior active plan before emitting complete. Rate limited: shared 20 req/60s.

**Auth:** Required.

**Logic (staged, each stage emits a progress event before its work):**
1. `"Reading your last four weeks"` — fetch last 4 weeks of activities, build Strava context
2. `"Checking plan adherence"` — fetch prior plan, compute adherence signal
3. `"Assembling coaching signals"` — build weekly breakdown, RPE trend, zone distribution
4. `"Drafting the plan"` — resolve target week via `_resolve_target_week_start`, build week-aware prompt directive, call Ollama
5. `"Filing"` — parse JSON response, deactivate old plans, create new `TrainingPlan` in DB

On success: persists a new `TrainingPlan` row and emits a complete event.
On any failure: emits an error event (no DB write for the new plan).

**Response: `text/event-stream`**

Progress event (emitted before each stage begins):
```json
{"type": "progress", "step": "<label>", "elapsed_ms": 120}
```

Complete event (emitted after all stages succeed):
```json
{
  "type": "complete",
  "data": {
    "plan": {
      "id": 1,
      "user_id": 1,
      "week_start_date": "2026-04-14",
      "is_active": true,
      "plan_data": {
        "monday": {
          "type": "easy",
          "description": "40 min easy. HR under 145. No watch-checking.",
          "duration_minutes": 40,
          "target": "40 min, HR ≤ 145 bpm"
        }
      },
      "pak_har_notes": {
        "week_summary": "Your last four weeks show 3 runs per week average.",
        "monday": "Start slow."
      },
      "created_at": "2026-04-17T09:00:00",
      "updated_at": "2026-04-17T09:00:00"
    },
    "is_next_week": false,
    "target_week_reason": "current_week"
  }
}
```

Error event (emitted on any exception):
```json
{"type": "error", "message": "Pak Har is unavailable right now. Make sure Ollama is running."}
```

**`PlanDay` object (one entry inside `plan_data`):**
| Field | Type | Notes |
|---|---|---|
| `type` | `string` | One of: `easy`, `tempo`, `long`, `rest`, `cross` |
| `description` | `string` | Full coaching instruction for the day |
| `duration_minutes` | `integer` | 0 for rest days |
| `target` | `string \| null` | Short measurable target ≤10 words. Running: distance or duration + key constraint (e.g. `"8 km easy"`, `"40 min, HR ≤ 145 bpm"`). Rest: `"Rest completely"`. Cross-training: `"30 min low-impact, no running"`. Null on plans generated before TASK-147. |

**Complete event `data` field notes (TASK-201-A3):**
| Field | Type | Notes |
|---|---|---|
| `plan` | `object` | Full serialised `TrainingPlan` row (same shape as `GET /plan/current`). |
| `is_next_week` | `boolean` | `true` when the generated plan targets the week after the current calendar Monday. `false` when it targets this week. |
| `target_week_reason` | `string` | One of `"current_week"`, `"weekend"`, `"already_ran_this_week"`. See reason definitions under `GET /plan/next-target`. |

**Progress event `step` labels (in order):**
1. `"Reading your last four weeks"`
2. `"Checking plan adherence"`
3. `"Assembling coaching signals"`
4. `"Drafting the plan"`
5. `"Filing"`

**Pre-stream errors (HTTP error codes, no SSE body):**
- `401` — Not authenticated
- `429` — Rate limit exceeded

**In-stream errors (HTTP 200, error event in stream body):**
- Ollama unreachable → error event with `"Pak Har is unavailable..."` message
- Ollama read timeout → error event with `"Pak Har took too long..."` message
- Malformed JSON response → error event with parse error message

⚠️ **Frontend note (TASK-189):** Response shape changed from `application/json` (`TrainingPlanRead`) to `text/event-stream`. Read the stream for progress/complete/error events. The plan is in `complete.data.plan` (not the response body directly). No need to call `GET /plan/current` after — plan is in the complete event.

⚠️ **Frontend note (TASK-201-A3):** `complete.data` now also includes `is_next_week` (bool) and `target_week_reason` (string). Use these to update any week-label UI after a successful generation without calling `GET /plan/next-target` again.

---

#### `GET /plan/next-target`
> Status: ✅ v2 (TASK-201-A3) — implemented 2026-05-16

Lightweight pre-generation preview endpoint. Returns the week that would be targeted if the user generates a plan right now, using the same resolution logic as `POST /plan/generate`. No Ollama call. No rate limiting.

Frontend calls this on mount (and after activity list invalidation) to display the correct button label and caption before the user commits to generating a plan.

**Auth:** Required.

**Request:** No body. Auth cookie only.

**Response (200):**
```json
{
  "week_start_date": "2026-05-18",
  "is_next_week": true,
  "reason": "already_ran_this_week",
  "replaces_active_plan": true
}
```

**Response field notes:**
| Field | Type | Notes |
|---|---|---|
| `week_start_date` | `string` | ISO date (`YYYY-MM-DD`). Always a Monday. |
| `is_next_week` | `boolean` | `true` when `week_start_date` is later than the current calendar Monday. |
| `reason` | `string` | Why this week was chosen. See table below. |
| `replaces_active_plan` | `boolean` | `true` when an active `TrainingPlan` row exists with `week_start_date` equal to the resolved week. Generating a plan would deactivate that existing plan. Frontend should show a replace-confirmation modal when this is `true`. |

**`reason` values:**
| Value | Trigger condition |
|---|---|
| `"current_week"` | Mon–Fri, no synced runs yet this week. Plan targets the current Monday. |
| `"weekend"` | Today is Saturday or Sunday. Plan always targets next Monday. |
| `"already_ran_this_week"` | Mon–Fri, at least one synced activity exists with `activity_date >= this_monday`. Plan targets next Monday. |

**Errors:** 401

---

#### `GET /plan/current`
> Status: ✅ v1
> Updated: 2026-04-25 (TASK-147: `plan_data` entries now include `target: string | null`)

Returns the most recently generated active plan. DB lookup only.

**Auth:** Required.

**Response (200):** `TrainingPlanRead` — same shape as `POST /plan/generate` above. `plan_data[day].target` is `null` on plans generated before TASK-147.

**Errors:** 401, 404

---

#### `GET /plan/list`
> Status: ✅ v2 (feat/v2-finalization) — implemented 2026-05-31

Returns all training plans for the current user, newest first. DB lookup only — no Ollama call.

**Auth:** Required.

**Request:** No body. Auth cookie only.

**Response (200):** Array of `TrainingPlanRead` objects, ordered by `week_start_date` descending. Returns an empty array if the user has no plans.

```json
[
  {
    "id": 3,
    "user_id": 1,
    "week_start_date": "2026-05-25",
    "plan_data": { "monday": { "type": "easy", "description": "...", "duration_minutes": 40, "target": "40 min, HR ≤ 145 bpm" } },
    "pak_har_notes": { "week_summary": "...", "monday": "..." },
    "is_active": true,
    "created_at": "2026-05-25T09:00:00",
    "updated_at": "2026-05-25T09:00:00"
  }
]
```

**Errors:** 401

---

#### `GET /plan/{plan_id}`
> Status: ✅ v2 (feat/v2-finalization) — implemented 2026-05-31

Returns a single training plan by primary key. Ownership-guarded — returns 404 if the plan does not exist or belongs to a different user.

**Auth:** Required.

**Path param:** `plan_id` — integer primary key of the `TrainingPlan` row.

**Response (200):** Single `TrainingPlanRead` object (same shape as `GET /plan/current`).

**Errors:**
- `401` — Not authenticated
- `404` — Plan not found or belongs to a different user

---

#### `DELETE /plan/{plan_id}`
> Status: ✅ v2 (feat/v2-finalization) — implemented 2026-05-31

Permanently deletes a training plan by primary key. Ownership-guarded — returns 404 if the plan does not exist or belongs to a different user. Idempotent per-user: calling it twice returns 404 on the second call (row is gone).

**Auth:** Required.

**Path param:** `plan_id` — integer primary key of the `TrainingPlan` row.

**Request body:** None.

**Response (204):** No content.

**Errors:**
- `401` — Not authenticated
- `404` — Plan not found or belongs to a different user

---

### Weekly Review

#### `POST /review/generate`
> Status: ✅ v2 (TASK-105) — implemented 2026-04-24
> Updated: 2026-05-15 (TASK-186) — converted to SSE streaming

Generate Pak Har's weekly review — compares planned vs actual runs for the current week. Always inserts a new `WeeklyReview` row on success; `GET /review/current` returns the most recent. Rate limited: shared 20 req/60s.

**Auth:** Required.

**Logic (staged, each stage emits a progress event before its work):**
1. `"Counting this week's runs"` — determines week Monday, fetches active `TrainingPlan`, counts `Activity` records (sync_status=synced) from Monday through today.
2. `"Reading your zone breakdown"` — builds HR zone distribution from per-km splits.
3. `"Checking last week"` — fetches prior week run count, total km, avg pace for comparison.
4. `"Writing the assessment"` — formats `REVIEW_PROMPT` and calls Ollama (non-streaming, long). This is the slowest stage.
5. `"Filing the headline"` — second Ollama call extracts `headline`, `verdict_tag`, `tone` from the assessment text. Best-effort; if Ollama returns malformed JSON or out-of-range values all three fields are null.

On success: persists a new `WeeklyReview` row and emits a complete event.
On any failure: emits an error event (no DB write).

**Response: `text/event-stream`**

Progress event (emitted before each stage begins):
```json
{"type": "progress", "step": "<label>", "elapsed_ms": 120}
```

Complete event (emitted after all stages succeed):
```json
{
  "type": "complete",
  "data": {
    "text": "You planned 4 runs and did 2. Three weeks in a row at 50% means the plan is wrong, not you. Next week drops to 3 runs. Do all 3.",
    "headline": "Fifty percent for three straight weeks.",
    "verdict_tag": "MISSED RUNS",
    "tone": "critical"
  }
}
```

Error event (emitted on any exception):
```json
{"type": "error", "message": "Pak Har is unavailable right now. Make sure Ollama is running."}
```

**Complete event `data` field notes:**
| Field | Type | Notes |
|---|---|---|
| `text` | `string` | Full Pak Har review text. Always present on success. |
| `headline` | `string \| null` | One sentence, ≤12 words. Null if extraction failed. |
| `verdict_tag` | `string \| null` | One of: `STRONG WEEK`, `ON PLAN`, `BUILDING`, `LIGHT WEEK`, `FADING`, `MISSED RUNS`, `CONSISTENT`, `NO RUNS`. Null if extraction failed. |
| `tone` | `string \| null` | One of: `critical`, `good`, `neutral`. Null if extraction failed. |

**Progress event `step` labels (in order):**
1. `"Counting this week's runs"`
2. `"Reading your zone breakdown"`
3. `"Checking last week"`
4. `"Writing the assessment"`
5. `"Filing the headline"`

**Pre-stream errors (HTTP error codes, no SSE body):**
- `401` — Not authenticated
- `429` — Rate limit exceeded

**In-stream errors (HTTP 200, error event in stream body):**
- Ollama unreachable or returned empty content → error event with `"Pak Har is unavailable..."` message
- Ollama read timeout → error event with `"Pak Har took too long..."` message

⚠️ **Frontend note (TASK-186):** Response shape changed from `application/json` (`WeeklyReviewRead`) to `text/event-stream`. Read the stream for progress/complete/error events. The `WeeklyReview` DB row is still created — call `GET /review/current` after receiving the complete event to get the persisted record with its `id`.

---

#### `GET /review/current`
> Status: ✅ v2 (TASK-105) — implemented 2026-04-24

Returns the most recent weekly review (ordered by `created_at DESC`). DB lookup only — no Ollama call.

**Auth:** Required.

**Response (200):** `WeeklyReviewRead` object (same shape as above).

**Errors:**
- `401` — Not authenticated
- `404` — No weekly review found for this user

---

### Insights

#### `GET /insights`
> Status: ✅ v2 (TASK-106) — implemented 2026-04-24

Aggregated trend stats and Pak Har's multi-week commentary. Analyses the last 6 weeks (42 days) of synced activity. Requires at least 2 distinct ISO calendar weeks of data.

**Auth:** Required.

**Response (200) — `InsightsRead` schema:**
```json
{
  "weeks_analyzed": 6,
  "avg_weekly_km": 24.5,
  "avg_pace_min_per_km": 5.82,
  "pace_trend": "declining",
  "consistency_pct": 62,
  "pak_har_commentary": "Your pace has dropped 15 seconds per km over 6 weeks. That's fatigue, not fitness. Drop one run per week for two weeks and let your body catch up.",
  "generated_at": "2026-04-18T00:00:00"
}
```

**Field notes:**
- `pace_trend` — `"improving"` | `"declining"` | `"stable"` (3 s/km threshold; first vs second chronological half of the window)
- `consistency_pct` — (weeks with ≥ 1 run / 6) × 100, integer
- `generated_at` — UTC timestamp of generation

**Errors:**
- 401: Not authenticated
- 404: `"Not enough data for insights. Keep running."` (fewer than 2 distinct weeks with synced activity)
- 503: Ollama unreachable
- 504: Ollama timeout

---

### Coach

#### `POST /coach/chat`
> Status: ✅ v1

Send a message to Pak Har. Returns Server-Sent Events stream. Rate limited: 20 req/60s.

**Auth:** Required.

**Request:** `{ "message": "Why am I getting slower?" }`

**Response:** `text/event-stream` — `data: <chunk>` lines, terminated with `data: [DONE]`

**Error events (in-stream):** `data: [ERROR] Pak Har is unavailable right now.`

**Pre-stream errors:** 401, 422, 429

#### `DELETE /coach/history`
> Status: ✅ v2 — implemented 2026-04-26

Wipe all chat messages for the currently authenticated user. Idempotent — returns 200 even if there is no history.

**Auth:** Required.

**Request body:** None.

**Response (200):** `{ "message": "History cleared" }`

**Errors:** 401

---

#### `DELETE /coach/reset`
> Status: ✅ v2 (TASK-152) — implemented 2026-04-26

Full AI context reset for the currently authenticated user. Wipes all AI-generated content in a single transaction. Idempotent — safe to call multiple times; returns 200 even when there is nothing to delete.

**What is deleted/cleared:**
| Table | Action |
|---|---|
| `chat_messages` | All rows for the user deleted |
| `training_plans` | All rows for the user deleted |
| `weekly_reviews` | All rows for the user deleted |
| `activities` | Rows **retained** — only `analysis`, `analysis_generated_at`, `verdict_short`, `verdict_tag`, `tone` are set to `null`. Strava data is preserved. |

**Auth:** Required.

**Request body:** None.

**Response (200):** `{ "message": "Context reset" }`

**Errors:** 401

---

### Strava Webhooks

#### `GET /strava/webhook`
> Status: ✅ v2 (T8) — implemented 2026-05-31

One-time subscription verification handshake. Strava sends this GET when you register a webhook subscription via the Strava API. Not called by the frontend.

**Query params (all required, sent by Strava):**
| Param | Type | Notes |
|---|---|---|
| `hub.mode` | string | Always `"subscribe"` |
| `hub.verify_token` | string | Must match `STRAVA_WEBHOOK_VERIFY_TOKEN` env var |
| `hub.challenge` | string | Random string Strava expects echoed back |

**Response (200):**
```json
{ "hub.challenge": "<value>" }
```

**Errors:**
- `403` — `hub.verify_token` does not match `STRAVA_WEBHOOK_VERIFY_TOKEN`
- `422` — Missing required query params

**Dev mode:** When `STRAVA_WEBHOOK_VERIFY_TOKEN` is empty, any token is accepted and a warning is logged.

---

#### `POST /strava/webhook`
> Status: ✅ v2 (T8) — implemented 2026-05-31

Real-time activity event delivery from Strava. Strava POSTs here when activities are created, updated, or deleted on a connected athlete's account.

**This endpoint is not called by the frontend.** It is a server-to-server webhook from Strava.

**Request headers:**
| Header | Notes |
|---|---|
| `X-Hub-Signature` | `sha256=<HMAC-SHA256 of body using STRAVA_WEBHOOK_VERIFY_TOKEN>`. Required when the token is configured. |

**Request body (from Strava):**
```json
{
  "object_type": "activity",
  "aspect_type": "create",
  "owner_id": 112542884,
  "object_id": 9876543210
}
```

**Behaviour:**
- Only `{"object_type": "activity", "aspect_type": "create"}` events trigger a sync. All other events return 200 immediately with no action.
- User is looked up by `owner_id` (Strava athlete ID). Unknown athletes return 200 with no action.
- On a matched activity-create event, `sync_activities()` + auto-analysis runs non-blocking via `asyncio.create_task()`. Response is returned before the sync completes.

**Response (200):** `{"status": "ok"}` — always, for all accepted events.

**Errors:**
- `403` — Missing or invalid `X-Hub-Signature` (only when `STRAVA_WEBHOOK_VERIFY_TOKEN` is configured)

**Dev mode:** When `STRAVA_WEBHOOK_VERIFY_TOKEN` is empty, signature validation is skipped and a warning is logged.

**Setup note:** To register a webhook subscription with Strava (one-time, per deployment):
```
POST https://www.strava.com/api/v3/push_subscriptions
  client_id=<STRAVA_CLIENT_ID>
  client_secret=<STRAVA_CLIENT_SECRET>
  callback_url=https://<your-domain>/strava/webhook
  verify_token=<STRAVA_WEBHOOK_VERIFY_TOKEN>
```

---

## Frontend Requests
*Frontend agent adds requests here when they need a new endpoint or change to an existing one.*
