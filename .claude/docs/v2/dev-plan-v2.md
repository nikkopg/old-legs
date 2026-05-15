# Old Legs — Development Plan v2

## Current Sprint
**Sprint 3 — resumed 2026-05-03**

Scope expanded: full tabloid redesign of all remaining pages added as Phase 2F (dashboard, plan, chat, settings, landing). TASK-133 + Phase 2F UX tasks can run in parallel.

**2026-05-03 — Reading Light (dark mode) shipped.** Full theme system implemented across all tabloid pages. CSS custom property approach: `:root` defines light palette, `:root[data-theme="dark"]` overrides to tobacco-brown paper (`#1a1410`) with warm cream ink (`#ece2cc`) and kindled-orange accent (`#d97a4a`). `OL` token object in `NewspaperChrome.tsx` now references CSS vars — cascades theme-awareness through every component that uses `OL.*`. `useTheme` hook (`src/hooks/useTheme.ts`) reads/writes `localStorage.theme` and toggles `data-theme` on `<html>`. SSR init script in `layout.tsx` sets `data-theme` before React hydrates to prevent white-flash for dark users. Toggle exposed in Settings → The Desk → Reading Light (On/Off cards). All 11 redesign components retrofitted to CSS vars: `ToneBadge`, `FrontPage`, `Dispatch`, `ChatPaper`, `DashboardPaper`, `PlanPaper`, `LandingPage`, `OfflinePage`, `PageLoadingSkeleton`, `ThinkingPage`, `SettingsPaper`. One bug caught and fixed post-implementation: drop-in `Dispatch.tsx` had the pace chart Y-axis inverted (`chartY1 -` instead of `chartY0 +` for `yPace`, and reversed `yOverlay`) — restored to original formulas. One stray hardcoded `#f4efe4`/`#141210` in `activities/[id]/page.tsx` error state also fixed.

**2026-05-03 — Pace chart with toggleable overlays shipped.** Replaced hardcoded "PACE PER KILOMETRE" placeholder in `Dispatch.tsx` with a real inline SVG line chart. Pace line always shown (inverted Y-axis — faster = higher). Three toggleable overlays (HR, ELEVATION, CADENCE) rendered as dashed accent lines, one active at a time, normalised to their own min/max range, broken at null values. Average pace reference line. Toggle buttons disabled when metric is entirely null across all splits. UX design decision to remove the chart (2026-05-03) was reversed on product owner confirmation — chart and splits table serve different cognitive purposes (shape vs numbers). See `ux-notes.md` TASK-130 for full spec.

**2026-05-03 — Branch clean.** Git divergence resolved: remote commit `ea3527a` (activities refresh bug + WIP SQA tests) rebased with two local commits (`fa86f07` PageLoadingSkeleton, `0fd4000` splits). Splits work (TASK-161–164) now committed and pushed. `architecture-docs.html` left untracked (generated file, not committed).

**2026-05-01 — TAP REFRESH bug fixed.** Open issue from TASK-161–164 session resolved. See note inline below.

**2026-05-02 — QA wave started.** All four QA tasks fired in parallel. TASK-121, TASK-123, TASK-124 complete. TASK-122 partially complete (3/5 test files written — OfflinePage and FrontPage tests still needed).

**2026-05-02 — QA findings:**
- BUG-002 (High): `plan-verdict` inline system prompt has no voice rules — `verdict_short` is user-visible; fix: add condensed Pak Har voice rules matching `services/review.py` pattern. See `voice-bugs-draft.md`.
- BUG-010 (Medium): `GET /insights` calls Ollama without `check_rate_limit()` — every other Ollama endpoint is rate-limited. See `security-bugs-draft.md`.
- Dead import in `services/insights.py`: `SYSTEM_PROMPT` imported but unused.

**2026-05-03 — Session complete.** All queued items resolved:
- ~~Merge `voice-bugs-draft.md` + `security-bugs-draft.md` into `bugs-v2.md`~~ — done
- ~~TASK-122: `OfflinePage.test.tsx` + `FrontPage.test.tsx`~~ — done. 54/54 new tests passing (21 OfflinePage, 33 FrontPage)
- ~~BUG-002: plan-verdict system prompt voice rules~~ — fixed (`activities.py` lines 647–653)
- ~~BUG-010: `GET /insights` missing rate limit~~ — fixed (`insights.py` line 89)
- ~~Dead import `SYSTEM_PROMPT` in `services/insights.py`~~ — removed

**2026-05-03 — Full test suite run: 91 backend passed, 7 pre-existing failures (not caused by this session):**
- BUG-011 (Low): `test_activities.py` assertions stale against paginated response shape — pre-existing since TASK-107
- BUG-012 (Low): Rate limiter not reset between tests — 4 tests fail due to ordering (all pass in isolation)
- `NewspaperChrome.test.tsx` `·` character matcher — pre-existing frontend test failure (1 test)

**2026-05-03 — Bug fixes complete. Full suite green.**
- ~~BUG-011~~: `test_activities.py` assertions updated for paginated shape — fixed
- ~~BUG-012~~: `reset_rate_limiter` autouse fixture added to `conftest.py` — fixed
- `NewspaperChrome.test.tsx` `·` matcher: missing `nav` prop + `§ ` prefix — fixed
- Backend: 98/98 passed. Frontend: 101/101 passed.

**Sprint 3 complete.** No open bugs. No failing tests.

**2026-05-03 — Phase 2I started: Strava Streams.** TASK-165 and TASK-166 shipped. TASK-167 is next (frontend types + api-spec). TASK-168–170 unblock after TASK-167.

**2026-05-03 — TASK-134 + TASK-135 shipped.** HR zones visualization live on the Dispatch page.
- TASK-134: effectively already complete via TASK-161–164. Per-km splits are fetched from `splits_metric` (not the streams API) and `moving_time` is stored per split — sufficient for time-in-zone calculation without the full streams endpoint. Marked done.
- TASK-135: `computeHrZones()` helper computes time-in-zone from per-km splits using user max HR (5 zones, Z1 <60% → Z5 ≥90% of max HR; time weighted by `moving_time` per split). Five-bar visualization in the Dispatch right column — Z4/Z5 bars in accent, Z1–Z3 in ink. Three fallback states: no splits data, no max HR set (prompts user to Settings), no HR values in splits. `movingTime` field added to `DispatchSplit`; `userMaxHr` prop added to `DispatchProps`; `useUser` hook wired into `activities/[id]/page.tsx` to pass `user.max_hr`. Frontend review (CodeRabbit) caught two bugs post-commit: dead `HR_ZONE_THRESHOLDS` constant (never used in computation — maintenance trap) and no guard on `maxHr <= 0` (would silently produce all-Z5 output). Both fixed in follow-up commit. 101/101 frontend tests passing.

**2026-04-25 — Phase 2F wiring complete.** All five remaining pages (dashboard, plan, coach, settings, landing) wired to API data and redesign components. Sprint 3 page integration is done. The following polish fixes were applied as part of the wiring pass (no separate task IDs):
- All pages updated to fill full viewport — parchment background, no dark outer frame
- `FrontPage` and `Dispatch` components given `NewspaperChrome` nav tabs + `onNav` wiring
- `FrontPage` switched to `big={false}` compact masthead (only Dashboard uses `big={true}`)
- 3 blocking bugs fixed: `OfflinePage` missing required props on plan page, dashboard null-string coercion, coach page 401 redirect

**2026-04-25 — TASK-147 complete.** `target` field added to `PlanDay` schema + plan generation prompt. TASK-148 (frontend table redesign) now unblocked.

**2026-04-26 — Phase 2G complete + 3 bug fixes.** Activity date timezone bug fixed (`start_date_local`), sync upsert applied, refresh button wired to `refetch`. TASK-147–150 all shipped. QA (121–124) now unblocked.

**2026-04-26 — TASK-161–164 complete: per-km splits on activity detail (partial).** Added `splits` JSON column to Activity model + Alembic migration (`c3d4e5f6a7b8`). Strava sync pipeline extended with a second pass: after each sync batch, fetches `splits_metric` from Strava's `GET /activities/{id}` detail endpoint for any touched activity where `splits IS NULL`, storing a cleaned list of per-km dicts (`km`, `moving_time`, `distance`, `avg_speed_ms`, `hr`, `cad`, `elev`). Capped at 10 fetches per sync (newest-first) to avoid Strava rate limits and HTTP timeouts — historical activities backfill gradually across subsequent syncs. `splits` exposed in `ActivityRead` schema. Frontend (`activities/[id]/page.tsx`) maps splits to `DispatchSplit[]` using `formatPace(1000 / (avg_speed_ms × 60))` for pace and `cad × 2` for bilateral cadence; falls back to `undefined` (shows placeholder) when splits are null. Alembic multiple-heads incident: agent set `down_revision` to wrong ancestor; fixed by updating the migration file and manually removing the stale duplicate row from `alembic_version`.
- **Known open issue resolved 2026-05-01:** "TAP REFRESH FOR LATEST" button fix shipped. Root cause: (1) `lastSyncedAt` was hardcoded to `null` so the notice never updated after sync; (2) `refetchOnWindowFocus` was not disabled, causing silent background refetches that shortened the visible `isFetching` window to < 200ms. Fix: `useState<string | null>` tracks last sync timestamp, set in `handleRefreshSync().then()`; `refetchOnWindowFocus: false` added to `useQuery`; `lastSyncedAt` prop now receives live state instead of `null`. After clicking refresh the notice updates to "synced just now." (`apps/web/src/app/activities/page.tsx`)

