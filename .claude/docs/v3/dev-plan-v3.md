# Old Legs — Development Plan v3

## Status
**Planning only. Not started.** v2 is the active development branch. v3 begins after v2 ship.

## V3 Scope

V3 has two headline features:

1. **Race-specific training architecture** — multi-week periodized plans for runners with a
   specific race date and goal event (5k / 10k / half marathon / marathon / ultra).
   See `race-plan-architecture.md` for the full architectural breakdown.

2. **Agentic Pak Har + MCP server** — Pak Har moves from single-shot LLM responses to a
   ReAct agent loop with tool calling. Same tools exposed as an MCP 1.0 server so external
   clients (Claude Desktop, Cursor) can query Old Legs data.
   See design doc: `~/.gstack/projects/nikkopg-old-legs/nikko-main-design-20260531-135114.md`

Other v3 candidates (not yet scoped):
- Route map visualization (deferred from v2)
- Multi-race queueing
- Pace-target injection from `target_time`
- Adaptive periodization based on injury/illness signals

---

## Build Sequence

The two headline features have one critical merge point: **TASK-V3-A4** (race plan context
injection into PLAN_PROMPT). In the original plan this was a string injection. With the
agentic architecture, it becomes a tool call instead. This means:

- A1–A3 ship first (race plan data models + endpoints) — no LLM changes, no dependency on agent
- E1–E3 build the agent infrastructure (tool validation, tool layer, agent loop)
- A4 is implemented AS a tool call (not string injection) — this is the merge point
- E4–E7 complete the agent + MCP server after A4 is proven

```
Critical path: A1 → A2 → A3 → A7 → E1 → E2 → E3 → A4(as tool) → E4 → E6 → B2 → B3 → ship
                                     ↑
                             A7 must precede B6+B7

Parallel tracks that can start immediately:
  C1 + C2 — no backend dependency
  E1 (gemma4 smoke test) — can start before A1
  B6 + B7 — start after A7 ships

SQA tracks:
  D tasks start after each A task ships
  F tasks start after each E task ships
```

---

## Task Board

### Phase A — Backend: Race Plan Data + Endpoints

> Full breakdown in `race-plan-architecture.md`. **None started.**

- [ ] TASK-V3-A1: `RacePlan` + `RacePlanWeek` data model + Alembic migration → Backend
- [ ] TASK-V3-A2: `services/race_plan.py` — template-based race plan generation → Backend
- [ ] TASK-V3-A3: `routers/race_plan.py` — generate, current, regenerate, delete endpoints → Backend
- [ ] TASK-V3-A4: Inject race plan context into plan generation — **implemented as tool call** (not PLAN_PROMPT string injection). Depends on E3. → Backend
- [ ] TASK-V3-A5: Drift detection + injury signal — `compute_drift()` + `needs_regeneration` flag → Backend
  - Volume drift: >20% off-target for 2+ consecutive weeks → flag
  - **Injury signal (simple):** 3+ consecutive unplanned rest days during Build phase → flag `needs_regeneration`. "Unplanned rest" = plan day type != 'rest' with no matching Activity on that date.
- [ ] TASK-V3-A6: SSE streaming for race plan generation → Backend
- [ ] TASK-V3-A7: `api-spec-v3.md` — document all new endpoints. **Ships after A3, before B6/B7 start.** → Backend
- [ ] TASK-V3-A8: `services/race_plan.py` — `calculate_training_paces(target_time_seconds, goal_event)` function. Returns `{easy, tempo, interval, long_run}` paces in min/km using Jack Daniels VDOT tables. Only called when `target_time` is set on `RacePlan`. Paces injected into `get_race_plan_week()` tool output and into `RacePlanWeek.notes` batch prompt. → Backend

### Phase B — Frontend: Race Plan UI

