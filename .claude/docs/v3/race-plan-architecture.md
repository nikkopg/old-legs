# V3 — Race-Specific Training Architecture

> Status: Planning. Not started. Deferred from v2 (see `dev-plan-v2.md` for v2 scope).

---

## Problem Statement

Today, Pak Har generates training plans **strictly week-by-week** with no multi-week structure. The current race-date handling (`apps/api/services/plan.py:546-566`) gives him a single phase label per week (`base building` / `sharpening` / `taper`) but no structured progression within those phases.

This is fine for `general_fitness` users — most of Pak Har's users probably don't have a specific race in mind, and reactive week-by-week coaching is a defensible product position.

But for race-specific users (5k / 10k / half marathon / marathon / ultra with a date set), the current system gives the right *vibe* but not a real training plan:

- No memory of which phase the runner was in last week
- No structured volume progression across weeks (e.g., "long run at 14km this week building toward 22km by week 9")
- No mandatory recovery weeks
- No peaking logic
- No "you are here in week 4 of 12" awareness

A proper race plan needs a **multi-week skeleton** committed up front, then weekly plans generated *within* that skeleton.

---

## Architecture Overview

### Core concept: the "Race Plan" (macro plan)

When a user sets a race date + goal event, the system generates a **`RacePlan`** — a high-level weekly progression covering the entire build (typically 8–16 weeks):

```
Week 1  | Base       | 35 km | Long run 10 km | Easy
Week 2  | Base       | 38 km | Long run 12 km | Easy
Week 3  | Base       | 40 km | Long run 14 km | + 1 tempo
Week 4  | Recovery   | 30 km | Long run 10 km | Easy only
Week 5  | Build      | 42 km | Long run 16 km | + 1 tempo
...
Week 11 | Sharpen    | 38 km | Long run 14 km | + intervals
Week 12 | Taper      | 25 km | Long run 8 km  | Easy + race
```

The `RacePlan` is **not** the daily plan. It's the skeleton. Each week, the existing weekly plan generator reads the current `RacePlanWeek` and produces the actual 7-day breakdown within those guardrails.

### Flow

```
User sets race_date + goal_event
        ↓
POST /race-plan/generate
        ↓
RacePlan + RacePlanWeek[] persisted (one row per week)
        ↓
Weekly plan generation (existing) reads "this week's RacePlanWeek"
        ↓
PLAN_PROMPT injected with: "Week 4 of 12, build phase, target 42 km, long run 16 km"
        ↓
Pak Har writes the daily 7-day plan within those targets
```

### Drift handling

Each week, the system compares actual volume vs the `RacePlanWeek` target. If the runner drifts >20% off-target for 2+ consecutive weeks, the system surfaces "Pak Har wants to redraft the arc" — user can trigger regeneration with their current fitness as the new starting point.

---

## What Needs To Be Built

### Backend (Phase A)

