# Old Legs — Development Plan v3

## Status
**Planning only. Not started.** v2 is the active development branch. v3 begins after v2 ship.

## V3 Scope

V3's headline feature is **race-specific training architecture** — the ability for runners with a specific race date and goal event (5k / 10k / half marathon / marathon / ultra) to get a real periodized multi-week training plan, not just week-by-week reactive coaching.

See `race-plan-architecture.md` for the full architectural breakdown and reasoning.

Other v3 candidates (not yet scoped):
- Route map visualization (deferred from v2 — `streams.latlng` enables this)
- Multi-race queueing
- Pace-target injection from `target_time`
- Adaptive periodization based on injury/illness signals

---

## Task Board

### 🔲 Backlog — Race Plan Architecture

> Full breakdown in `race-plan-architecture.md`. Tasks below are the planned implementation order. **None of these are started.**

**Phase A — Backend**
- [ ] TASK-V3-A1: `RacePlan` + `RacePlanWeek` data model + Alembic migration → Backend
- [ ] TASK-V3-A2: `services/race_plan.py` — template-based race plan generation (per Decision §1) → Backend
- [ ] TASK-V3-A3: `routers/race_plan.py` — `POST /race-plan/generate`, `GET /race-plan/current`, `POST /race-plan/regenerate`, `DELETE /race-plan/{id}` → Backend
- [ ] TASK-V3-A4: Inject `{race_plan_context}` into `PLAN_PROMPT`; modify `generate_plan_with_ollama` to read active `RacePlan` → Backend
- [ ] TASK-V3-A5: Drift detection — `compute_drift()` service + `needs_regeneration` flag on `RacePlan` → Backend
- [ ] TASK-V3-A6: SSE streaming wrapper for race plan generation (matches TASK-189 pattern) → Backend
- [ ] TASK-V3-A7: Document all new endpoints in `api-spec-v3.md` → Backend

**Phase B — Frontend**
- [ ] TASK-V3-B1: Onboarding + Settings — `target_time` field + "Build the arc" CTA → Frontend
- [ ] TASK-V3-B2: The Arc page (`/arc`) — full visual progression → Frontend
- [ ] TASK-V3-B3: Plan page header — "Week N of M · phase · target km · long run km" + "View arc" link → Frontend
- [ ] TASK-V3-B4: Drift surface — "On track / Drifting / Off plan" badge + "redraft the arc" CTA → Frontend
- [ ] TASK-V3-B5: SSE streaming UI for race plan generation → Frontend
- [ ] TASK-V3-B6: `RacePlan` + `RacePlanWeek` types in `src/types/api.ts` → Frontend
- [ ] TASK-V3-B7: Race plan API client functions in `src/lib/api.ts` → Frontend

**Phase C — UX**
- [ ] TASK-V3-C1: Visual language spec for the arc page — tabloid newspaper aesthetic, mobile responsive → UX
- [ ] TASK-V3-C2: Pak Har voice for race-specific copy — 6–8 new voice test cases → UX
- [ ] TASK-V3-C3: Onboarding tweaks — `target_time` input UX → UX
- [ ] TASK-V3-C4: Cancel the Arc affordance on Settings page → UX

**Phase D — SQA**
- [ ] TASK-V3-D1: Race plan generation tests — template validation, edge cases, volume safety → SQA
- [ ] TASK-V3-D2: Drift detection tests → SQA
- [ ] TASK-V3-D3: Plan generation integration tests — verify `RacePlan` context flows into weekly plan → SQA
- [ ] TASK-V3-D4: Pak Har voice tests for race-specific copy → SQA
- [ ] TASK-V3-D5: E2E race plan flow tests → SQA
- [ ] TASK-V3-D6: Security review — rate limiting + ownership guards on race plan endpoints → SQA

---

## Open Decisions

See `race-plan-architecture.md` § Open Decisions for the 7 items that need answers before implementation. Tentative recommendations are documented there; product owner sign-off required before TASK-V3-A1 begins.

---

## Build Sequence

```
Critical path: A1 → A2 → A3 → A4 → B2 → B3 → ship
Parallel: C1 + C2 + B6 + B7 can start anytime
Parallel: D tasks start after each A task ships
```

---

## Blockers

- Product owner decisions on 7 open architectural questions (see `race-plan-architecture.md`)
- v2 must ship and stabilize first

---

*Orchestrator updates this file as v3 work progresses.*
