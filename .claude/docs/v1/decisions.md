# Old Legs — Architectural Decisions Log

> Maintained by the **Orchestrator**. Agents read this before making changes that touch cross-cutting concerns.

---

## DEC-001 — SQLite for development, PostgreSQL for production
**Date:** 2026-04-11
**Context:** Needed a DB that requires zero setup for local self-hosting.
**Decision:** SQLite in dev (DATABASE_URL=sqlite:///./oldlegs.db), PostgreSQL in prod via the same SQLAlchemy connection string.
**Reason:** Zero-friction local setup. SQLAlchemy abstracts the difference. Alembic migrations work against both.

---

## DEC-002 — Fernet encryption for Strava tokens
**Date:** 2026-04-11
**Context:** Strava OAuth tokens stored in the DB must not be plaintext.
**Decision:** Encrypt `strava_access_token` and `strava_refresh_token` at rest using Fernet (symmetric encryption). Key set via `FERNET_KEY` env var. Ephemeral key generated in dev if unset — with a loud warning.
**Reason:** Privacy-first requirement. Fernet is simple, battle-tested, and needs no extra dependencies beyond `cryptography`.

---

## DEC-003 — Session cookie (httpOnly) over JWT
**Date:** 2026-04-11
**Context:** Needed an auth mechanism that works with Next.js App Router server components and doesn't require JS to read the token.
**Decision:** httpOnly session cookie (`session_user_id`) set on successful OAuth callback. No JWT.
**Reason:** httpOnly cookies can't be read by JS (XSS protection), work transparently with `fetch` and browser navigation, and require no token refresh logic for this use case.

---

## DEC-004 — Ollama only, no cloud AI APIs
**Date:** 2026-04-11
**Context:** Product requirement — must run at zero cost on any machine.
**Decision:** All LLM calls go through Ollama (`http://localhost:11434` by default). No OpenAI, Anthropic, or any paid API in the runtime app.
**Reason:** Core product promise: free, self-hosted, no vendor lock-in.

---

## DEC-005 — OLLAMA_MODEL configurable via .env, no hardcoded default
**Date:** 2026-04-18
**Context:** Default model was hardcoded as `"llama3"` in source. Users on different setups (e.g. cloud-based Ollama) had to change source code to switch models.
**Decision:** `OLLAMA_MODEL` must be set in `.env`. No fallback default in code. `settings.get_ollama_model()` raises a clear `RuntimeError` if the value is missing.
**Reason:** Forces explicit configuration. Avoids silent failures where the wrong model is used because someone forgot to set the env var.

---

## DEC-006 — PaceChart deferred to v2
**Date:** 2026-04-18
**Context:** `PaceChart.tsx` was a placeholder. Full implementation requires backend lap data model, Strava lap sync, recharts install, and chart component — significant scope for a v1 feature not yet designed.
**Decision:** Deferred to v2. Placeholder remains in codebase but is not used on any page.
**Reason:** v1 scope is general fitness coaching, not lap-level analysis. The StatGrid covers all aggregate metrics needed. Lap charts are a v2 enhancement.

---

## DEC-007 — In-memory rate limiter (shared window across endpoints)
**Date:** 2026-04-16
**Context:** Ollama can be slow and expensive (CPU/GPU). Need to prevent abuse without adding Redis or another service.
**Decision:** Simple in-memory sliding window rate limiter (20 req/60s per user). Shared across `/coach/chat`, `/activities/{id}/analyze`, and `/plan/generate`.
**Reason:** Zero dependencies. Sufficient for single-instance self-hosted deployment. Not suitable for multi-instance — documented as a v2 concern if horizontal scaling is ever needed.

---

## DEC-008 — SSE error events instead of HTTP error codes for mid-stream errors
**Date:** 2026-04-18
**Context:** Once a `StreamingResponse` starts, HTTP status codes can't be changed. Raising `HTTPException` inside the generator crashed the ASGI server.
**Decision:** Ollama errors that occur mid-stream are delivered as `data: [ERROR] <message>\n\n` SSE events. Pre-stream errors (auth, rate limit) still use HTTP status codes.
**Reason:** Correct SSE semantics. Frontend already handles `[ERROR]` events. See BUG-001.

---

## DEC-010 — Two separate API URL env vars for Docker deployment
**Date:** 2026-04-18
**Context:** `NEXT_PUBLIC_API_URL` is baked into the client-side bundle at build time. When set to `http://api:8000` (Docker internal hostname), the browser couldn't resolve it — causing all client-side API calls to fail with a network error. But the Next.js server (running inside Docker) also needs to reach the API, and `http://localhost:8000` doesn't work there.
**Decision:** Two env vars in the web service:
- `NEXT_PUBLIC_API_URL=http://localhost:8000` — used by browser (client-side fetches)
- `API_URL=http://api:8000` — used by Next.js Route Handlers server-side (e.g. auth callback)
**Reason:** Browser and server have different network contexts in Docker. The split is the standard Next.js pattern for this constraint.

---

## DEC-011 — Ollama model pulled automatically via init container
**Date:** 2026-04-18
**Context:** Users had to manually run `docker exec -it oldlegs_ollama ollama pull gemma4:31b-cloud` after first start — easy to miss and breaks the app silently.
**Decision:** Added `ollama-init` service to `docker-compose.yml` — a one-shot container (`restart: "no"`) that depends on `ollama` being healthy and runs `ollama pull gemma4:31b-cloud`. Model pull happens automatically on `docker compose up`.
**Reason:** Self-hosting should be a single command. Manual post-start steps are a barrier to entry.

---

## DEC-009 — OAuth callback implemented as Next.js Route Handler, not Server Component
**Date:** 2026-04-18
**Context:** Strava redirects the user's browser to `STRAVA_REDIRECT_URI` after auth. Initial implementation used a Server Component (`page.tsx`) but Next.js Server Components cannot call `cookies().set()` — only Route Handlers and Server Actions can mutate cookies. Also, `STRAVA_REDIRECT_URI` was incorrectly set to the backend URL, bypassing the frontend entirely.
**Decision:** `apps/web/src/app/auth/callback/route.ts` (Route Handler) handles the browser redirect. It calls the backend `GET /auth/strava/callback?code=...` server-side, extracts the session cookie from the response, sets it on the browser response, then redirects to `/dashboard`. `STRAVA_REDIRECT_URI` must always point at the frontend (`http://localhost:3000/auth/callback`), never the backend.
**Reason:** Route Handlers are the correct Next.js App Router primitive for OAuth callbacks — they can set cookies and perform redirects before sending the response to the browser.
