# Old Legs — Bug Log

Active bugs filed by SQA. Agents remove `# BUG:` comments from source when fixed and update status here.

---

## BUG-001 — HTTPException raised inside StreamingResponse generator crashes ASGI
**Severity:** High
**Agent:** Backend
**Found in:** `apps/api/routers/coach.py` — `event_generator()`
**Description:** Once a `StreamingResponse` object is returned by the route handler, headers are already committed. Raising `HTTPException` inside the async generator caused Starlette to crash with `RuntimeError: Caught handled exception, but response already started.`
**Status:** Fixed 2026-04-18 — errors are now yielded as `data: [ERROR] ...\n\n` SSE events instead of raising `HTTPException`.

---

## BUG-002 — UnboundLocalError: ollama_model referenced before assignment
**Severity:** High
**Agent:** Backend
**Found in:** `apps/api/services/ollama.py` — `stream_chat()`
**Description:** After refactoring OLLAMA_MODEL from a module-level constant to a local variable, the `payload` dict was constructed before `ollama_model = settings.get_ollama_model()` was called, causing `UnboundLocalError` at runtime.
**Status:** Fixed 2026-04-18 — assignment moved above the payload dict.

---

## BUG-003 — Settings reads env vars before load_dotenv() runs
**Severity:** Medium
**Agent:** Backend
**Found in:** `apps/api/config.py` — `Settings` class body
**Description:** `Settings` class attributes call `os.getenv()` at class-body evaluation time (module import). If any module imported `config` before `main.py`'s `load_dotenv()` had run, all values would be empty strings — causing `get_ollama_model()` to raise `RuntimeError` even with a valid `.env` file.
**Status:** Fixed 2026-04-18 — `load_dotenv()` added at the top of `config.py` itself, making env loading self-contained and import-order-independent.

---

## BUG-004 — test_oauth_callback_success: 302 redirect vs expected 200 JSON
**Severity:** Medium
**Agent:** Backend / SQA
**Found in:** `apps/api/routers/auth.py` — `strava_oauth_callback()`
**Description:** Callback handler returned `RedirectResponse(302)` but frontend (`apps/web/src/app/auth/callback/page.tsx`) calls the endpoint via `fetch()` and expects a JSON response. The 302 broke the frontend OAuth flow and the test.
**Status:** Fixed 2026-04-18 — changed to `JSONResponse` with `Set-Cookie` header. Matches api-spec.md contract. Note: this fix exposed BUG-008 (Server Component cookie limitation).

---

## BUG-005 — test_coach.py Ollama error tests expect HTTP 503/504 but get SSE error events
**Severity:** Low (test design issue)
**Agent:** SQA
**Found in:** `apps/api/tests/test_coach.py` — `TestCoachChatOllamaErrors`
**Description:** Tests `test_ollama_unreachable_returns_503` and `test_ollama_timeout_returns_504` assert HTTP status codes 503/504. But per DEC-008, once SSE streaming starts, errors are delivered as `data: [ERROR] ...\n\n` events — not HTTP error codes. Also had wrong patch target (`services.ollama.stream_chat` instead of `routers.coach.stream_chat`).
**Status:** Fixed 2026-04-18 — patch target corrected, assertions updated to `200 + [ERROR] in body`.

---

## BUG-006 — test_strava_status_requires_auth: endpoint returns 200 not 401 for unauthenticated
**Severity:** Low (test design issue)
**Agent:** SQA
**Found in:** `apps/api/tests/test_security.py` — `TestUnauthenticatedAccess::test_strava_status_requires_auth`
**Description:** Test asserts `GET /auth/strava/status` returns 401 when unauthenticated. The endpoint is intentionally designed to return `{"connected": false, ...}` with 200 — it's a status check, not a protected resource.
**Status:** Fixed 2026-04-18 — test updated to assert `200 + connected: false`.

---

## BUG-007 — STRAVA_REDIRECT_URI pointed at backend instead of frontend
**Severity:** High
**Agent:** Config / Backend
**Found in:** `apps/api/.env` — `STRAVA_REDIRECT_URI`
**Description:** `STRAVA_REDIRECT_URI` was set to `http://localhost:8000/auth/strava/callback` (backend). Strava redirected the user's browser directly to the backend, which returned raw JSON instead of completing the frontend OAuth flow.
**Status:** Fixed 2026-04-18 — changed to `http://localhost:3000/auth/callback` (frontend Route Handler). See DEC-009.

---

## BUG-008 — auth/callback page.tsx (Server Component) cannot call cookies().set()
**Severity:** High
**Agent:** Frontend
**Found in:** `apps/web/src/app/auth/callback/page.tsx` — line 118
**Description:** Next.js Server Components cannot call `cookies().set()`. The call threw `Error: Route /auth/callback used "cookies" with "set"... not allowed in Server Components`. This is a Next.js App Router constraint — cookie mutation is only allowed in Route Handlers and Server Actions.
**Status:** Fixed 2026-04-18 — replaced `page.tsx` with `route.ts` (Route Handler). See DEC-009.

---

## BUG-009 — ApiError status detection fails when backend returns JSON error body
**Severity:** High
**Agent:** Frontend
**Found in:** `apps/web/src/lib/api.ts` — `apiFetch()`; `apps/web/src/app/plan/page.tsx`, `dashboard/page.tsx`, `activities/[id]/page.tsx`
**Description:** `apiFetch` threw `{ detail: string }` without a `status` field. When the backend returned a JSON body (e.g. `{"detail": "No active training plan found..."}`), `apiFetch` replaced the default `"API error 404"` string with the backend message. All pages checked for 401/404 by calling `.startsWith('API error 401/404')` on `detail`, so the checks always failed — every 404/401 with a JSON body was treated as a generic error. Plan page showed "Could not load the plan" instead of the empty-state/generate UI.
**Status:** Fixed 2026-04-18 — `ApiError` type now includes `status?: number`; `apiFetch` and `streamChat` include `status: res.status` in thrown errors; all `isUnauthorized`/`isNotFound` helpers updated to check `apiErr?.status === 401/404`.

---

## BUG-010 — WeeklyPlanGrid renders empty cards due to day key case mismatch
**Severity:** High
**Agent:** Backend / Frontend
**Found in:** `apps/api/services/plan.py:86` + `apps/web/src/components/plan/WeeklyPlanGrid.tsx:93`
**Description:** Backend stores plan days with lowercase keys (`"monday"`, `"tuesday"`, ...) in `plan_data` and `pak_har_notes`. `WeeklyPlanGrid` iterates `DAY_ORDER = ['Monday', 'Tuesday', ...]` and looks up `plan.plan_data[dayName]` using title case — misses every time, so `planDay` is always `undefined` and all cards render empty.
**Status:** Fixed 2026-04-18 — component now looks up `plan.plan_data[dayName.toLowerCase()]` and `plan.pak_har_notes[dayName.toLowerCase()]`.

---

## Template

```markdown
## BUG-001 — [Short title]
**Severity:** Critical / High / Medium / Low
**Agent:** Backend / Frontend / UX
**Found in:** `apps/api/routers/activities.py` (line 42)
**Description:** What went wrong
**Steps to reproduce:**
1. ...
2. ...
**Expected:** What should happen
**Actual:** What actually happens
**Status:** Open / In Progress / Fixed
```
