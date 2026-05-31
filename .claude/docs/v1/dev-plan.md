# Old Legs — Development Plan

## Current Sprint
**v1.0.0 Shipped — 2026-04-18**

All features built, tested, and manually verified end-to-end. 51/51 backend tests passing. 28/28 E2E tests passing. OAuth flow, plan generation, chat, and activity analysis all confirmed working. Tagged and shipped.

**Post-ship deployment fixes (2026-04-18):**
- Pak Har system prompt: added explicit rule against ending every response with the philosophy sign-off phrase
- `docker-compose.yml`: removed obsolete `version` attribute; fixed Ollama healthcheck to use `ollama list` (curl not available in image) + added `start_period: 30s`; added `ollama-init` service to auto-pull model; added `env_file` for API service; split web env vars into `NEXT_PUBLIC_API_URL` (browser) and `API_URL` (server-side) — see DEC-010, DEC-011
- `README.md`: rewrote self-hosting steps with step-by-step Strava app setup, automated model pull, Ollama login instructions; removed `.env.example` references

## Task Board

### 🔄 In Progress
- None


### ✅ Done

**Phase 1 — Backend Foundation**
- [x] TASK-001: Scaffold FastAPI project structure + Docker setup → Backend — completed 2026-04-11
- [x] TASK-002: DB models (User, Activity, TrainingPlan, ChatMessage) + Alembic → Backend — completed 2026-04-11
  - Models: `apps/api/models/user.py`, `activity.py`, `training_plan.py`, `chat_message.py`
  - Schemas: `apps/api/schemas/user.py`, `activity.py`, `training_plan.py`, `chat_message.py`
  - Encryption: `apps/api/services/encryption.py` (Fernet token encryption)
- [x] TASK-003: Strava OAuth flow (/auth/strava + /auth/strava/callback) → Backend — completed 2026-04-11
  - `apps/api/services/strava.py`, `apps/api/routers/auth.py`
  - Session cookie (session_user_id httpOnly) set on successful OAuth callback
  - Callback redirects browser to FRONTEND_URL/dashboard (fixed 2026-04-17)
- [x] TASK-004: Activity sync pipeline → Backend — completed 2026-04-16
  - `apps/api/dependencies.py` — get_current_user FastAPI dependency
  - `apps/api/routers/activities.py` — GET /activities (syncs on load) + GET /activities/{id}
- [x] TASK-005: Pak Har system prompt → Backend — completed 2026-04-11
  - `apps/api/prompts/pak_har.py` — full persona, voice rules, context injection
- [x] TASK-006: Ollama integration + /coach/chat endpoint (streaming) → Backend — completed 2026-04-16
  - `apps/api/services/ollama.py` — build_strava_context, stream_chat (SSE)
  - `apps/api/services/rate_limiter.py` — 20 req/60s per user
  - `apps/api/routers/coach.py` — POST /coach/chat with streaming + message persistence
- [x] TASK-007: Post-run analysis endpoint (/activities/{id}/analyze) → Backend — completed 2026-04-17
  - POST /activities/{id}/analyze — calls Ollama, persists analysis, returns JSON
- [x] TASK-008: Weekly plan generation → Backend — completed 2026-04-17
  - `apps/api/services/plan.py` — generate_plan_with_ollama, get_current_plan
  - `apps/api/routers/plan.py` — POST /plan/generate + GET /plan/current
  - `apps/api/prompts/pak_har.py` — PLAN_PROMPT added

**Phase 2 — Design System**
- [x] TASK-009: Design tokens + globals.css → UX — completed 2026-04-16
  - `apps/web/src/app/globals.css` — 9 color tokens, typography, radius, shadows
  - `.claude/docs/ux-notes.md` — full design spec for all pages
- [x] TASK-010: Core UI components (Button, Card, Badge, Spinner, Avatar) → UX — completed 2026-04-17
  - `apps/web/src/components/ui/` — all 5 components + barrel `index.ts`
- [x] TASK-011: Layout components (Sidebar, TopBar, BottomNav, PageWrapper) → UX — completed 2026-04-17
  - `apps/web/src/components/layout/` — responsive shell, active route highlighting, mobile bottom nav
- [x] TASK-012: Activity components (StatGrid, PaceChart) → UX — completed 2026-04-17
  - `apps/web/src/components/activity/StatGrid.tsx` — 2×2+ stat grid, monospace numbers, null HR handled
  - `apps/web/src/components/activity/PaceChart.tsx` — placeholder (recharts not installed)
- [x] TASK-013: Coach components (ChatBubble, ChatInput, AnalysisBlock) → UX — completed 2026-04-17
  - `apps/web/src/components/coach/` — plain text bubbles, auto-resize input, left-border analysis block
- [x] TASK-014: WeeklyPlanGrid component → UX — completed 2026-04-17
  - `apps/web/src/components/plan/WeeklyPlanGrid.tsx` — 7-day grid, today highlighted, mobile stack
- [x] TASK-015: Page layout specs in docs/ux-notes.md → UX — completed 2026-04-16 (part of TASK-009)

**Phase 3 — Frontend**
- [x] TASK-016: Next.js scaffold + Tailwind + folder structure → Frontend — completed 2026-04-16
- [x] TASK-017: Strava OAuth callback page + session handling → Frontend — completed 2026-04-17
  - `apps/web/src/app/page.tsx` — landing page + ConnectStravaButton
  - Full OAuth flow working end-to-end
- [x] TASK-018: API client (lib/api.ts) + TypeScript types → Frontend — completed 2026-04-17
  - `apps/web/src/lib/api.ts` — apiFetch, all endpoints, SSE streamChat
  - `apps/web/src/types/api.ts` — User, Activity, TrainingPlan, PlanDay, ApiError
