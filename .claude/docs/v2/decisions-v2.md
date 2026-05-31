# Old Legs — Architectural Decisions Log v2

> Maintained by the **Orchestrator**. Agents read this before making changes that touch cross-cutting concerns.

---

## Carried over from v1 (still in effect)

| Decision | Summary |
|---|---|
| DEC-001 | SQLite for dev, PostgreSQL for prod via SQLAlchemy |
| DEC-002 | Fernet encryption for Strava tokens at rest |
| DEC-003 | httpOnly session cookie (`session_user_id`) over JWT |
| DEC-004 | Ollama only — no paid AI APIs, ever |
| DEC-005 | `OLLAMA_MODEL` must be set in `.env` — no hardcoded default, raises `RuntimeError` if missing |
| DEC-007 | In-memory rate limiter, 20 req/60s per user, shared window across Ollama-hitting endpoints |
| DEC-008 | Mid-stream Ollama errors delivered as `data: [ERROR] ...` SSE events, not HTTP codes |
| DEC-009 | OAuth callback is a Next.js Route Handler (`route.ts`), not a Server Component — only Route Handlers can set cookies |
| DEC-010 | Two web env vars: `NEXT_PUBLIC_API_URL=http://localhost:8000` (browser) and `API_URL=http://api:8000` (server-side) |
| DEC-011 | Ollama model pulled automatically via `ollama-init` one-shot container in Docker Compose |

---

## v2 Decisions

## DEC-015 — HR zones use Karvonen formula with derived MHR and default RHR
**Date:** 2026-04-19
**Context:** Initial HR zone implementation used fixed bpm thresholds based on a hardcoded MHR of 185. This produces wrong zones for anyone whose actual max HR differs significantly.
**Decision:** Zones now use the Karvonen formula (`zone = RHR + pct × (MHR − RHR)`). MHR is derived from the highest `max_hr` ever recorded across the user's synced activities (falls back to 185 if no HR data). RHR defaults to 60 bpm until the user provides their actual value via onboarding (TASK-102/116). `build_analysis_context()` accepts a `resting_hr` param ready to receive `user.resting_hr` once that field exists.
**Reason:** Karvonen is more physiologically accurate and accounts for individual fitness level. Wiring it to real user data is a one-line change once onboarding is built.

## DEC-013 — PostgreSQL replaces SQLite for all environments
**Date:** 2026-04-19
**Context:** Dev was using SQLite + `create_all()` which diverges from prod (PostgreSQL + Alembic). Schema changes silently broke Strava OAuth when `onboarding_completed` column was missing from the existing dev DB.
**Decision:** PostgreSQL is now the only supported database. `main.py` runs `alembic upgrade heads` on startup instead of `create_all()`. `docker-compose.yml` exposes Postgres on port 5432. `alembic/env.py` reads `DATABASE_URL` from environment, never from `alembic.ini`.
**Reason:** Dev/prod parity eliminates an entire class of "works on my machine" migration bugs.

## DEC-014 — `getActivities()` unwraps paginated response internally
**Date:** 2026-04-19
**Context:** TASK-107 changed `GET /activities` from a flat array to `{ items, total, page, per_page }`. All callers (`useDashboard`, activities page) expected a plain array.
**Decision:** `getActivities()` in `api.ts` unwraps `.items` and returns `Activity[]`. A separate `getActivitiesPaginated()` will be added when pagination UI is built.
**Reason:** One change fixes all callers; avoids touching hooks, pages, and types that aren't ready for pagination yet.

## DEC-012 — User preferences stay on the `User` model, no separate table
**Date:** 2026-04-19
**Context:** PRD-v2 F2 described a `user_preferences` table, but v1 already put `weekly_km_goal`, `days_available`, and `biggest_struggle` directly on `User`. A separate table for 3–5 fields is premature normalization.
**Decision:** Keep preferences as columns on `User`. TASK-101 audits what v2 needs and adds missing columns via a new Alembic migration if required.
**Reason:** Simpler schema, no join needed, consistent with existing v1 model.

---

## Template

```markdown
## DEC-[N] — [Short title]
**Date:** YYYY-MM-DD
**Context:** Why this decision was needed.
**Decision:** What was decided.
**Reason:** Why this approach over alternatives.
```