**2026-04-26 — UI polish: Bandung branding + consistent loading skeletons.** All hardcoded "Jakarta" / "Senayan" references replaced with "Bandung" / "Braga" across 8 files (LandingPage, NewspaperChrome, SettingsPaper, ChatPaper, FrontPage, Dispatch, DashboardPaper, settings/page.tsx). Branding text ("Jakarta Edition", "Built in Jakarta") updated; user-contextual footer text ("Filed at Senayan · Jakarta") updated to match. Timezone IANA value unchanged (Bandung shares `Asia/Jakarta` WIB/GMT+7). `PageLoadingSkeleton` shared component created (`components/redesign/PageLoadingSkeleton.tsx`) — replaces the inconsistent plain `animate-pulse` blob on dashboard, activities, plan, settings, and activities/[id] pages with a unified newspaper-shaped skeleton (dark outer frame, paper block, masthead + content grey blocks). Activities page `OfflinePage` wiring also corrected to match other pages.

**2026-04-26 — HR zone accuracy overhaul (TASK-157–160).** Added `resting_hr`, `max_hr_observed`, and `max_hr` to User model (2 Alembic migrations). Zone calculation now uses 3-tier MHR priority: user-provided → auto-cached from activity history → derived scan → 185 fallback. `max_hr_observed` auto-updated on every Strava sync. Resting HR and Max HR fields added to onboarding modal (steps 4–5) and Runner's Brief on Desk page (2-row layout). All fields optional — existing users unaffected.

**2026-04-26 — User preferences now flow into all Pak Har prompts.** Plan generation was ignoring `days_available` and other preferences — `build_user_preferences_context()` was wired into review only. Fixed by injecting `{user_preferences}` into `ANALYSIS_PROMPT` and `SYSTEM_PROMPT`, adding the param to `stream_chat`, and updating the format calls in `plan.py`, `coach.py`, and `activities.py`. Runner's Brief section added to Desk page (TASK-156) so preferences are editable without re-running onboarding.

**2026-04-26 — User onboarding ported from feature branch + disconnect bug fixed.** TASK-154–155 complete. All onboarding functionality merged into main without overwriting tabloid redesign. One bug fixed post-ship (no task ID):
- `disconnectStrava()` was calling `DELETE /auth/strava` directly from the browser; FastAPI cannot clear a cookie it didn't set (cookie was set by Next.js server at port 3000). Fixed by adding `apps/web/src/app/api/disconnect/route.ts` — a Next.js server route that clears the cookie authoritatively before forwarding the backend call.

**2026-04-26 — Context reset feature shipped.** TASK-151–153 complete. Two bug fixes applied post-ship (no task IDs):
- Full reset not clearing plan visually — `invalidateQueries` was serving stale cache while refetching; switched to `removeQueries` in `settings/page.tsx` so cache is wiped entirely before redirect
- Plan realization column only showing one session per day — `activities.find()` replaced with `activities.filter()` + aggregation; multi-session days now sum distance and duration, using longest run as primary for plan-verdict

**2026-04-25 — TASK-133 complete + bug fixes.** Verdict fields (`verdict_short`, `verdict_tag`, `tone`) added to Activity model, Alembic migration, analysis endpoint (second Ollama call, non-streaming, with fallback), and `ActivityRead` schema. Two bugs fixed: `Dispatch` missing analyze button; `FrontPage` lead headline was all-caps. QA (121–124) is now unblocked.

---

## v1 Summary (completed — do not re-implement)

All 31 tasks shipped and verified. Key deliverables:
- Strava OAuth + token encryption (Fernet)
- Activity sync pipeline (last 90 days, auto-refresh on dashboard load)
- Post-run analysis via Ollama (stored per activity)
- Weekly 7-day training plan generation + display
- Pak Har chat (streaming SSE, rate-limited 20 req/60s, history persisted)
- Full test suite: 51/51 backend, 28/28 E2E, 18/18 frontend unit
- Docker Compose self-hosting with auto model pull

DB models in place: `User`, `Activity`, `TrainingPlan`, `ChatMessage`
Endpoints in place: `/auth/*`, `/activities`, `/activities/{id}/analyze`, `/plan/*`, `/coach/chat`

---

## Task Board

### 🔄 In Progress
- None

---

### ✅ Phase 2J — SSE Progress Streaming Infrastructure (completed 2026-05-15)

**TASK-190: SSE progress strip for activity analysis**
- `run_analysis_for_activity()` in `services/coach.py` converted to `AsyncGenerator[str, None]` — 5 real steps: pulling splits → reading zones → checking history → writing dispatch → filing verdict
- `POST /activities/{id}/analyze` returns `StreamingResponse`; rate limit + ownership guard still fire pre-stream
- Frontend: `useProgressStream<AnalysisStreamComplete>` replaces `analyzeActivity` mutation in `activities/[id]/page.tsx`; `AnalysisProgressStrip` added to `Dispatch.tsx` matching the same ·/›/✓ + elapsed timer pattern
- `effectiveActivity` merges streamed data immediately — no refetch latency
- 12 new tests in `TestAnalyzeActivity`; 155/155 backend, 150/150 frontend passing

---

> Goal: replace blocking JSON responses with real SSE progress streams for long-running Ollama calls (review, plan, analysis). Build the infrastructure once, apply everywhere. Reference implementation: `/coach/chat` already does SSE — reuse that pattern.

**Build sequence: TASK-185 → TASK-186 → TASK-187 → TASK-188 → TASK-189 (188 + 189 unblock together after 186 + 187)**

- [x] **TASK-185: Backend SSE progress helper** → Backend
  - Create `apps/api/services/streaming.py`
  - Define standard event format: `{"type": "progress", "step": "<label>", "elapsed_ms": <int>}`, `{"type": "complete", "data": {...}}`, `{"type": "error", "message": "<str>"}`
  - Helper functions: `progress_event(step: str, started_at: float) -> str`, `complete_event(data: dict) -> str`, `error_event(msg: str) -> str` — each returns a properly formatted SSE string (`data: ...\n\n`)
  - No Ollama calls, no DB queries — pure formatting utility
  - Unit-testable in isolation
  - Update `api-spec-v2.md`: document standard SSE event shape used across all streaming endpoints

- [x] **TASK-186: Convert `POST /review/generate` to SSE** → Backend
  - Depends on TASK-185
  - Refactor `generate_weekly_review()` in `services/review.py` into an async generator that yields SSE strings between real stages
  - Real steps (in order): `Counting this week's runs`, `Reading your zone breakdown`, `Checking last week`, `Writing the assessment`, `Filing the headline`
  - Each `yield progress_event(step, started_at)` fires before the work for that step begins
  - After all steps: `yield complete_event({"text": ..., "headline": ..., "verdict_tag": ..., "tone": ...})`
  - On any exception: `yield error_event(str(exc))` then return
  - `POST /review/generate` router updated to return `StreamingResponse(media_type="text/event-stream")`
  - Frontend currently calls this endpoint and reads JSON — update `api-spec-v2.md` to document the new SSE response shape

- [x] **TASK-187: `useProgressStream` hook** → Frontend
  - Depends on TASK-186 (needs real endpoint to test against)
  - Create `apps/web/src/hooks/useProgressStream.ts` — reusable hook for any SSE progress endpoint
  - Interface:
    ```ts
    type ProgressStep = { label: string; status: 'pending' | 'running' | 'done' }
    useProgressStream<T>(url: string, options: { steps: string[]; onComplete: (data: T) => void; onError: (msg: string) => void })
    → { steps: ProgressStep[]; elapsedMs: number; isStreaming: boolean; trigger: () => void }
    ```
  - `trigger()` opens the SSE connection (POST to the given URL)
  - `elapsedMs` ticks every 100ms while `isStreaming` is true
  - Maps incoming `progress` events to step status updates
  - Calls `onComplete` when `complete` event arrives; calls `onError` on `error` event or connection failure
  - Self-contained: manages its own `EventSource` / `fetch` + `ReadableStream` lifecycle

- [x] **TASK-188: Dashboard review progress UI** → Frontend
  - Depends on TASK-187
  - Replace the "Filing..." text link in `dashboard/page.tsx` + `DashboardPaper.tsx` with an inline progress strip using `useProgressStream`
  - Steps displayed in Today's Lead section (where review lives): each step on its own line, `›` active indicator, `✓` done, pending steps dimmed
  - Elapsed time in Space Mono ticking up in the top-right of the strip (`0:04`, `0:08`...)
  - On complete: fade out progress strip, render review prose — no page reload needed (data passed via `onComplete` callback)
  - On error: show inline error in accent, retry link
  - Consistent with `ThinkingPage` visual language (same `ol-cursor`, same `OL.*` tokens) but inline, not full-page

- [x] **TASK-189: Convert `POST /plan/generate` to SSE + wire UI** → Backend + Frontend
  - Depends on TASK-185, TASK-187
  - Backend: same SSE pattern as TASK-186 applied to `generate_plan_with_ollama()` in `services/plan.py`
  - Real steps: `Reading your last four weeks`, `Checking plan adherence`, `Assembling coaching signals`, `Drafting the plan`, `Filing`
  - Router returns `StreamingResponse`; final `complete` event carries the full plan JSON
  - Frontend: wire `useProgressStream` into `plan/page.tsx` — replace "Filing..." button state with inline step progress in the plan page header area
  - Update `api-spec-v2.md`