**A1. Data model**
- New `RacePlan` table — `id`, `user_id` (FK, unique active per user), `race_date`, `goal_event`, `target_time` (optional, HH:MM:SS), `weeks_total`, `starting_weekly_km`, `created_at`, `status` ('active' / 'archived')
- New `RacePlanWeek` table — `id`, `race_plan_id` (FK), `week_number`, `week_start_date`, `phase` ('base' / 'build' / 'sharpen' / 'taper' / 'recovery'), `target_volume_km`, `long_run_km`, `key_session_type` ('easy' / 'tempo' / 'intervals' / 'long' / 'recovery'), `notes` (Pak Har's per-week voice)
- Alembic migration

**A2. Race plan generation service** — `apps/api/services/race_plan.py`
- `generate_race_plan(user, db) -> RacePlan`
- Takes: user fitness baseline (recent 4-week avg km from activities), race distance, weeks to race
- Strategy decision needed (see Open Decisions §1): template-based vs Ollama-generated
- Validates: max 10% week-over-week volume increase, mandatory recovery week every 3–4 weeks, taper structure (3-week / 2-week / 1-week patterns by race distance)
- Returns persisted `RacePlan` with all `RacePlanWeek` rows

**A3. Race plan endpoints** — `apps/api/routers/race_plan.py`
- `POST /race-plan/generate` — creates new active race plan, archives any existing active plan
- `GET /race-plan/current` — fetch active plan + weeks
- `POST /race-plan/regenerate` — re-derive from current fitness (keeps race_date, recomputes progression)
- `DELETE /race-plan/{id}` — archive

**A4. Weekly plan integration** — modify `apps/api/services/plan.py`
- Stage 2 (or new stage) — fetch active `RacePlan` + current `RacePlanWeek`
- Inject `{race_plan_context}` placeholder into `PLAN_PROMPT` with: "Week N of M, [phase], target volume X km, long run Y km, [key session]. Drift so far: Z."
- New interpretation rules in `PLAN_PROMPT`: weekly plan must hit target volume ±10%, must include long run as specified, key session must match phase
- Fallback: if no active `RacePlan`, current behaviour unchanged (`general_fitness` users unaffected)

**A5. Drift detection**
- New field `last_drift_check` on `RacePlan`
- Service function `compute_drift(race_plan, db)` — returns dict of week-by-week actual km vs target
- Called from weekly review generation; sets `needs_regeneration` flag if >20% drift for 2+ weeks
- Surfaced via `GET /race-plan/current` response

**A6. SSE streaming for race plan generation** — same pattern as TASK-189
- `generate_race_plan` converted to async generator
- Stages: `Reading your fitness baseline` → `Mapping the arc` → `Drafting each week` → `Filing`
- Frontend uses existing `useProgressStream` hook

**A7. `api-spec-v2.md` → `api-spec-v3.md`** — document all new endpoints and the modified plan generation response

### Frontend (Phase B)

**B1. Onboarding/Settings updates**
- Optional `target_time` field added to onboarding + Runner's Brief (HH:MM:SS input)
- When `race_date` + `goal_event` both set: "Build the arc →" CTA appears
- Display race plan summary in Settings (current week, phase, weeks to race)

**B2. New "The Arc" page or section** — `/arc` route (new nav item) or section embedded on `/plan`
- Visual weekly progression: 8–16 vertical bars showing target volume per week
- Phase color coding (base/build/sharpen/taper/recovery — all within existing accent + ink palette)
- "You are here" marker on current week
- Race day terminal marker
- Long run progression line overlaid
- Each week clickable → drawer showing target details + actual completion

**B3. Plan page integration** — modify `apps/web/src/components/redesign/PlanPaper.tsx` and `apps/web/src/app/plan/page.tsx`
- Header strip above the existing 7-day table: "Week N of M · [phase] · Target X km · Long run Y km"
- "View full arc →" link to The Arc page

**B4. Drift surface** — on Plan page and Dashboard
- "On track / Drifting / Off plan" badge based on actual vs `RacePlanWeek` target
- When drifting flagged by backend: "Pak Har wants to redraft the arc" CTA → calls `POST /race-plan/regenerate`

**B5. SSE streaming UI** — race plan generation progress strip (same `useProgressStream` pattern as plan/review streaming)

**B6. Type definitions** — `RacePlan`, `RacePlanWeek`, drift response types in `src/types/api.ts`

**B7. Race plan API client functions** — `getCurrentRacePlan`, `generateRacePlan`, `regenerateRacePlan`, `deleteRacePlan` in `src/lib/api.ts`

### UX (Phase C)

**C1. Visual language for the arc**
- Tabloid-style visualization for a 12-week progression — newspaper aesthetic, no charts library
- Volume bars in Space Mono numbers
- Phase labels in Work Sans caps
- Long run progression as a dotted overlay line
- Mobile: vertical stack vs horizontal scroll — needs spec
- Race day milestone: bold accent rule + "RACE DAY · {date}" stamp

**C2. Pak Har voice for race-specific copy**
- Phase transitions: "You're done with base. Now you sharpen."
- Drift warnings: "Three weeks behind target. Either adjust the goal or rebuild the arc."
- Race week: "Less is more. The work is done. Don't undo it."
- Target time copy: "You said {time}. The plan is built around that. Don't change it mid-build unless something is broken."
- Add 6–8 new voice test cases to `pak_har_voice_tests.md`

**C3. Onboarding tweaks**
- Target time input UX — optional, no validation pressure, format hint "HH:MM:SS or leave blank"
- Race-specific tone calibration in onboarding modal final step

**C4. Settings: "Cancel the Arc" affordance**
- Same pattern as "Cancel the Subscription" — accent border button
- Confirms before archiving active race plan

### SQA (Phase D)

**D1. Race plan generation tests** — `apps/api/tests/test_race_plan.py`
- Template validation: base/build/sharpen/taper proportions match goal event
- Edge cases: race date too close (<4 weeks → reject or compress to taper-only), too far (>26 weeks → cap at 16-week build), past date (reject)
- Volume safety: no >10% jumps, mandatory recovery weeks every 3–4 weeks
- Each goal event (5k/10k/half/marathon/ultra) produces appropriate phase distribution

**D2. Drift detection tests**
- Runner exactly on target → no flag
- Runner 25% under for 1 week → no flag
- Runner 25% under for 2+ weeks → flag set
- Runner 25% over for 2+ weeks → flag set (over-training)

**D3. Plan generation integration tests** — verify `RacePlan` context flows into weekly plan
- Weekly plan generation with active `RacePlan` includes correct target volume + long run
- Weekly plan generation without active `RacePlan` uses existing behaviour (regression)
- Race plan archived mid-week → weekly plan falls back to general behaviour

**D4. Pak Har voice tests** for race-specific copy — 6–8 new cases in `pak_har_voice_tests.md`

**D5. E2E tests** — `apps/web/tests/e2e/race-plan.spec.ts`
- Set race date + goal → "Build the arc" CTA appears
- Generate race plan → SSE progress → arc page renders
- Plan page shows "Week N of M" header
- Drift flag surfaces "redraft the arc" CTA
- Cancel the arc → confirmation → archived

**D6. Security review** — `POST /race-plan/generate` rate-limited (same pattern as other Ollama endpoints), ownership guards on all race plan endpoints

---

## Open Decisions (need answers before implementation)

1. **Generation strategy: template-based vs Ollama-generated?**
   - **Template-based** — deterministic, predictable, fast, no Ollama dependency for the skeleton. Pak Har voices the per-week `notes` field only. Risk: feels mechanical, less "Pak Har soul" in the skeleton itself.
   - **Ollama-generated** — single prompt asks Pak Har to lay out the entire 12-week arc. Risk: hallucination, inconsistent volume math, slow (long prompt + long output).
   - **Recommendation:** template-based with Pak Har writing the per-week notes. Skeleton math is too important to leave to a probabilistic model.

2. **Re-generation policy: auto vs user-triggered?**
   - Auto-regenerate when drifting → less friction, runner doesn't have to think
   - User-triggered → runner stays in control, no surprise plan changes
   - **Recommendation:** flag + surface CTA, never auto-regenerate. Runner must opt in.

3. **Multiple race goals: can a user queue more than one race?**
   - E.g., 10k in 6 weeks + half marathon in 16 weeks
   - **Recommendation:** v3 — one active race plan only. Multi-race queueing → v4.

4. **Mid-plan goal changes**
   - User sets new race date while another is active → archive old, generate new from current fitness?
   - **Recommendation:** yes, but require explicit confirmation ("This will archive your current 8-week arc. Continue?")

5. **Plan length limits**
   - Min weeks: 4 (anything shorter is just taper)
   - Max weeks: 16 (anything longer is too speculative — re-generate at 16 weeks out)
   - Reject race dates <4 weeks or >26 weeks at API level

6. **`target_time` integration**
   - Just informational, or should it influence pace targets in weekly sessions?
   - **Recommendation:** v3 — informational only (Pak Har references it in voice). Pace-target injection → v4.

7. **What happens after race day?**
   - Auto-archive the race plan on `race_date + 1`?
   - Generate a "recovery week" plan automatically?
   - **Recommendation:** auto-archive + revert to general fitness mode. User can set a new race date when ready.

---

## Build Sequence

```
Phase A — Backend (build the foundation)
  A1: Data model + migration
  A2: Race plan generation service (template-based per Decision §1)
  A3: Race plan endpoints
  A7: api-spec-v3.md
  A6: SSE streaming wrapper (after A2 works)
  A4: Weekly plan integration (after A1-A3)
  A5: Drift detection (after A4)

Phase B — Frontend (consume the API)
  B6: Type definitions
  B7: API client
  B1: Onboarding/Settings updates
  B2: The Arc page (after A3, B6, B7)
  B3: Plan page integration (after B2)
  B4: Drift surface (after A5)
  B5: SSE streaming UI (after A6)

Phase C — UX (parallel with B from start)
  C1: Visual language spec
  C2: Pak Har voice for race copy
  C3: Onboarding tweaks
  C4: Cancel the arc affordance

Phase D — SQA (starts after Phase A core, runs in parallel with B/C)
  D1: Race plan generation tests
  D2: Drift detection tests
  D3: Plan generation integration tests
  D4: Voice tests
  D5: E2E tests
  D6: Security review
```

**Critical path:** A1 → A2 → A3 → A4 → B2 → B3 → ship

---

## Out of Scope for V3

- Multi-race queueing (queue 10k in 6 weeks + half marathon in 16 weeks)
- Pace-target injection from `target_time` (target_time is informational only in v3)
- Adaptive periodization based on injury / illness signals
- Coaching marketplace / Pak Har personality variants
- Route map visualization (deferred from v2)

---

*This doc is the source of truth for v3 race-plan architecture. Update as decisions are made and tasks complete.*
