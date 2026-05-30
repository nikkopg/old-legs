# Changelog

## v2.2.0 — 2026-05-30

Garmin Connect watch sync — push your weekly training plan directly to your Garmin watch calendar.

### Features
- **Watch Integration (Settings)** — connect your Garmin Connect account in Settings → Watch Integration. Credentials are encrypted at rest (Fernet). Supports Garmin 2FA via MFA code prompt.
- **Sync to Watch (Plan page)** — "Sync to Watch" button pushes the active weekly plan to all connected watch platforms. Each day (easy, tempo, long, interval, recovery) is mapped to a structured Garmin workout with HR-zone targets derived from your max HR. Rest and cross-training days are skipped.
- **Dedup guard** — re-syncing the same plan returns "Already synced." instead of creating duplicate workouts on the watch calendar.
- **Live status** — Settings shows last synced timestamp and any sync error. Plan page shows a "Connect a watch in Settings" link until a watch is connected.

### Backend
- `POST /watch/connect` — store encrypted Garmin credentials, validate with a real login (returns 428 + MFA prompt for accounts with 2FA enabled)
- `POST /watch/connect/mfa` — complete MFA challenge
- `DELETE /watch/{platform}/disconnect` — remove integration (idempotent, 204)
- `GET /watch/status` — list connected platforms with last-sync timestamp
- `POST /watch/sync` — push active plan to all connected watches; returns per-platform result (`pushed` / `already_synced` / `skipped` / `failed`)
- New `watch_integrations` DB table with FK cascade, unique constraint on (user_id, platform)

### Bug fixes
- **MFA heuristic** — replaced overly-broad `"code"` substring match with explicit `GarminConnectTwoFactorAuthenticationError` type check; prevents false MFA triggers on unrelated Garmin errors
- **Duplicate push protection** — `last_synced_plan_id` column tracks last-synced plan; backend skips push if plan unchanged
- **TOCTOU race** — concurrent connect requests now handled gracefully via `IntegrityError` catch + retry
- **apiFetch 428 detail** — structured `{ mfa_required, platform }` object now preserved through error handler
- **Sync button state** — "Sync to Watch" button disables in `done` state, preventing accidental re-sync

## v2.1.0 — 2026-05-27

Share card enhancements, design system polish, and entrance animations.

### Features
- **Share card — mobile QR handoff** — desktop generates a share card PNG, uploads it to a short-lived in-memory token store (1 h TTL), and displays a QR code. Scanning on a phone opens a share page served over port 3000 (no need to reach the API port). Long-press the image on iOS to save to Photos; tap "Save Image" on Android. Removes the broken `navigator.share` button (Web Share API requires HTTPS — not available over LAN HTTP).
- **Share card — run stats strip** — distance, moving time, pace, average HR, and elevation are now rendered directly on the share card PNG via Canvas 2D at 2× scale (1200 × 800 px).
- **Docker LAN IP auto-detection** — web container uses `network_mode: host` so `os.networkInterfaces()` returns the real host NIC (not the Docker bridge IP). QR code links are generated server-side at request time via `/api/local-ip`, with interface-name filtering to skip `docker0`, `br-*`, `veth*`, and loopback.
- **Entrance animations** — staggered fade-in on dashboard, activities, dispatch, plan, and chat pages. Plan replacement uses dim → drop → check-pop → re-entrance sequence. SSE generation progress animates step-by-step.
- **Pace line draw-in** — activity detail chart animates the pace line on mount.

### Design (DESK series)
- **DESK-001/002** — keyboard and screen-reader accessible day-toggle buttons and voice-card disclosure pattern
- **DESK-003** — day toggle button height increased from 28 px to 36 px (easier tap target)
- **DESK-004/008** — consistent focus rings across all interactive elements; field labels readable at small viewport
- **DESK-005** — "Reset Context" action visually subordinated to "Cancel Subscription"
- **DESK-006/007/009** — pointer cursor on clickable elements, save-feedback inline toast, sidebar open/close animation
- Share card layout and onboarding polish; landing page value-prop copy and mobile breakpoints