---

### ✅ Done (2026-05-15 — Streaming text in prose area + unified progress strip)

**TASK-192: Unify analysis progress strip in activity dispatch**
- Two different progress UIs were shown during analysis — a bordered step list before tokens arrived, then a compact horizontal inline strip once streaming started
- Root cause: when streamed text was moved to the prose area, a second "compact" strip was added inline — two different visual languages for the same operation
- Fixed: compact inline strip removed entirely; `AnalysisProgressStrip` (bordered box) used throughout
- Streamed text renders above it in the prose area regardless of state — no layout jump mid-stream
- Dead code in the regenerate button area removed (`isAnalyzing` check that could never be true in that branch)
- 154/154 frontend tests passing

**TASK-194: Stream Stage 5 headline and verdict_short tokens to frontend**
- Backend: Stage 5 in `review.py` and `coach.py` now outputs labeled plain text instead of JSON — headline/verdict_short first, then `TAG:` and `TONE:` lines. Yields `token_event()` per chunk. Parsing switches from `json.loads()` to line-splitting on `TAG:`/`TONE:` markers; all validation guards and fallbacks preserved.
- Frontend: `useProgressStream` gains `stage5StreamedText` — tokens arriving while the last step is "running" route there instead of `streamedText`. `DashboardPaper` renders streaming headline in Abril Fatface 36px with `_` cursor during "Filing the headline". `Dispatch` renders streaming `verdict_short` below the sign-off line during "Filing the verdict".
- 157/157 backend, 154/154 frontend tests passing

**TASK-193: Stream weekly review text into prose area on dashboard**
- Backend: `generate_weekly_review()` Stage 4 ("Writing the assessment") converted from blocking `stream=False` Ollama call to streaming — yields `token_event(content)` per chunk, assembles `review_text` from chunks
- Stage 5 ("Filing the headline") also converted to streaming (`stream=True` + `aiter_lines()` loop, `verdict_chunks` collected, no `token_event` — output is JSON, not user-facing prose); adds `logger.warning` on `JSONDecodeError` and explicit `ConnectError`/`ReadTimeout` handlers to match Stage 4
- Frontend: `reviewStreamedText` prop added to `DashboardPaper`; wired from `useProgressStream` in `dashboard/page.tsx`
- Both "review exists" and "no review yet" branches now render streamed text in the prose area with `ReviewProgressStrip` below — same pattern as activity dispatch
- "Filing the headline..." indicator appears on last streamed paragraph when that step starts
- Old review prose hidden during a refresh stream (replaced by streamed text)
- 157/157 backend, 154/154 frontend tests passing

---

### ✅ Done (2026-05-15 — UI polish: remove activity dispatch pull-quote)

**TASK-191: Remove pull-quote from activity dispatch**
- `getPullQuote()` function removed from `Dispatch.tsx` — was extracting an orange highlighted sentence from Pak Har's analysis text
- `pullQuote` variable and rendering block removed (the orange sentence below the dispatch prose)
- Rationale: added visual noise, no clear purpose alongside the existing verdict tag
- 154/154 frontend tests passing

---

### ✅ Done (2026-05-15 — Pak Har chat context + response calibration)

**Chat intent classification:**
- `SYSTEM_PROMPT` in `apps/api/prompts/pak_har.py` updated with an intent classification block placed before the 4-step coaching template
- Three categories defined: factual questions (1–2 sentence answer, stop — no pattern analysis, no next steps), coaching/advice requests (full 4-step template), unclear intent (answer first, offer to go deeper in one line)
- 5 few-shot examples anchor the behaviour (3 factual, 2 coaching)
- 4-step template heading changed from "When responding to a runner" → "When responding to a COACHING or ADVICE request (and only then)"

**RHR and MHR injected into chat context:**
- `build_user_preferences_context()` in `services/ollama.py` now appends resting HR and max HR when set
- Max HR follows 3-tier priority: user-set → observed → omitted. Source shown in parentheses (`user-set` / `observed`)
- Fixes a gap where Pak Har knew HR zones but not the user's configured RHR/MHR in chat

**Training plan injected into chat context:**
- `build_plan_context(user, db)` added to `services/ollama.py` — queries most recent active `TrainingPlan`, formats each day (type, description, target) as compact plain text
- `stream_chat()` signature updated to accept `plan_context: str`
- `SYSTEM_PROMPT` updated with `{plan_context}` placeholder + instruction to answer plan questions from it
- `routers/coach.py` updated to call `build_plan_context` and pass result to `stream_chat`
- Pak Har can now answer "what am I supposed to run today?" with actual plan data
- 137/137 backend tests passing

---

### ✅ Done (2026-05-14 — Dashboard scoreboard redesign + layout fix)

- Fixed column alignment: scoreboard and progress bar moved out of left article into full-width section below the two-column grid — both columns now end at roughly equal height
- Scoreboard reduced to 3 stats (was 4): **This Week** (total km), **Runs** (X / N from plan when available, X when no plan), **Time on Feet**
- Removed "Week Completion %" stat and progress bar entirely
- `GET /plan/current` query added non-blocking in `dashboard/page.tsx`; planned non-rest days counted as `plannedRuns` for the X/N display
- `heroHeadline()` fallback simplified (no longer needs `targetKm`)
- 125/125 frontend tests passing

---

### ✅ Done (2026-05-14 — Remove dashboard Op-Ed section)

- Removed "Opinion · The Arc" Op-Ed section from `DashboardPaper.tsx` (~265 lines removed)
- Removed `GET /insights` query (`insights` prop, `onOpenCoach` prop, all chart variables, `opEdHeadline()`) from `dashboard/page.tsx`
- `Insights` type retained in `types/api.ts` — still used by `InsightsSection.tsx`
- Rationale: Op-Ed overlapped with weekly review and added Ollama latency on every dashboard load
- 125/125 frontend tests passing

---

### ✅ Done (2026-05-14 — Weekly review headline + verdict tag)

- `headline`, `verdict_tag`, `tone` added to `WeeklyReview` model (migration `f4a5b6c7d8e9`)
- Weekly tag set: `STRONG WEEK | ON PLAN | BUILDING | LIGHT WEEK | FADING | MISSED RUNS | CONSISTENT | NO RUNS`
- Second non-streaming Ollama call after review text generation; failures never block the review
- Dashboard shows `ToneBadge` + Abril 36px headline above review text; old reviews degrade gracefully
- "Refresh his take →" link added below review text; "Filing..." state while generating; errors surfaced inline

---

### ✅ Done (2026-05-14 — TASK-184: Weekly review in Today's Lead)

- Dashboard "Today's Lead" now shows Pak Har's weekly review text (paragraphs, Lora 14px) with a "Filed week of X" metadata line above
- When no review exists: falls back to `heroHeadline()` formula + "No weekly assessment yet. File this week →" link that triggers `POST /review/generate`
- `['review']` query fetched non-blocking on dashboard load; invalidated on generate
- Scoreboard and all other dashboard sections unchanged

---

### ✅ Done (2026-05-14 — Settings UI polish)

**Reading Light toggle redesign:**
- Replaced two-card On/Off picker with a single toggle row matching the delivery preferences style
- Description text left, toggle right — ON (knob right, filled) = light mode, OFF (knob left, empty) = dark mode

---

### ✅ Done (2026-05-14 — Delivery preferences: persistence + scheduler)

**TASK-176 — Backend:**
- `auto_plan_enabled` + `auto_review_enabled` boolean columns on User model (migration `e2f3a4b5c6d7`, `DEFAULT true` — all existing users opted in)
- `OnboardingRequest` + `UserRead` schemas updated; `POST /user/onboarding` saves both fields
- `apscheduler>=3.10.0` added to requirements
- `apps/api/services/scheduler.py`: `AsyncIOScheduler` with two cron jobs — `weekly_plan_job` (Sun 22:00 UTC = Mon 05:00 WIB), `weekly_review_job` (Sun 13:00 UTC = Sun 20:00 WIB). Each queries users with the toggle enabled and fires generation per user, isolating per-user failures.
- `main.py` lifespan extended: `scheduler.start()` on startup, `scheduler.shutdown()` on teardown

