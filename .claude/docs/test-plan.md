# Old Legs — Test Plan

**Last updated:** 2026-04-18  
**Status:** All test layers active — backend, frontend unit, and E2E.

---

## Backend Tests (pytest)

### Infrastructure
- Real SQLite in-memory DB per test — no mocking of DB layer
- External services (Strava, Ollama) mocked via `respx` and `unittest.mock.patch`
- Fixtures in `apps/api/tests/conftest.py`: `db_session`, `test_app`, `test_user`, `authenticated_client`, `test_activity`

### Test Files

| File | Coverage | Status |
|---|---|---|
| `test_auth.py` | Strava OAuth flow, callback, session cookie, disconnect | Passing (TASK-025, TASK-031) |
| `test_activities.py` | GET /activities, GET /activities/{id}, sync | Passing (TASK-025) |
| `test_coach.py` | POST /coach/chat — auth, validation, Ollama errors, rate limit | Written (TASK-027) |
| `test_plan.py` | POST /plan/generate, GET /plan/current — auth, Ollama errors, 404 | Written (TASK-027) |
| `test_security.py` | Auth guards on all endpoints, rate limit, user isolation, token encryption | Written (TASK-030) |

### Running backend tests

```bash
cd apps/api
pip install -r requirements.txt
pytest tests/ -v --cov=. --cov-report=term-missing
```

**Coverage target:** 80% minimum before v1 ship.

---

## Frontend Tests (Vitest + React Testing Library)

### Infrastructure Status: ✅ Set up (TASK-032)

- `apps/web/vitest.config.ts` — jsdom environment, `@/*` alias, React plugin, `setupFiles`
- `apps/web/tests/setup.ts` — `@testing-library/jest-dom` matchers
- Scripts in `package.json`: `npm test` (run once), `npm run test:coverage`

### Running frontend tests

```bash
cd apps/web
npm test
# or with coverage:
npm run test:coverage
```

### Test Files

| File | Coverage | Status |
|---|---|---|
| `tests/components/ActivityCard.test.tsx` | Renders stats, handles null HR | ✅ 6/6 passing (TASK-028) |
| `tests/components/StatGrid.test.tsx` | All 4 stats, missing HR shows "—" | ✅ 6/6 passing (TASK-028) |
| `tests/components/ChatBubble.test.tsx` | User/assistant alignment, plain text, timestamp | ✅ 6/6 passing (TASK-028) |

---

## Pak Har Voice Audit

See `.claude/docs/pak_har_voice_tests.md` for the full prompt battery and static audit.

**Static audit:** PASS (2026-04-17)  
**Live test against Ollama:** Not yet run

---

## E2E Tests (Playwright)

**Status:** ✅ Written and passing — 28/28 (TASK-029)

All Strava OAuth and API calls are mocked via `page.route()` — no live backend or Strava account needed.

### Running E2E tests

```bash
cd apps/web
npx playwright test
# or headed:
npx playwright test --ui
```

Playwright auto-starts `npm run dev` if no server is running (`webServer` in `playwright.config.ts`).

### Test Files

| File | Tests | Coverage |
|---|---|---|
| `tests/e2e/landing.spec.ts` | 5 | Heading, Connect Strava button, OAuth redirect mock, error states |
| `tests/e2e/auth.spec.ts` | 6 | 401 redirects on `/dashboard`, `/plan`; callback error handling |
| `tests/e2e/dashboard.spec.ts` | 7 | Page load, activity cards, empty state, 401 redirect, skeletons |
| `tests/e2e/coach.spec.ts` | 10 | Page load, chat input, send fires POST, SSE tokens render, rate limit error |

---

## Coverage Gaps

1. Live Pak Har voice audit not run against real Ollama model (static audit passed 2026-04-17)
2. `test_coach.py` streaming assertions are limited (TestClient + StreamingResponse has quirks)
3. No test for Strava token refresh flow (token expiry handling)
4. Backend coverage not formally measured — run `pytest --cov` and verify ≥80% before v1 ship