### Bug fixes
- **Settings prefs re-seed** — `prefSeeded` was being reset on every save, causing preferences to silently re-seed from defaults on next load. Now preserved across saves.
- **Stats strip font overflow** — TIME column truncated `h:mm:ss` at 24 px; reduced to 22 px.

### Infrastructure
- **`POST /share-image`** — new FastAPI endpoint (auth required); accepts PNG upload, returns `{ token: UUID }`, 5 MB cap, 1 h TTL in-memory store with lazy cleanup.
- **`GET /share-image/{token}`** — no-auth public endpoint; returns stored PNG as `image/png`.
- **`/api/share-image/[token]`** — Next.js proxy route; phone fetches image through port 3000, proxy calls FastAPI server-side (avoids CORS and firewall issues).
- **`/api/local-ip`** — server-side route returns host LAN IP filtered by interface name; respects `HOST_IP` env override.
- **`docker-compose.yml`** — web service migrated to `network_mode: host`; `API_URL` changed from `http://api:8000` to `http://localhost:8000` (Docker DNS doesn't resolve under host networking).

---

## v2.0.1 — 2026-05-23

Security hardening and infrastructure reliability fixes. No new user-facing features.

### Security
- **Signed session cookies** — session cookie is now signed with `itsdangerous.URLSafeTimedSerializer` using `SECRET_KEY`; unsigned or tampered cookies are rejected with 401
- **FERNET_KEY required at startup** — removed ephemeral dev key fallback; API refuses to start without a persistent key set, preventing silent token corruption across restarts
- **Port hardening** — Postgres (`5432`) and Ollama (`11434`) Docker ports now bound to `127.0.0.1` only; not reachable from the network

### Bug fixes
- **Ollama unreachable from API container** — Ollama 0.21.0 defaults to binding `127.0.0.1` inside its container; added `OLLAMA_HOST=0.0.0.0` to expose it on the Docker network
- **HTML entity apostrophes** — `&#39;` in JSX text nodes rendered as literal text instead of `'` on the activity detail page (Dispatch.tsx)
- **Activity name prompt injection** — activity names are now truncated to 100 chars and whitespace-normalised before inclusion in LLM prompts

### Infrastructure
- **Ollama image pinned** to `ollama/ollama:0.21.0` (was `latest`)
- Settings consolidated into a single `pydantic_settings.BaseSettings` class
- `.gstack/` added to `.gitignore`

---

## v2.0.0 — 2026-05-17

v2 is a complete overhaul. The foundation from v1 is intact — Strava OAuth, activity sync, post-run analysis, weekly plan generation, Pak Har chat — but almost everything around it has been rebuilt or extended.

---

### What's new

#### Tabloid redesign
All five pages (dashboard, activities, dispatch, plan, chat, settings, landing) now use a newspaper aesthetic — Abril Fatface headlines, Lora body text, Space Mono for numbers, Work Sans for labels. Dark mode (Reading Light) available from Settings. No CSS framework change — Tailwind v4 throughout, redesigned from scratch with new design tokens.

#### Dashboard restructured as a weekly hub
`/dashboard` now shows: Pak Har's weekly review in "Today's Lead", this week's stats (km, runs, time on feet), today's scheduled session, last run snapshot. `/activities` is its own paginated page with a standalone route.

#### Weekly review
`POST /review/generate` produces Pak Har's assessment of the week — planned vs actual training load, patterns, one concrete adjustment. Auto-generated every Sunday at 20:00 WIB if enabled. Shows on dashboard with a headline and verdict tag. Refresh at any time.

#### Onboarding and user preferences
First-time users are asked: weekly km capacity, available training days, biggest struggle. Extended in v2 with: goal event (general fitness, 5K, 10K, half marathon, marathon, ultra), race date, resting HR, max HR. All preferences flow into every Pak Har prompt — plan generation, post-run analysis, chat, weekly review.

#### Coach calibration — HR zones, RPE, cardiac drift, efficiency factor
- **HR zones** use the Karvonen formula calibrated to user-supplied RHR and MHR. MHR falls back to auto-detected (highest observed in activity history) then to 185 bpm.
- **Zone distribution** is calculated from per-second Strava streams when available, falling back to per-km splits — exact, not averaged.
- **RPE** (1–10) can be submitted after any run. Pak Har cross-references it against HR zone and splits and names mismatches directly.
- **Cardiac drift** is pre-computed per run: HR climbing while pace holds is flagged as dehydration or aerobic ceiling breach.
- **Efficiency factor** (speed per heartbeat) is tracked vs the last 4 comparable runs. A >3% decline signals fatigue accumulation.

#### High-resolution activity data (Strava streams)
Strava's streams API replaces the per-km `splits_metric` endpoint as the primary data source. Each activity stores up to 500 data points (time, distance, velocity, HR, cadence, altitude, grade, GPS). Used for: smooth pace chart, per-second HR zone calculation, elevation profile, and future route map.

#### Plan improvements
- **Week-aware generation** — the system resolves whether to target the current week or next week before generating. Rule: Saturday/Sunday → always next week; Mon–Fri with any run already this week → next week; Mon–Fri with no runs yet → this week. Surfaced to the user before they commit.
- **Plan realization** — each plan day shows a REALIZATION column with matched activity actuals and a Pak Har verdict (ON PLAN, PACED POORLY, FADED LATE, etc.).
- **Goal-aware periodization** — plan generation reads goal event and race date. Phases: base building (≥8 weeks out), sharpening (2–7 weeks), taper (<2 weeks), post-race recovery.
- **Replace confirmation** — generating a plan for a week that already has an active plan shows a confirmation modal before overwriting.

#### SSE progress streaming
Three endpoints now stream real-time progress instead of blocking until completion:
- `POST /activities/{id}/analyze` — 5 stages: pulling splits → reading zones → checking history → writing dispatch → filing verdict
- `POST /plan/generate` — 5 stages: reading last four weeks → checking adherence → assembling signals → drafting → filing
- `POST /review/generate` — 5 stages: counting runs → reading zones → checking last week → writing assessment → filing headline

All three yield the same event format: `progress` (step label + elapsed ms), `complete` (result payload), `error` (message). The UI renders a live step strip with elapsed timer during generation and streams the final text token-by-token.

#### Chat context
Pak Har's chat context now includes: active training plan (all 7 days), most recent weekly review, user RHR and MHR, goal event and race date. He can answer "what am I supposed to run today?" from actual plan data.

#### Auto-delivery
Two scheduled jobs via APScheduler:
- Weekly plan generated every Monday at 05:00 WIB (opt-in, default on)
- Weekly review generated every Sunday at 20:00 WIB (opt-in, default on)

Both can be toggled independently from Settings → Delivery Preferences.

#### Context reset
`DELETE /coach/reset` wipes all AI-generated content in one transaction: chat messages, plans, reviews, and analysis fields on all activities. Activity records themselves are preserved. Two-step confirmation UI in Settings.

#### Strava connected screen
After OAuth completes, users land on `/auth/connected` — a rubber-stamp animation — before being routed to the dashboard.

#### Settings page
`/settings` (The Desk) exposes: subscriber record (read-only), coach voice level (gentle / standard / unfiltered), delivery preferences (two toggles), Runner's Brief (editable preferences), account stats, Strava disconnect, full context reset.

---

### Technical changes

#### Infrastructure
- **PostgreSQL replaces SQLite** across all environments — dev and prod now use the same database engine. Alembic migrations run on API startup (`alembic upgrade heads`).
- **Docker Compose** now requires `DATABASE_URL` and `OLLAMA_MODEL` in `apps/api/.env` (previously undocumented).
- New one-shot `ollama-init` container pulls the model on first `docker compose up`.

#### Database
- 15 Alembic migrations applied across v2 (vs 1 in v1).
- New columns on `User`: `available_days` (JSON), `resting_hr`, `max_hr`, `max_hr_observed`, `goal_event`, `race_date`, `auto_plan_enabled`, `auto_review_enabled`, `coach_voice`.
- New columns on `Activity`: `verdict_short`, `verdict_tag`, `tone`, `splits` (JSON), `streams` (JSON), `rpe`.
- New columns on `WeeklyReview`: `headline`, `verdict_tag`, `tone`.
- Composite index added on `(user_id, activity_date)`.

#### Security
- **CSRF protection** — OAuth flow now generates a `secrets.token_urlsafe(32)` state token, stores it in a short-lived `oauth_state` httpOnly cookie, and validates with `hmac.compare_digest` on callback.
- **Session cookie** — `secure` flag and 30-day `max_age` added. `COOKIE_SECURE=false` in `.env` disables the secure flag for local HTTP development.
- **Rate limiting** extended to `GET /insights` (was unguarded). Shared 20 req/60s window across all Ollama-backed endpoints.
- **Strava `sport_type`** — filter now checks both `sport_type` and deprecated `type` field for forward compatibility.
- **Timezone-aware datetimes** — all `datetime.utcnow()` calls replaced with `datetime.now(timezone.utc)`.
- **SQLAlchemy lazy loading** — all relationships changed from `lazy="selectin"` (unbounded eager load) to `lazy="raise"` (explicit load required).

---

### API changes

#### New endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/user/onboarding` | Save/update user preferences |
| `GET` | `/user/me` | User profile + computed stats |
| `PATCH` | `/activities/{id}/rpe` | Submit RPE (1–10) for a run |
| `POST` | `/activities/{id}/plan-verdict` | Stateless plan vs actual verdict |
| `GET` | `/plan/next-target` | Preview target week before generating |
| `POST` | `/review/generate` | Generate weekly review (SSE) |
| `GET` | `/review/current` | Retrieve most recent weekly review |
| `GET` | `/insights` | 6-week trend stats + Pak Har commentary |
| `DELETE` | `/coach/history` | Wipe chat messages |
| `DELETE` | `/coach/reset` | Full AI context reset |

#### Changed endpoints
| Endpoint | Change |
|---|---|
| `GET /activities` | Response changed from `Activity[]` to `{ items, total, page, per_page }` |
| `POST /activities/{id}/analyze` | Now returns `text/event-stream` (SSE) instead of JSON |
| `POST /plan/generate` | Now returns `text/event-stream` (SSE) instead of JSON |
| `POST /review/generate` | Now returns `text/event-stream` (SSE) instead of JSON |

---

### Bug fixes

26 bugs filed and resolved across the v2 development cycle. Selected notable fixes:

- **CSRF state not validated** — OAuth callback accepted any `state` parameter without checking it against the stored `oauth_state` cookie (BUG-014)
- **Session cookie missing security flags** — `secure` flag and `max_age` were not set (BUG-013)
- **Pak Har's voice absent from plan-verdict prompt** — verdict stamps could use any language; voice rules now enforced (BUG-002)
- **GET /insights unguarded** — Ollama was called without rate limiting on every insights request (BUG-010)
- **Athlete ID null guard silently failing** — `str(None)` produced `"None"` instead of raising (BUG-015)
- **User message double-injected** — message appeared in both the system prompt and the user turn (BUG-016)
- **Landing page swallowed auth error params** — `?error=` from Strava OAuth redirects was silently ignored (BUG-026)

---

### Test coverage

| Layer | Framework | Tests | Status |
|---|---|---|---|
| Backend | pytest | 177 | All passing |
| Frontend | Vitest | 168 | All passing |
| **Total** | | **345** | **All passing** |

E2E coverage (Playwright): auth, onboarding, dashboard, activities, plan (including week-switch flows), coach, settings, weekly review.

---

### Deferred to v3

- **Route map** — `streams.latlng` is collected and stored per activity; the map UI is not built yet
- **Email digest** — adds SMTP dependency; against self-hosted spirit unless opt-in
- **Multi-user / team mode** — large architectural change
- **Redis rate limiter** — only needed for horizontal scaling; in-memory limiter is sufficient for single-instance
- **Activity filtering UI** — server-side filtering and pagination is implemented in the API (`GET /activities` supports `date_from`, `date_to`, `min_distance`, `max_distance`, `search`); the frontend currently shows all activities without filter controls

---

## v1.0.0 — 2026-04-18

Initial release.

- Strava OAuth login and activity sync (last 90 days)
- Post-run analysis via Ollama — effort, trends, what worked, what to fix
- Weekly 7-day training plan generation
- Chat with Pak Har (streaming SSE, rate-limited)
- Docker Compose self-hosting with auto model pull