**TASK-177 — Frontend:**
- `auto_plan_enabled: boolean` + `auto_review_enabled: boolean` added to `UserProfile` and `OnboardingRequest` types
- Settings page seeds delivery toggles from user profile (same `useEffect` pass as Runner's Brief)
- `handleToggleDelivery` is now async: optimistic flip → `saveOnboarding` with full preferences payload → silent revert on failure

**Note:** Schedule times are hardcoded (WIB/UTC+7). Per-user time zone preference deferred to a future task.

---

### ✅ Done (2026-05-14 — Auto-analysis on sync + settings cleanup)

**Auto-analysis on sync:**
- `run_analysis_for_activity(activity_id, user, db) -> bool` extracted into `services/coach.py` — full analysis pipeline (long-form Ollama call + structured verdict extraction) as a reusable service function. Swallows all exceptions, safe for background use.
- `routers/activities.py::analyze_activity` trimmed to ~40 lines; delegates core work to the service function. Retains rate limiting, auth guard, HTTP error mapping.
- `sync_activities()` in `services/strava.py` gains a third pass: after streams are fetched, newly inserted activities with `analysis IS NULL` are auto-analyzed (capped at 3 per sync, newest first). Failures are caught and logged — never break the sync.

**Settings Delivery Preferences cleanup:**
- Removed `dispatchAfterRun` toggle (behavior now always-on via auto-analysis on sync).
- Removed `missedRunNudge` toggle (requires push/email infrastructure with no implementation path).
- Two toggles remain: "Weekly plan on Monday 05:00" and "Weekly review on Sunday 20:00".

---

### ✅ Done (2026-05-14 — Plan verdict improvements)

**Plan verdict fires for all matched runs:**
- Removed vestigial guard in `POST /activities/{id}/plan-verdict` that required `activity.analysis` to be non-null. The endpoint never used the analysis text — only raw metrics (distance, duration, pace, HR). Any matched run now gets a verdict immediately.

**NO SHOW verdict for missed past days:**
- PlanPaper: non-REST plan days with no matched activity and `d.isoDate < today` now show "No run logged." + `NO SHOW` ToneBadge (critical). Today and future days still show plan notes.

**Cache cleared on plan generation:**
- `handleGenerate` now calls `queryClient.removeQueries({ queryKey: ['plan-verdict'] })` before invalidating the plan — ensures all verdict caches are wiped so fresh verdicts are fetched against the new plan's targets.

**Settings preferences seeding fix:**
- After a successful save, `['user', 'me']` cache is invalidated and `prefSeeded` is reset — ensures `available_days` (and all preferences) seed correctly on the next visit instead of seeding from stale cache.

---

### ✅ Done (2026-05-14 — Training goal, race date, weekly km reframe)

**Training goal (`goal_event`):**
- Dropdown added to onboarding modal (step 6) and Runner's Brief on Settings page. Values: `general_fitness`, `5k`, `10k`, `half_marathon`, `marathon`, `ultra`.
- Backend: `goal_event VARCHAR` column + Alembic migration (`b3c4d5e6f7a8`). `OnboardingRequest.goal_event` validated against allowed set (422 on invalid). Saved via `POST /user/onboarding`, returned in `GET /user/me`.
- Pak Har context: `goal_event_label()` in `ollama.py` formats for `build_user_preferences_context()`. `ANALYSIS_PROMPT` has per-goal instructions (Z2 compliance, pace variance, cardiac drift, time-on-feet). `PLAN_PROMPT` has per-goal periodization guidance via `{goal_event_context}`.
- UI copy fix: pills → native `<select>` dropdown (eliminated runtime crash from pill component).

**Race date (`race_date`):**
- Date input added to onboarding modal (below goal cards, step 6) and Runner's Brief settings (2-column grid — goal dropdown left, date input right).
- Frontend: `race_date: string | null` in `UserProfile` and `OnboardingRequest`. Settings page seeds from `userProfile.race_date`, includes in save payload. Onboarding sends `race_date: form.raceDate || null`.
- Backend: `race_date DATE` column + Alembic migration (`c4d5e6f7a8b9`). `OnboardingRequest.race_date: Optional[date]`. Always overwritten (passing `null` clears). Returned in `GET /user/me`. `build_user_preferences_context()` appends weeks-to-race line. `generate_plan_with_ollama()` computes `race_date_context` with four branches — past, taper (<2 weeks), sharpening (2–7 weeks), base building (≥8 weeks) — passed as `{race_date_context}` placeholder in `PLAN_PROMPT`. Analysis prompt: flags unnecessary fatigue when race is within 3 weeks.

**Weekly km label reframe:**
- Onboarding question: "How many km do you want to run per week?" → "How many km do you comfortably run per week right now?"
- Settings label: "Weekly km target" → "Current weekly km"
- Field name (`weekly_km_target`) unchanged — no migration needed. Intent clarified: captures current capacity, not aspiration.

**Docs:**
- `api-spec-v2.md`: `race_date` added to `GET /user/me` response and `POST /user/onboarding` schema. Duplicate "Field constraints" header removed. `weekly_km_target` note clarified.

---

### ✅ Done (2026-05-14 — Pak Har analysis enrichment + plan generation + HR zone alignment)

**Pak Har post-run analysis — new signals:**
- Splits, run history, weekly review added to analysis context (`services/coach.py`, `routers/activities.py`)
- Plan vs actual: active training plan day fetched and passed; Pak Har evaluates run against what was scheduled
- Cardiac drift: compares HR/pace between first and last third of splits; flags ≥5% drift with pace held
- Efficiency factor trend: speed/HR vs last 4 runs; reports trend >±3%
- RPE (1–10): `PATCH /activities/{id}/rpe` endpoint + Alembic migration (`a2b3c4d5e6f7`); RPE cross-referenced against HR zone and splits in analysis
- Time-in-zones: computed from per-second streams (preferred) or per-km splits (fallback); backend uses Karvonen matching frontend card exactly
- `ANALYSIS_PROMPT` updated with instructions for all new signals

**Pak Har weekly plan generation — new signals:**
- Week-by-week volume breakdown: per-week km/runs/avg pace + trend label (building/maintaining/declining/erratic); flags >10% single-week jump
- Previous plan adherence: last completed plan vs actual activities; completion rate + missed days
- RPE trend: avg RPE across last 3–6 rated runs; high signal (≥7) forces recovery week
- HR zone distribution: % Zone 1-2 vs Zone 3+ across last 4 weeks; >50% hard triggers ≥80% easy prescription
- `PLAN_PROMPT` updated with four new placeholders + interpretation rules for each signal

**HR zone alignment:**
- Frontend `computeHrZones` and `computeHrZonesFromStreams` converted from `% of maxHR` to Karvonen formula, matching backend thresholds exactly
- `userRhr` prop added to `DispatchProps`; passed from activity page via `user.resting_hr` (default 60)
- Backend `_compute_time_in_zones` prefers per-second streams; falls back to per-km splits when streams unavailable

**UI:**
- WARN-2 fixed: PlanPaper Tempo sub-label → "Hard. Controlled."; Long sub-label → "Duration over pace."
- RPE input added to Dispatch right column — 10 ink boxes, Space Mono 11px, saved state flash

**Docs:**
- `api-spec-v2.md`: `PATCH /activities/{id}/rpe` documented; `rpe` field added to `ActivityRead` notes; `resting_hr`, `max_hr`, `max_hr_observed` added to `GET /user/me` response
- `README.md`: time-in-zones and RPE added to "What Pak Har considers" section

---

### ✅ Done (2026-05-14 — BUG-026 + Wave 1 Regression Tests)
- [x] BUG-026: Landing page now reads `?error=` on mount and shows Pak Har-voiced Errata block → Frontend — fixed 2026-05-14
  - `page.tsx` → thin Server Component + `<Suspense>`; logic moved to `_landing-content.tsx` (`'use client'`)
  - `LandingPage.tsx` gains optional `errorMessage?: string` prop
  - Error codes mapped: `strava_denied`, `missing_code`, `no_session`, `auth_failed`, `server_unreachable`
  - 125/125 frontend tests passing

### ✅ Done (2026-05-14 — Wave 1 Regression Tests)
- [x] TASK-174: Backend regression tests for BUG-013–025 security fixes → SQA — completed 2026-05-14
  - New file `apps/api/tests/test_auth_security.py` (23 tests) + 4 tests appended to `test_strava.py`
  - Covers: BUG-013 (cookie max-age), BUG-014 (CSRF — 4 cases), BUG-015 (athlete ID None guard), BUG-017 (sport_type fallback — 4 cases), BUG-018 (lazy="raise" runtime + mapper introspection), BUG-019 (timezone-aware datetime), BUG-024 (COOKIE_SECURE env var)
  - Full suite: 137/137 passing
- [x] TASK-175: E2E Playwright auth spec for CSRF-protected OAuth flow → SQA — completed 2026-05-14
  - Rewrote `apps/web/tests/e2e/auth.spec.ts` (was 6 tests, 4 failing due to structural mismatch with Route Handler architecture)
  - 13 tests: 12 passing, 1 skipped (happy path — requires real Strava round-trip; documented why + recommended Vitest unit test alternative)
  - Covers: CSRF mismatch → `auth_failed`, tampered state, `?error=access_denied`, missing code param, auth-required redirect, OAuth initiation UI + error states
  - BUG-026 discovered: landing page silently swallows `?error=` params → filed in bugs-v2.md

### ✅ Done (2026-05-13 — Phase 2I QA)
- [x] TASK-172: Backend tests for Strava streams pipeline → SQA — completed 2026-05-13
  - 21 new tests in `apps/api/tests/test_strava.py`: `_fetch_streams_for_activity` (happy path, downsampling, partial streams, HTTP errors, vel derivation), `_fetch_splits_metric_fallback` (happy path, errors, no-splits), `_derive_splits_from_streams` (pace math, HR averaging, elevation diff, edge cases), `sync_activities` sentinel guard
  - Note: tests calling async functions directly use `unittest.mock.patch` + `AsyncMock` (not respx) — respx does not intercept `httpx.AsyncClient` in direct async test calls outside FastAPI TestClient
  - Full suite: 119/119 passing
- [x] TASK-173: Frontend unit tests for streams utility functions → SQA — completed 2026-05-13
  - 24 new tests in `apps/web/tests/components/redesign/Dispatch.test.tsx`
  - Covers: `hasValidStreams` (null/sentinel/valid), `hasValidStreamsHr`, `streamsToChartPoints` (overlay button enabled/disabled state), `computeHrZonesFromStreams` (zone assignment), cadence from streams (half-cadence × 2), chart placeholder vs SVG render
  - Functions are unexported — tested indirectly via component render
  - Full suite: 125/125 passing

### 🐛 Bug Fixes Applied (2026-04-26, no task IDs)
- User preferences not reaching Pak Har in chat/analysis — `{user_preferences}` placeholder missing from `ANALYSIS_PROMPT` and `SYSTEM_PROMPT`; `stream_chat` signature updated; all four prompts now receive runner preferences
- `disconnectStrava()` not clearing session — cookie set by Next.js (port 3000) couldn't be cleared by FastAPI (port 8000); added `apps/web/src/app/api/disconnect/route.ts` server route to handle cookie deletion same-origin
- Plan realization column showing only one session per day — `buildRealizations` in `plan/page.tsx` used `find()`; switched to `filter()` + aggregate (sum distance + duration, pick longest run as primary). Duration rounding also fixed: sum raw seconds first, round once.
- Plan totals row misaligned — empty `<span/>` was occupying the TARGET column in `PlanPaper.tsx`, pushing total duration into REALIZATION column; swapped cells, REALIZATION now shows actual summed activity duration
- Full reset not visually clearing plan — `invalidateQueries` in `settings/page.tsx` served stale cache during refetch; replaced with `removeQueries` so entries are wiped before redirect

### 🐛 Bug Fixes Applied (2026-04-25, no task IDs)
- `Dispatch` component missing analyze button — added "Get his take →" (no analysis) and "Refresh his take →" (existing analysis); wired `analyzeActivity` + query invalidation in `/activities/[id]/page.tsx`
- `FrontPage` lead headline rendering all-caps — removed `uppercase`, applied `toSentenceCase` transform
- Activity dates off by one day — `strava.py` was parsing `start_date` (UTC); switched to `start_date_local` (naive local datetime, no tz suffix) so browser renders the correct local date
- Existing activities not getting corrected dates — sync pipeline was skipping on duplicate; changed to upsert (updates mutable Strava fields, preserves app-owned fields: `analysis`, `verdict_*`, `tone`)
- "TAP REFRESH FOR LATEST" button appeared non-functional — used `invalidateQueries` (background refetch, no visual feedback); switched to `refetch` + `isFetching` state so `FrontPage` shows "Syncing_" during fetch and disables the button

### 🔲 Planned

**Weekly Review — Missing Context (to fix one by one)**

Pak Har currently receives: planned vs actual run count, basic per-run stats (date, distance, duration, pace, avg HR), user preferences. The following signals are missing:

- [x] TASK-178: Total km this week vs weekly km target — completed 2026-05-14
- [x] TASK-179: Which specific days were missed — completed 2026-05-14
- [x] TASK-180: Prior week comparison — completed 2026-05-14
- [x] TASK-181: HR zone breakdown for the week — completed 2026-05-14
- [x] TASK-182: RPE per run — completed 2026-05-14
- [x] TASK-183: Plan verdict tags from the week — completed 2026-05-14

---

**Phase 1 — Backend Foundation**
- [x] TASK-102: `POST /user/onboarding` — save/update user preferences → Backend — completed 2026-04-19
- [x] TASK-103: `GET /user/me` — user profile + preferences → Backend — completed 2026-04-19
- [x] TASK-108: Update plan prompt to inject `user_preferences` context → Backend — completed 2026-04-19
- [x] TASK-105: `POST /review/generate` + `GET /review/current` — weekly review generation → Backend — completed 2026-04-24
- [x] TASK-106: `GET /insights` — aggregated trend stats + Pak Har commentary → Backend — completed 2026-04-24

**Phase 2 — UI Redesign (Tabloid)**
> Design handoff received 2026-04-24 at `apps/web/old-legs-redesign/`. Reference: `README.md`, `Old Legs - Front Page.html`, `components/activities-frontpage.jsx`, `components/direction-news.jsx`.

- [x] TASK-110: Design handoff received — tabloid newspaper aesthetic confirmed → UX — completed 2026-04-24

**Phase 2A — Design System (prerequisite for all redesign tasks)**
- [x] TASK-125: Update design tokens — new color palette (`paper #f4efe4`, `ink #141210`, `accent #8a2a12`), retire dark theme for redesigned screens → UX — completed 2026-04-24 (uncommitted)
  - Update `globals.css`: add `--color-paper`, `--color-ink`, replace `--color-accent` with `#8a2a12`
  - Update Tailwind theme: `@theme inline` block with `--color-paper`, `--color-ink`, `--color-accent`
  - No border radius on newspaper surfaces (`rounded-none` default for redesigned components)
  - No shadows on paper surfaces
- [x] TASK-126: Load new font stack via Google Fonts → UX — completed 2026-04-24 (uncommitted)
  - Abril Fatface (display / masthead / headlines)
  - Lora 400/700 italic (body prose)
  - Work Sans 400/500/600/700/800 (labels, metadata, badges)
  - Space Mono 400/700 (all numbers — stats, splits, zones)
  - Add to `layout.tsx` `<link>` tags; add CSS variables `--font-display`, `--font-body`, `--font-sans`, `--font-mono`
  - Add Tailwind utilities: `font-display`, `font-body` mapped to variables

**Phase 2B — Front Page (`/activities`) — depends on TASK-125, 126**
- [x] TASK-127: `ToneBadge` component (`src/components/redesign/ToneBadge.tsx`) → UX — completed 2026-04-24
- [x] TASK-128: Front Page layout component (`src/components/redesign/FrontPage.tsx`) → UX — completed 2026-04-24
- [x] TASK-129: Wire Front Page to API data (`src/app/activities/page.tsx`) → Frontend — completed 2026-04-24

**Phase 2C — Dispatch (`/activities/[id]`) — depends on TASK-125, 126**
- [x] TASK-130: Dispatch layout component (`src/components/redesign/Dispatch.tsx`) → UX — completed 2026-04-24
  - Paper width 760px, hard corners
- [x] TASK-131: Wire Dispatch to API data (`src/app/activities/[id]/page.tsx`) + shared `lib/weeklyKm.ts` helper → Frontend — completed 2026-04-24

**Phase 2D — Backend: verdict fields — depends on nothing, can start anytime**
- [x] TASK-133: Add `verdict_short`, `verdict_tag`, `tone` to Activity model + analysis endpoint → Backend — completed 2026-04-25
  - Add 3 nullable fields to `Activity` model + Alembic migration
  - Update `POST /activities/{id}/analyze`: after getting Pak Har's long-form analysis, make a second short Ollama call (non-streaming) asking for: (1) one-line verdict ≤12 words, (2) 1-2 word stamp from fixed list (`PACED POORLY | ON PLAN | HELD THE LINE | FADED LATE | FUELING | RESTRAINED | STEADY | NO SHOW`), (3) tone classification (`critical | good | neutral`)
  - Store all three on the Activity row
  - Add to `ActivityRead` schema and `GET /activities` + `GET /activities/{id}` responses
  - Update `api-spec-v2.md`

**Phase 2F — Tabloid Redesign: Remaining Pages — depends on TASK-125, 126 (done)**
> Completes F8. Design handoff: `apps/web/old-legs-redesign/design_handoff_old_legs/`. Reference files: `components/newspaper-chrome.jsx`, `page-dashboard.jsx`, `page-plan.jsx`, `page-coach.jsx`, `page-landing.jsx`, `page-extras.jsx`, `Old Legs - More Pages.html`.

**Phase 2F-0 — Shared Chrome (prerequisite for all 2F pages)**
- [x] TASK-145: `NewspaperChrome` shared primitives + chrome component → UX — completed 2026-04-25 (`src/components/redesign/NewspaperChrome.tsx`) → UX
  - Source: `newspaper-chrome.jsx`. Port all shared primitives as named exports: `OL` tokens, `Caps`, `Rule`, `Hairline`, `SectionLabel`, `ToneBadge` (already exists — re-export or merge), `MiniBar`, `Paper`, `FooterRail`
  - `NewspaperChrome` component props: `section: string`, `issue?: number`, `date?: string`, `nav: NavItem[]`, `activeNav: string`, `onNav: (key: string) => void`, `big?: boolean` (88px masthead when true, 56px when false), `subtitle?: string | null`
  - Top rail: flex-between, Work Sans 10px uppercase, opacity 0.75 — `Vol. III · Edition No. {issue}` / `Old Legs Daily — The Runner's Paper` / `{date}`
  - Thick rule (3px + 1px with 3px gap)
  - Masthead: `Old Legs` in Abril Fatface, centered, uppercase. Big: 88px letter-spacing -1.5. Small: 56px. Subtitle below in Work Sans 10px letter-spacing 6 opacity 0.75
  - Thick rule
  - Nav strip: centered flex, gap 28, Work Sans 11px uppercase letter-spacing 3. Active: weight 800, 2px accent bottom border, full opacity. Inactive: weight 500, opacity 0.7
  - Hairline + section row (`§ {section}` left, `Coach on Duty · Pak Har` right) + hairline
  - Nav keys → routes: `dashboard`→`/dashboard`, `activities`→`/activities`, `plan`→`/plan`, `coach`→`/coach`, `settings`→`/settings`
  - Nav labels in design: "Front Page" | "Dispatches" | "Plan" | "Letters" | "Desk"

**Phase 2F-A — Dashboard (`/dashboard`)**
- [x] TASK-136: `DashboardPaper.tsx` component (`src/components/redesign/DashboardPaper.tsx`) → UX — completed 2026-04-25
  - Source: `page-dashboard.jsx`. Paper 980px, `NewspaperChrome big section="Front Page · Weekly Edition"` activeNav="dashboard"
  - **Above the fold** — 2-col grid `1.55fr 1fr`, gap 28:
    - Left (lead): section label `Today's Lead · Week of {dates}`, Abril 60px headline (weekly narrative from Pak Har or "Week is light. {X} km of {target} so far."), Lora 14px body. Scoreboard: `3px solid ink` border, 4-col stat grid (This Week km / Runs / Time on Feet / Week Completion %), Space Mono 26px 700 values. Weekly progress bar below: `MiniBar` accent, flex label with km/target
    - Right sidebar (`borderLeft: 1px solid ink`, `paddingLeft: 20`): "On the Schedule Today" + Hairline + Today card (`3px solid ink`, accent bg tint `rgba(138,42,18,0.04)`) — shows day, ToneBadge for run type, Abril 34px `{duration} minutes, under {hr} bpm.`, Lora 13px description, "See the full week →" accent link. Below Today card: Standings (same 4-row MiniBar as FrontPage). Below Standings: Notices — Strava sync time, any pending analysis, Pak Har quote
  - **Below the fold** — thick rule + `SectionLabel "Below the Fold · Last Run" right="tap to read the dispatch →"` + hairline + 3-col grid `90px 1fr 260px` clickable article (same pattern as FrontPage previous editions: date block / headline+snippet with drop cap / mini stat box `1px solid ink`)
  - **Op-Ed section** — thick rule + `SectionLabel "Opinion · The Arc" right="columnist · weekly"` + hairline + 2-col `1.15fr 1fr`, gap 28: left = insights prose (byline `by Pak Har — 6-Week Column`, Abril 36px italic headline, 2 Lora paragraphs, pull-quote with `2px solid accent` top/bottom, sign-off), right = "Supporting Figures" box (`1px solid ink`): SVG bar chart of weekly km (current week accent, others ink), 2-col key numbers grid (Avg HR, Load vs peak), "Write to the editor →" accent link
  - If no insights yet: Op-Ed section shows "No column yet. Generate insights to file the arc." italic Lora
  - Props: `weeklyStats`, `todayPlan`, `lastRun`, `insights`, `onOpenRun`, `onOpenPlan`, `onOpenCoach`

- [x] TASK-137: Wire `DashboardPaper` to API data (`src/app/dashboard/page.tsx`) → Frontend — completed 2026-04-25
  - Depends on TASK-145, TASK-136
  - Fetch: `GET /user/me`, `GET /activities?per_page=1`, `GET /plan/current`, `GET /insights`
  - Replace current dashboard page with `<DashboardPaper>`

**Phase 2F-B — Plan (`/plan`)**
- [x] TASK-138: `PlanPaper.tsx` component (`src/components/redesign/PlanPaper.tsx`) → UX — completed 2026-04-25
  - Source: `page-plan.jsx`. Paper 980px, `NewspaperChrome big=false section="Fixtures · Week of {dates}"` activeNav="plan"
  - **Heading**: 2-col `1fr 260px`, gap 28 — left: section label `The Fixtures · Week {n}`, Abril 56px headline, Lora 13.5px deck. Right: "Week At A Glance" stats box (`3px solid ink`, 2×2 grid: Runs / Rest / Km / Minutes, Space Mono 22px 700)
  - **Fixtures table**: thick rule + 8-col header row (`44px 92px 1fr 130px 80px 80px 2.2fr 20px`, gap 14) with Caps labels: Day | Date | Session | Target | Duration | Distance | Instructions | (blank)
    - Each row: same grid, `padding 14px 4px`, bottom border `1px dotted rgba(20,18,16,0.3)` (last row: `3px solid ink`). Today row: accent left border `3px solid accent`, `paddingLeft 8`, `rgba(138,42,18,0.04)` bg, "Today" Caps label in accent below day. Rest rows: `opacity 0.55`. Day col: Abril 28px day abbreviation. Date: Space Mono 13. Session col: ToneBadge + italic Lora 11 sub-label (Tempo → "The week's sharp edge.", Long → "The honest one."). Target/Duration/Distance: Space Mono. Instructions: Lora 12.5. Arrow col: Abril 18px `→` (hidden for Rest)
  - **Totals row**: same grid, inverted — `background: OL.ink`, `color: OL.paper`. Shows "TOTALS" caps, total min, total km, run/rest summary
  - **Below table** — 2-col `1.3fr 1fr`, gap 28: left = "Editor's Note" (drop-cap first letter Abril 42px floated left, Lora 13.5 justified, byline); right = "Key" section (badge+description rows for each type) + "Corrections" subsection with "Write the editor →" link
  - No plan state: show "No plan yet. Pak Har will build one when he's seen enough of your runs." italic Lora + generate button
  - Props: `plan: TrainingPlan | null`, `onGeneratePlan: () => void`, `isGenerating: boolean`

- [x] TASK-139: Wire `PlanPaper` to API data (`src/app/plan/page.tsx`) → Frontend — completed 2026-04-25
  - Depends on TASK-145, TASK-138
  - Replace current plan page with `<PlanPaper>`

**Phase 2F-C — Coach (`/coach`)**
- [x] TASK-140: `ChatPaper.tsx` component (`src/components/redesign/ChatPaper.tsx`) → UX — completed 2026-04-25
  - Source: `page-coach.jsx`. Paper 760px, `NewspaperChrome big=false section="Letters to the Editor · Wire Desk"` activeNav="coach"
  - **Wire status bar**: section label `Teletype · Direct to the Editor` + Hairline + status strip (`1px solid ink`, flex-between, `rgba(20,18,16,0.02)` bg): `Wire: OLD-LEGS / PAK-HAR` / status dot `● ON THE LINE` (accent, weight 800 when streaming) or `● OPEN` / `Jakarta · GMT+7`
  - **Transcript**: `border: 1px solid ink`, `borderTop: none`, `padding: 18px 20px 14px`, Space Mono 13px, `minHeight: 380`, `maxHeight: 420`, `overflowY: auto`. Dashed gutter line on left (absolute, `left: 6`, `1px dashed rgba(20,18,16,0.3)`). Each message: `marginBottom: 14`, `paddingLeft: 14`, 3px left bar (accent for Pak Har, ink for user). Header row: `{timestamp}` Space Mono 11 + `FROM: YOU / PAK` 11px letter-spacing 3 + dotted flex-grow line + `EDITOR / SUBSCRIBER` right. Body: Space Mono 13px, `> ` prefix in opacity 0.5, streaming cursor `_` via `ol-cursor` blink class
  - **Composer**: `border: 1px solid ink`, `borderTop: none`, 3-col grid `72px 1fr 100px`, gap 10. Left: Sender label ("Sender" caps + "YOU" mono 13 700). Center: `<textarea>` dashed border `1px dashed ink`, transparent bg, Lora 13, 2 rows, Enter to send (Shift+Enter = newline). Right: button — idle text "Punch / Send ↵", active: accent bg white text; disabled: transparent bg opacity 0.5
  - **Below transcript** — 2-col `1.2fr 1fr`: left = "Wire Desk Notes" (Hairline + 2 Lora body paragraphs); right = "Useful Signals" (Hairline + list: TRAIN? / PACE? / REST? / RACE? with mono key + body description, dotted borders)
  - No history state: no empty state — just show the transcript box and composer
  - Props: `messages: ChatMessage[]`, `isStreaming: boolean`, `onSend: (text: string) => void`

- [x] TASK-141: Wire `ChatPaper` to streaming API (`src/app/coach/page.tsx`) → Frontend — completed 2026-04-25
  - Depends on TASK-145, TASK-140
  - Preserve all SSE streaming logic — only replace the rendering layer
  - Timestamps: use actual message created_at formatted as `HH:MM:SS`

**Phase 2F-D — Settings (`/settings`)**
- [x] TASK-142: `SettingsPaper.tsx` component (`src/components/redesign/SettingsPaper.tsx`) → UX — completed 2026-04-25
  - Source: `page-extras.jsx` → `SettingsPage`. Paper 980px, `NewspaperChrome big=false section="The Desk · Subscriber Controls"` activeNav="settings"
  - Heading: "Subscriber Account" caps + Abril 52px "The Desk." + Lora 13.5 deck
  - **2-col layout** `1fr 280px`, gap 28:
    - Main column: thick rule, then 3 `<section>` blocks each with `borderBottom: 1px solid ink`:
      1. "Subscriber Record" (read-only) — 3-col grid: Name, Subscribed, Editions received, Strava athlete ID, Timezone, Unit — each cell `borderLeft: 1px solid rgba(20,18,16,0.3)`, Caps 8px label + mono 13 value
      2. "Editor's Voice" — deck text in Lora muted + 3-option picker (Gentle / Standard / Unfiltered): selected = `3px solid ink`, unselected = `1px solid ink`. Each shows label (Caps 10 weight 800) + checkmark if active + description (Lora 12 muted)
      3. "Delivery Preferences" — toggle rows for: "Dispatch after every run" / "Weekly plan on Monday 05:00" / "Weekly review on Sunday 20:00" / "Missed-run nudge (gentle)". Toggle: `44×20px`, `1px solid ink`, ink fill when on with paper knob sliding right
      4. "Cancel the Subscription" (no border-bottom) — Lora body + `Cancel Subscription →` button: transparent bg, accent color, `1px solid accent`, Work Sans 11 letter-spacing 3 weight 700 uppercase
    - Sidebar (`borderLeft: 1px solid ink`, `paddingLeft: 20`): "The Paper in Numbers" (4 rows: editions received / dispatches filed / weekly plans / letters exchanged — mono 22 700 value + Caps label, dotted dividers) + "Colophon" (Hairline + Lora 12 muted text)
  - Props: `user: UserProfile`, `stats: UserStats`, `onVoiceChange`, `onTogglePreference`, `onDisconnect`

- [x] TASK-143: Wire `SettingsPaper` to API data (`src/app/settings/page.tsx`) → Frontend — completed 2026-04-25
  - Depends on TASK-145, TASK-142
  - Replace current settings page with `<SettingsPaper>`

**Phase 2F-E — Landing (`/`) and System States**
- [x] TASK-144: `LandingPage.tsx` component (`src/components/redesign/LandingPage.tsx`) → UX — completed 2026-04-25. Wired to `src/app/page.tsx` → Frontend — completed 2026-04-25.
  - Source: `page-landing.jsx`. Paper 760px, no nav, no chrome
  - Top rail: flex-between Caps 10px opacity 0.75 — `Vol. I · Issue No. 1` / `The Runner's Paper` / `Jakarta Edition`
  - Thick rule
  - Centered content (flex column, justify-center, align-center, text-center, `padding: 40px 0`): Abril 108px uppercase `Old Legs`, letter-spacing -2, line-height 0.9. Work Sans 13px 500 letter-spacing 4 uppercase tagline — "He's 70. He's already lapped you." then second line `And he has thoughts.` in accent color. `marginTop: 28`
  - Connect button (`marginTop: 40`, `minWidth: 300`): accent bg white text, `padding: 16px 40px`, Work Sans 12 letter-spacing 3 weight 700 uppercase, hard corners. Connecting state: `1px solid ink` box with `Opening Strava_` in Space Mono + blinking cursor. Error state: accent-bordered box "Errata" label + "Strava did not answer. Try once more." + retry button (ink bg)
  - Below button: Caps 9px opacity 0.55 "Read-only access · Free · 1 minute"
  - Bottom rail: thick rule + "Printed at Senayan · Jakarta" / "— filed daily, rain or otherwise —"

- [x] TASK-146: `ThinkingPage` + `OfflinePage` components → UX — completed 2026-04-25
  - Source: `page-extras.jsx`. Both are used as full-page states during LLM generation and service outages.
  - `ThinkingPage` (`src/components/redesign/ThinkingPage.tsx`): Paper 760px, `NewspaperChrome big=false section="Going To Press"`. Heading: "Stop Press" caps + Abril 56px "Pak Har is at the typewriter." 2-col `1fr 280px`: left = typewriter steps strip (`1px solid ink`): 4 steps cycling with `›` active / `✓` done / `·` queued — accent color on active indicator, mono 13, "filed / writing / queued" Caps 8 right. Steps for dispatch: `Pulling splits...` / `Reading the zones...` / `Checking last week...` / `Writing the dispatch...`. Steps for plan: `Reading your last four weeks...` / `Rounding up the targets...` / `Drafting Tuesday...` / `Filing the plan...`. Italic Lora muted note below strip. Right sidebar: "Coming in This Edition" Caps + Hairline + `§`-prefixed list of expected content items
  - `OfflinePage` (`src/components/redesign/OfflinePage.tsx`): Paper 760px, `NewspaperChrome big=false section="Errata"`. 3 variants: `api` ("The presses are down.") / `ollama` ("Pak Har is not at his desk.") / `strava` ("Strava did not answer."). Each has headline (Abril 64px), deck (Lora 16px), sub (Lora 13.5 muted italic), error code (Space Mono). All inside `3px solid ink` bordered box with `rgba(138,42,18,0.04)` bg. Retry button: ink bg white text. Below: 3-col status/cache/support info strip
  - Props: `ThinkingPage`: `context: 'dispatch' | 'plan'`. `OfflinePage`: `kind: 'api' | 'ollama' | 'strava'`, `onRetry: () => void`

**Phase 2G — Plan page: Realization column**
> Adds TARGET (measurable per-day goal from Pak Har) and REALIZATION (matched activity actuals) to the fixtures table. Backend ships first; frontend unblocked after TASK-147.

- [x] TASK-147: Add `target: str | null` to `PlanDay` schema + update plan generation prompt to output measurable target per day → Backend — completed 2026-04-25
- [x] TASK-148: Plan table redesign — drop DISTANCE column, reorder to DAY | DATE | SESSION | TARGET | REALIZATION | INSTRUCTION/VERDICT, add activity date-matching logic → Frontend + UX — completed 2026-04-25
- [x] TASK-149: `POST /activities/{id}/plan-verdict` — stateless Ollama endpoint comparing actual run vs plan target, returns `verdict_short`, `verdict_tag`, `tone` → Backend — completed 2026-04-25
- [x] TASK-150: Wire plan-verdict into plan page — `useQueries` per matched day, `staleTime: Infinity`, three-tier fallback (plan verdict → generic verdict → instructions) → Frontend — completed 2026-04-25

**Phase 2H — Context Reset**
- [x] TASK-151: `DELETE /coach/history` — wipe chat messages for current user → Backend — completed 2026-04-26
- [x] TASK-152: `DELETE /reset` — full AI context wipe (chat, plans, reviews, activity analysis fields nulled) + Desk page two-step confirmation button → Backend + Frontend — completed 2026-04-26
- [x] TASK-153: Clear session button on Letters page — single click, calls `DELETE /coach/history`, clears local messages state → Frontend — completed 2026-04-26

**Phase 2E — Shipped**
- [x] TASK-134: Strava splits sync — per-km splits fetched via `splits_metric` (TASK-161–164), `moving_time` stored per split → Backend — completed 2026-04-26 (via TASK-161–164); marked done 2026-05-03
- [x] TASK-135: Dispatch HR zones visualization → Frontend — completed 2026-05-03
  - `computeHrZones()` computes time-in-zone from splits + user max HR
  - 5-bar chart in Dispatch right column; Z4/Z5 accent, Z1–Z3 ink
  - Pace chart (SVG, shipped earlier) and splits table already live
  - Post-commit review caught + fixed: dead threshold constant, missing `maxHr <= 0` guard

**Phase 2I — Strava Streams (high-resolution activity data)**
> Replaces per-km splits_metric with the Strava streams API. Enables smooth pace chart (500pt vs 10pt), accurate per-second HR zones, absolute elevation profile, and future route map. Backend ships first; all three frontend tasks unblock together after TASK-167.

- [x] TASK-165: Add `streams` JSON column to Activity model + Alembic migration → Backend — completed 2026-05-03
  - Nullable JSON column, default null. Keep `splits` column untouched.
  - Migration `d4e5f6a7b8c9` chains from `c3d4e5f6a7b8`. `ActivityRead` schema updated. 98/98 tests passing.

- [x] TASK-166: Replace `_fetch_splits_for_activity` with `_fetch_streams_for_activity` → Backend — completed 2026-05-03
  - Calls `GET /activities/{id}/streams` with 9 keys; downsamples to ≤500 pts via uniform stride
  - Stores compact dict: `{n, time, dist, vel, hr|null, cad|null, alt|null, grade|null, latlng|null}`
  - Derives `splits` from streams for backwards compatibility; falls back to `_fetch_splits_metric_fallback` (renamed from old function) if streams unavailable
  - Fallback sentinel: sets `streams = {}` after successful fallback so activity is never retried
  - Review caught 2 bugs fixed before commit: fallback splits never committed (missing counter in commit gate); stream-unresolvable activities retried indefinitely (fixed with `{}` sentinel)
  - 98/98 tests passing

- [x] TASK-167: Expose `streams` in ActivityRead schema + frontend types → Backend + Frontend — completed 2026-05-12
  - Backend: `streams: Optional[dict] = None` already present in `ActivityRead` (added by TASK-166 agent)
  - Frontend: `ActivityStreams` interface + `streams: ActivityStreams | Record<string, never> | null` added to `Activity` in `src/types/api.ts`
  - Test fixtures updated: `splits: null, streams: null` added to mock Activity objects in 4 test files
  - Insights test fix: `_make_activity_obj` / `_seed_activities_across_weeks` anchored to ISO week Monday to prevent date-drift failures
  - 98/98 backend, 101/101 frontend

- [x] TASK-168: High-res pace chart from streams → Frontend — completed 2026-05-12
  - `streamsToChartPoints()` helper converts streams `vel`/`dist`/`hr`/`cad`/`alt` to chart points
  - `hasValidStreams()` type guard checks for non-null, non-sentinel streams
  - Chart uses `streams.dist` as x-axis (meters) with km-marker labels when streams available
  - All three overlays (HR, cadence, altitude) use streams arrays when available; fallback to splits seamless
  - 101/101 tests passing

- [x] TASK-169: Accurate HR zones from streams → Frontend — completed 2026-05-12
  - `computeHrZonesFromStreams()` uses `time[i+1] - time[i]` per-point duration for precise zone seconds
  - `hasValidStreamsHr()` type guard narrows to `ActivityStreams & { hr: number[] }`
  - Falls back to existing `computeHrZones(splits)` when no streams HR data
  - 101/101 tests passing

- [x] TASK-170: Elevation profile chart → Frontend — completed 2026-05-12
  - `ElevationProfileChart`: 60px SVG sparkline, accent filled area + 2px stroke line
  - `computeElevationStats()` sums alt diffs for gain/loss rounded to nearest meter
  - Label row: "ELEVATION PROFILE" + "↑{n}m ↓{n}m". Hairline dividers, hard corners
  - Positioned below pace chart, above splits table. Only renders when `streams.alt` non-null
  - 101/101 tests passing

- [ ] TASK-171: Route map (deferred — v3) → Frontend
  - `streams.latlng` enables route visualization via Leaflet or SVG projection
  - Out of scope for current sprint

**Phase 3 — Frontend**
- [x] TASK-116: Onboarding flow (3-question modal on first login) → Frontend — completed 2026-04-19
- [x] TASK-117: Settings / profile page → Frontend — completed 2026-04-19
- [x] TASK-118: Weekly review UI (dashboard card + full view) → Frontend — completed 2026-04-24
- [x] TASK-119: Insights section (trend analysis UI) → Frontend — completed 2026-04-24

**Phase 4 — QA**
- [x] TASK-120: Backend tests for all new endpoints → SQA — completed 2026-04-24
- [x] TASK-121: Pak Har voice audit — completed 2026-05-02. Report: `voice-audit-v2.md`. BUG-002 filed (plan-verdict prompt lacks voice rules).
- [x] TASK-122: Frontend component tests → SQA — completed 2026-05-03. 5/5 files written. 101 tests total (100 passing, 1 pre-existing failure in `NewspaperChrome.test.tsx` — `·` character matcher, filed as open issue).
- [x] TASK-123: E2E tests for new flows — completed 2026-05-02. 4 specs written: `onboarding.spec.ts`, `settings.spec.ts`, `plan.spec.ts`, `weekly-review.spec.ts`.
- [x] TASK-124: Security audit — completed 2026-05-02. Report: `security-audit-v2.md`. 14→26 tests. BUG-010 filed (GET /insights missing rate limit).

### ✅ Done
- [x] TASK-160: Max HR input in onboarding modal (step 5) + Runner's Brief Desk page → Frontend — completed 2026-04-26
- [x] TASK-159: User-provided `max_hr` field — model, migration, schema, 3-tier zone priority (user-provided → cached → derived) → Backend — completed 2026-04-26
- [x] TASK-158: Resting HR input in onboarding modal (step 4) + Runner's Brief Desk page → Frontend — completed 2026-04-26
- [x] TASK-157: `resting_hr` + `max_hr_observed` on User model, migration, auto-update on sync, wired into zone calc → Backend — completed 2026-04-26
- [x] TASK-156: Runner's Brief section on Desk page — editable `weekly_km_target`, `days_available`, `biggest_struggle` fields pre-filled from `GET /user/me`, saved via `POST /user/onboarding` → Frontend + UX — completed 2026-04-26
- [x] TASK-155: Wire user onboarding into tabloid frontend — `useUser` hook, `getUserMe`/`saveOnboarding` in `api.ts`, `UserProfile` types, `OnboardingModal` (tabloid-styled), onboarding gate on dashboard, Subscriber Record wired to real data in settings → Frontend — completed 2026-04-26
- [x] TASK-154: Port user router from feature/user-onboarding — `POST /user/onboarding` + `GET /user/me` registered in main → Backend — completed 2026-04-26
- [x] TASK-152: `DELETE /coach/reset` full context wipe + two-step "Reset Pak Har's Context" button on Desk page → Backend + Frontend — completed 2026-04-26
- [x] TASK-153: `[ CLEAR SESSION ]` button on Letters page — calls `DELETE /coach/history`, clears local Zustand store immediately → Frontend — completed 2026-04-26
- [x] TASK-151: `DELETE /coach/history` — wipe all chat messages for current user → Backend — completed 2026-04-26
- [x] TASK-133: Add `verdict_short`, `verdict_tag`, `tone` to Activity model + analysis endpoint → Backend — completed 2026-04-25
- [x] TASK-137: Wire `DashboardPaper` to API data (`src/app/dashboard/page.tsx`) → Frontend — completed 2026-04-25
- [x] TASK-139: Wire `PlanPaper` to API data (`src/app/plan/page.tsx`) → Frontend — completed 2026-04-25
- [x] TASK-141: Wire `ChatPaper` to streaming API (`src/app/coach/page.tsx`) → Frontend — completed 2026-04-25
- [x] TASK-143: Wire `SettingsPaper` to API data (`src/app/settings/page.tsx`) → Frontend — completed 2026-04-25
- [x] TASK-144: Wire `LandingPage` to `src/app/page.tsx` → Frontend — completed 2026-04-25
- [x] TASK-118: Weekly review UI — WeeklyReviewCard + dashboard integration → Frontend — completed 2026-04-24
- [x] TASK-119: Insights section — InsightsSection + dashboard integration → Frontend — completed 2026-04-24
- [x] TASK-120: Backend tests for new endpoints (35/35 passing, BUG-001 found + fixed) → SQA — completed 2026-04-24
- [x] TASK-105: `POST /review/generate` + `GET /review/current` — weekly review generation → Backend — completed 2026-04-24
- [x] TASK-106: `GET /insights` — aggregated trend stats + Pak Har commentary → Backend — completed 2026-04-24
- [x] TASK-102: `POST /user/onboarding` — save/update user preferences → Backend — completed 2026-04-19
- [x] TASK-103: `GET /user/me` — user profile + preferences → Backend — completed 2026-04-19
- [x] TASK-108: User preferences injected into plan + chat prompts; `resting_hr` wired into HR zone analysis → Backend — completed 2026-04-19
- [x] TASK-116: Onboarding modal (3-step, non-dismissible, shown on first login) → Frontend — completed 2026-04-19
- [x] TASK-117: Settings page (`/settings`) — edit preferences, view stats, Settings nav item added → Frontend — completed 2026-04-19
- [x] TASK-101: User model audit — renamed `weekly_km_goal` → `weekly_km_target`, added `onboarding_completed` bool, Alembic migration → Backend — completed 2026-04-19
- [x] TASK-104: `weekly_review` table + schema + Alembic migration → Backend — completed 2026-04-19
- [x] TASK-107: Activity list filtering, search, server-side pagination — response shape changed to `{ items, total, page, per_page }` → Backend — completed 2026-04-19
- [x] TASK-109: HR zone interpretation in post-run analysis prompt + `build_analysis_context()` service → Backend — completed 2026-04-19
- [x] TASK-114: Dashboard hub page (weekly stats, today's plan day, last run, Pak Har entry) → Frontend — completed 2026-04-19
- [x] TASK-115: `/activities` standalone page with run list + click-through to detail → Frontend — completed 2026-04-19
- [x] INFRA: Replaced SQLite with PostgreSQL for dev + prod parity. Alembic now runs on API startup (`main.py`). `alembic/env.py` reads `DATABASE_URL` from env. `docker-compose.yml` exposes Postgres on port 5432 — completed 2026-04-19
- [x] INFRA: Fixed `getActivities()` in `api.ts` to unwrap `.items` from paginated response — closes frontend debt from TASK-107 — completed 2026-04-19
- [x] PATCH: HR zone engine upgraded to Karvonen formula (MHR derived from activity history, RHR defaults to 60 bpm until user provides via onboarding). `build_analysis_context()` accepts `resting_hr` param — will wire to `user.resting_hr` when TASK-102 ships — completed 2026-04-19
- [x] PATCH: "Refresh his take" button added to `AnalysisBlock` — allows regenerating analysis on already-analyzed runs — completed 2026-04-19

## Blockers
- None currently. Redesign tasks unblocked.

## Test Coverage Targets
- Backend: maintain 80%+ (currently 84% in v1)
- E2E: cover all new user flows
- Run backend: `cd apps/api && python -m pytest -v`
- Run frontend: `cd apps/web && npm test`
- Run E2E: `cd apps/web && npx playwright test`

## Build Sequence
Phase 1 → Phase 2 (parallel where possible) → Phase 3 → Phase 4

---

## V3 Notes
- **Goal setting / race-specific plans (F9):** Periodized training requires significant prompt engineering. Stretch goal that may slip to v3.
- **Email digest:** Adds SMTP dependency — against self-hosted spirit unless opt-in.
- **Multi-user / team mode:** Large architectural change, out of scope.
- **Redis rate limiter:** Only needed for horizontal scaling. Current in-memory limiter sufficient for single-instance.
- **Splits + HR zones + pace chart (TASK-134, 135):** Requires Strava streams API integration and new lap DB model. Deferred to v3. `PaceChart.tsx` placeholder remains until then.
- **Redesign pass 2 — other pages:** Weekly plan, chat, dashboard in tabloid style not designed yet. Weekly plan likely a "league table" view. Chat candidate: typewritten letter format. Out of scope for this pass.

---
*Orchestrator updates this file after each task completion.*