- [ ] TASK-V3-B1: Onboarding + Settings — `target_time` field + "Build the arc" CTA → Frontend
- [ ] TASK-V3-B9: Plan page + Arc page — display training paces from `target_time` when set. E.g. "Tempo: 5:41/km · Easy: 6:30/km" shown on Arc page week detail and Plan page header. Hidden when `target_time` is null. → Frontend
- [ ] TASK-V3-B2: The Arc page (`/arc`) — visual weekly progression → Frontend
- [ ] TASK-V3-B3: Plan page header — "Week N of M · phase · target km · long run km" → Frontend
- [ ] TASK-V3-B4: Drift surface — "On track / Drifting / Off plan" badge + "redraft the arc" CTA → Frontend
- [ ] TASK-V3-B5: SSE streaming UI for race plan generation → Frontend
- [ ] TASK-V3-B8: Agent tool call progress UI — render `progress_event` tokens from the agent loop as visible "thinking" steps in the chat interface (like Claude Code's tool call display). Users must see each tool call executing, not just a spinner. Required for long-running agent turns (analyze_run can take 30-100s on 31B model). → Frontend
- [ ] TASK-V3-B6: `RacePlan` + `RacePlanWeek` types in `src/types/api.ts` → Frontend
- [ ] TASK-V3-B7: Race plan API client functions in `src/lib/api.ts` → Frontend

### Phase C — UX: Race Plan Visual Language

- [ ] TASK-V3-C1: Visual language spec for the arc page — tabloid aesthetic, mobile responsive → UX
- [ ] TASK-V3-C2: Pak Har voice for race-specific copy — 6–8 new voice test cases → UX
- [ ] TASK-V3-C3: Onboarding tweaks — `target_time` input UX → UX
- [ ] TASK-V3-C4: Cancel the Arc affordance on Settings page → UX
- [ ] TASK-V3-C5: Pace display UX spec — how training paces appear on Arc page and Plan header when `target_time` is set. Keep Pak Har voice: "Your tempo is 5:41/km. That's what the plan is built around." No decoration. → UX

### Phase D — SQA: Race Plan Tests

- [ ] TASK-V3-D1: Race plan generation tests — template validation, edge cases, volume safety → SQA
  - long_run_km = 28% of weekly volume formula
  - starting_weekly_km < 15 km floor (minimum baseline)
  - pak_har_notes batch Ollama call: output has one sentence per week, correct count
  - Monday-snap logic for week_start_date
- [ ] TASK-V3-D2: Drift detection + injury signal tests → SQA
  - Volume drift: >20% under 1 week → no flag; >20% under 2+ weeks → flag
  - Volume drift: >20% over 2+ weeks → flag (overtraining)
  - Injury signal: 2 consecutive unplanned rest days → no flag
  - Injury signal: 3+ consecutive unplanned rest days in Build phase → flag
  - Injury signal: 3+ rest days in Base/Taper phase → no flag (expected easy days)
- [ ] TASK-V3-D3: Plan generation integration tests — verify race plan context flows into weekly plan → SQA
- [ ] TASK-V3-D4: Pak Har voice tests for race-specific copy → SQA
- [ ] TASK-V3-D5: E2E race plan flow tests → SQA
- [ ] TASK-V3-D6: Security review — rate limiting + ownership guards on race plan endpoints → SQA
- [ ] TASK-V3-D10: Pace calculation tests — `calculate_training_paces()` → SQA
  - 2:00 half marathon → easy ~6:30/km, tempo ~5:41/km (verify against Jack Daniels VDOT 42)
  - 4:00 marathon → correct training paces
  - `target_time` = None → returns None (paces not injected)
  - Very fast target (sub-15 min 5k) → paces clamped, no negative values
- [ ] TASK-V3-D7: SSE streaming test for race plan generation (A6)
- [ ] TASK-V3-D9: **CRITICAL** — race plan generation: Ollama batch notes call times out → RacePlan must be created with empty notes (not failed entirely). Test: mock Ollama timeout, verify RacePlan + RacePlanWeeks persisted with notes="" → SQA — verify progress events fire in correct order, partial failure returns error event → SQA
- [ ] TASK-V3-D8: Auth tests — POST /race-plan/generate by unauthenticated user (401), DELETE /race-plan/{id} by wrong user (403) → SQA

### Phase E — Backend: Agentic Architecture + MCP Server

> Full design at `~/.gstack/projects/nikkopg-old-legs/nikko-main-design-20260531-135114.md`.
> **None started. E1 can begin before A1.**

- [ ] TASK-V3-E1: Validate gemma4:31b-cloud tool calling — 20-line smoke test, 2 fake tools, confirm `tool_calls` response format → Backend
- [ ] TASK-V3-E2: `services/tools/` layer — 7 tool functions wrapping existing services. `update_plan_day` is a new function. `_tools.py` suffix to avoid import collision with existing service files → Backend
  - `runs_tools.py` — `get_recent_runs`, `search_activities`
  - `plan_tools.py` — `get_training_plan`, `update_plan_day` (new), `get_race_plan_week` (new — wraps RacePlan, depends on A1)
  - `analysis_tools.py` — `analyze_run` (nested Ollama call, non-streaming sub-call)
  - `hr_tools.py` — `get_hr_analysis`
  - `review_tools.py` — `get_weekly_summary`
  - `tools/__init__.py` — `TOOL_REGISTRY`, `TOOL_SCHEMAS` (OpenAI JSON Schema format), `TOOL_ERROR_MESSAGES`
- [ ] TASK-V3-E3: `services/agent.py` — `PakHarAgent` ReAct loop. `MAX_TOOL_ITERATIONS=5`. Streaming via existing `progress_event`/`token_event`/`complete_event`. Persists only user message + final assistant message to `ChatMessage` (tool messages not stored). → Backend
- [ ] TASK-V3-E4: `services/ollama.py` — add `ollama_tool_call()` (non-streaming JSON call, `stream: false`) + `OllamaToolResponse` dataclass. Distinct from existing `stream_chat()`. → Backend
- [ ] TASK-V3-E5: Update `SYSTEM_PROMPT` in `pak_har.py` — add `TOOL_DESCRIPTIONS` block after `--- END OF INTENT CLASSIFICATION ---` marker. Test Pak Har voice is unchanged. → Backend
- [ ] TASK-V3-E6: `routers/mcp.py` — MCP 1.0 server. `POST /mcp` (JSON-RPC 2.0), `GET /.well-known/mcp-server` (capabilities manifest). Raw JSON-RPC, no `mcp` library. Auth: session cookie internally, `MCP_API_KEY` env var for external clients. → Backend
- [ ] TASK-V3-E7: Spike — Claude Desktop manifest schema. Install Claude Desktop, connect to minimal FastAPI stub, confirm manifest fields before writing production mcp.py. → Backend
- [ ] TASK-V3-E8: `routers/coach.py` — wire `/coach/chat` to `PakHarAgent`. Endpoint signature unchanged. → Backend

### Phase F — SQA: Agentic Architecture Tests

- [ ] TASK-V3-F1: Unit tests for each tool in `services/tools/` — mock DB, verify output format → SQA
- [ ] TASK-V3-F2: Agent loop integration tests — mock Ollama, verify tool dispatch + fallback + iteration cap → SQA
- [ ] TASK-V3-F9: **CRITICAL** — `ollama_tool_call()` returns malformed JSON → must not KeyError. Test: mock `data["message"]` missing, verify graceful fallback (not 500) → SQA
  - MAX_TOOL_ITERATIONS cap reached → canned fallback message, no crash
  - analyze_run nested call timeout → TOOL_ERROR_MESSAGES fallback, loop continues
  - Unknown tool name in tool_calls → KeyError caught, TOOL_ERROR_MESSAGES default used
  - ollama_tool_call() returns empty tool_calls → streams final response correctly
- [ ] TASK-V3-F3: `/coach/chat` regression tests — existing test suite must pass unchanged → SQA
- [ ] TASK-V3-F4: MCP endpoint tests — tool listing, tool call, auth rejection → SQA
- [ ] TASK-V3-F7: Agent E2E tests (Playwright) — (1) "what was my longest run this month?" → tool call → correct data answer; (2) "make Thursday rest" → update_plan_day called → plan in DB updated → confirmation response → SQA
- [ ] TASK-V3-F8: Agent tool call progress UI test — verify `progress_event` tokens from tool calls render as visible steps in the chat UI, not swallowed by the SSE consumer → SQA
- [ ] TASK-V3-F5: Pak Har voice tests — verify agent responses maintain persona with tool-enriched context → SQA
  - `voice_modifier` placeholder in SYSTEM_PROMPT still injected correctly after tool descriptions added
- [ ] TASK-V3-F6: Security review — MCP server auth (session cookie path + MCP_API_KEY path), rate limiting on `/mcp`, ownership guards (user A cannot call tools that return user B's data), data isolation between MCP clients → SQA

---

## Open Decisions

### Race Plan (see `race-plan-architecture.md` for full reasoning)

1. Generation strategy → **template-based** (recommended, not yet signed off)
2. Re-generation policy → **user-triggered** (recommended, not yet signed off)
3. Multiple race goals → **one active plan only in v3**
4. Mid-plan goal changes → **archive + regenerate with confirmation**
5. Plan length limits → **4–16 weeks** (reject <4 or >26 weeks)
6. `target_time` integration → **informational only in v3**
7. Post-race-day handling → **auto-archive + revert to general fitness**

**Product owner sign-off required on decisions 1–2 before TASK-V3-A1 begins.**

### Agentic Architecture (resolved in design session 2026-05-31)

- Model: gemma4:31b-cloud (validated by owner, confirmed tool-calling capable)
- Framework: none — pure Python ReAct loop
- Streaming: existing `streaming.py` event types unchanged
- MCP auth: two-path (session cookie internally, `MCP_API_KEY` for external)
- MCP protocol: MCP 1.0 stable (not 2025-03 draft)
- PLAN_PROMPT / REVIEW_PROMPT: stay as single-shot generation calls (tools trigger them)

---

## Blockers

- Product owner sign-off on race plan generation strategy + re-generation policy
- v2 must ship and stabilize first
- E1 (gemma4 tool call smoke test) gates all of Phase E

---

*Orchestrator updates this file as v3 work progresses.*
