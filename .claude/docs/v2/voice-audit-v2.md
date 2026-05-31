# TASK-121 COMPLETE — Pak Har Voice Audit

**Date:** 2026-05-02
**Auditor:** SQA

## Summary

All core prompt files pass. One FAIL-level issue found in an inline system prompt for the `plan-verdict` endpoint — it names Pak Har but provides no voice rules, leaving `verdict_short` (a user-visible headline) under-specified. One WARN on a dead import in `insights.py`. Frontend redesign components are clean throughout.

---

## File-by-File Results

### `apps/api/prompts/pak_har.py` — PASS
Source of truth. All four prompts (`SYSTEM_PROMPT`, `ANALYSIS_PROMPT`, `PLAN_PROMPT`, `REVIEW_PROMPT`) include explicit inline voice rules matching CLAUDE.md. No forbidden words, no emojis, specificity requirements correctly encoded.

### `apps/api/services/coach.py` — PASS
Pure data processing (HR zone classification, context string assembly). No LLM-facing voice copy.

### `apps/api/services/ollama.py` — PASS
`stream_chat()` correctly uses `SYSTEM_PROMPT` from `pak_har.py`. Error strings are infrastructure messages, not coach copy.

### `apps/api/routers/activities.py` — FAIL (BUG-002)
- `analyze_activity` endpoint: uses `ANALYSIS_PROMPT` correctly. ✅
- `plan_verdict` endpoint (lines ~647–650): **FAIL.** Inline system prompt reads `"You are Pak Har — a blunt, experienced running coach. Output only valid JSON, no markdown, no explanation."` — two sentences, zero voice rules. This endpoint generates `verdict_short`, a user-visible string displayed as a headline in `PlanPaper.tsx`. Without explicit prohibitions on exclamation points, forbidden words, and hollow affirmations, output is insufficiently grounded. Filed as BUG-002.
- Verdict JSON extraction (second Ollama call): `"You are a JSON extractor."` — correct, not coach voice.

### `apps/api/routers/plan.py` — PASS
No inline prompts. Delegates to `services/plan.py` which uses `PLAN_PROMPT` correctly.

### `apps/api/routers/review.py` — PASS
No inline prompts. Delegates to `services/review.py`.

### `apps/api/services/review.py` — PASS
Inline system prompt covers all critical prohibitions (no hollow affirmations, no exclamation points, no emojis, one concrete adjustment then stop). Acceptable task-scoped condensation of the canonical persona.

### `apps/api/services/insights.py` — WARN
Inline system prompt is functionally adequate. Issue: `SYSTEM_PROMPT` is imported but never used — dead import. If `pak_har.py` is updated, insights will not benefit. Recommendation: remove the dead import.

### `apps/api/routers/insights.py` — PASS
Router only. No inline prompts.

### `apps/api/services/plan.py` — PASS
Uses `PLAN_PROMPT` from `pak_har.py` correctly.

### `apps/web/src/components/redesign/` — PASS (with notes)
- No emojis anywhere.
- No forbidden words found (`amazing`, `superstar`, `rockstar`, `you got this`, `believe in yourself`, `your journey`, `great job`, `well done`, `fantastic`).
- No hollow affirmations.
- `DashboardPaper.tsx` hero headlines ("Week is thin. Pick it up.", "Target met. Don't stop now.") are on-brand.
- `PlanPaper.tsx` WARN: Session sub-labels "The week's sharp edge." (Tempo) and "The honest one." (Long) are flavour text rather than Pak Har's direct voice. Not a voice violation — flagged for UX awareness only.
- All empty states, loading states, and error states are terse and on-brand.

---

## Issues Found

### BUG-002 — FAIL
**File:** `apps/api/routers/activities.py` (~lines 647–650)
**Offending text:** `"You are Pak Har — a blunt, experienced running coach. Output only valid JSON, no markdown, no explanation."`
**Violation:** `verdict_short` is user-visible (displayed as a headline in `PlanPaper.tsx`) and must match the Pak Har persona. The system prompt has no prohibition on exclamation points, no forbidden words list, and no specificity requirement. Compare to `services/review.py` which includes condensed but explicit voice rules.

### WARN-1 — insights.py dead import
**File:** `apps/api/services/insights.py`
**Issue:** `SYSTEM_PROMPT` imported from `pak_har.py` but not used. Dead import. If the canonical prompt changes, insights won't update. Remove the import.

### WARN-2 — PlanPaper session sub-labels
**File:** `apps/web/src/components/redesign/PlanPaper.tsx`
**Issue:** Hardcoded session sub-labels ("The week's sharp edge.", "The honest one.") are UX copy, not Pak Har's voice. Not a blocker. Flag for UX review if the persona is ever audited more strictly.

---

## Verdict

**WARN** — one FAIL-level bug (BUG-002, High severity) that should be fixed before v2 ships. Two WARN-level findings that are not blockers. All core prompt templates pass.