- [x] TASK-019: Dashboard page → Frontend — completed 2026-04-17
  - `apps/web/src/app/dashboard/page.tsx` — React Query, skeletons, empty state, 401 redirect
  - `apps/web/src/components/activity/ActivityCard.tsx` — run card with monospace stats
  - `apps/web/src/lib/formatters.ts` — formatPace, formatDuration, formatDate, formatDistance
- [x] TASK-020: Activity detail page + analysis UI → Frontend — completed 2026-04-17
  - `apps/web/src/app/activities/[id]/page.tsx` — StatGrid + AnalysisBlock, 401 redirect, analyze trigger
- [x] TASK-021: Weekly plan page → Frontend — completed 2026-04-17
  - `apps/web/src/app/plan/page.tsx` — WeeklyPlanGrid, generate plan, Ollama loading state
- [x] TASK-022: Pak Har chat page (streaming) → Frontend — completed 2026-04-17
  - `apps/web/src/app/coach/page.tsx` — SSE streaming, Zustand store, blinking cursor, error handling
  - `apps/web/src/store/chat.ts` — Zustand store (messages + isStreaming)
- [x] TASK-023: Landing page (logged-out) → Frontend — completed 2026-04-17 (part of TASK-017)

**Phase 4 — QA**
- [x] TASK-024: Test infrastructure setup → SQA — completed 2026-04-16
- [x] TASK-025: Backend auth + activity tests → SQA — completed 2026-04-16
  - 18/18 tests passing
- [x] TASK-026: Pak Har voice audit → SQA — completed 2026-04-17
  - `.claude/docs/pak_har_voice_tests.md` — 10-scenario prompt battery + static audit
  - SYSTEM_PROMPT: PASS. PLAN_PROMPT: PASS with 2 minor recommendations.
- [x] TASK-027: Coach chat + plan tests → SQA — completed 2026-04-17
  - `apps/api/tests/test_coach.py` — auth, validation, Ollama errors, rate limit
  - `apps/api/tests/test_plan.py` — generate + current plan, auth, Ollama errors, 404
- [x] TASK-028: Frontend component tests → SQA — completed 2026-04-17
  - `apps/web/tests/components/` — ActivityCard, StatGrid, ChatBubble tests written
- [x] TASK-032: Vitest setup complete → Frontend — completed 2026-04-18
  - `apps/web/vitest.config.ts` — jsdom env, @/* alias, React plugin
  - `apps/web/tests/setup.ts` — @testing-library/jest-dom matchers
  - 18/18 tests passing: `npm test` in `apps/web/`
- [x] TASK-030: Security audit → SQA — completed 2026-04-17
  - `apps/api/tests/test_security.py` — auth guards, rate limits, user isolation, token encryption
- [x] TASK-029: E2E Playwright tests → SQA — completed 2026-04-18
  - `apps/web/playwright.config.ts` — Chromium, baseURL localhost:3000, webServer auto-start
  - `apps/web/tests/e2e/` — landing, auth guards, dashboard, coach (28/28 passing)
  - All API + Strava OAuth mocked via page.route() — no live backend needed
- [x] TASK-031: Strava disconnect endpoint → Backend — completed 2026-04-18
  - `DELETE /auth/strava` — clears tokens in DB, deletes session cookie, returns 200
  - User model token fields made nullable
  - `api-spec.md` updated with endpoint contract

**Post-Phase 4 fixes (2026-04-18):**
- All 4 failing tests resolved — 51/51 passing (see BUG-005, BUG-006 in bugs.md)
- `STRAVA_REDIRECT_URI` corrected to point at frontend `http://localhost:3000/auth/callback` (BUG-007)
- `apps/web/src/app/auth/callback/page.tsx` replaced with `route.ts` (Route Handler) — Server Components cannot set cookies (BUG-008, DEC-009)
- `ApiError` type + `apiFetch` updated to carry `status` code; all `isUnauthorized`/`isNotFound` helpers fixed to check `status` instead of detail string prefix (BUG-009)
- `WeeklyPlanGrid` day key lookup corrected to use `.toLowerCase()` — backend stores days lowercase, component was looking up title case (BUG-010)

**Infrastructure fixes (2026-04-17/18):**
- `main.py`: load_dotenv() on startup, Base.metadata.create_all() in lifespan
- `routers/auth.py`: POST /auth/strava accepts empty body; callback returns JSONResponse
- `config.py`: load_dotenv() added so env vars are available at import time

### 🔲 Backlog
None — all v1 tasks complete.

## Blockers
None.

## Test coverage
- Backend: **84%** overall (51/51 passing)
- E2E (Playwright): 28/28 passing
- Frontend unit: 18/18 passing
- Run backend: `cd apps/api && python -m pytest -v`
- Run frontend: `cd apps/web && npm test`
- Run E2E: `cd apps/web && npx playwright test`

## Build Sequence
Phase 1 → Phase 2 → Phase 3 → Phase 4 (sequential phases, parallel within)

---

## V2 Notes
> Things intentionally deferred. Read this before planning v2.

- **PaceChart / lap data:** `PaceChart.tsx` is a placeholder. No lap/split data in backend schema or frontend types. Full implementation requires: backend lap model + Strava lap sync + recharts install + chart component. Deferred to v2.

- **Dashboard vs. Runs split:** In v1, `/dashboard` is just the runs list. In v2 this should be split:
  - `/dashboard` → true summary view: weekly stats (total km, runs, time), last run snapshot, today's plan day, quick link to Pak Har
  - `/activities` → full paginated runs list (currently the dashboard)
  - The nav label "Dashboard" in v1 should probably just say "Runs" — but that's a v2 rename too.

---
*Orchestrator updates this file after each task completion.*
