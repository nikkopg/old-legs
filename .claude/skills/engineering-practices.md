# Skill: Senior Engineering Practices
> Read before writing any code. Non-negotiable standards for all agents.

---

## Before You Code
Ask: What problem am I solving? What's the simplest correct solution? How will someone else maintain this? What can go wrong?

**If you can't explain the task in one sentence, re-read it.**

---

## Core Principles

**Simplicity over cleverness** — write the dumbest code that works correctly. Clever code is a warning sign.

**Single responsibility** — every function/class does one thing. If you need "and" to describe it, split it.

**Explicit over implicit** — never rely on magic or hidden state. Make intent obvious.

**DRY** — same logic twice: extract it. Three times: shared utility.

**Delete dead code** — don't comment out. That's what git is for.

---

## Code Structure

**Small functions** — max ~30 lines. Longer means doing too much.

**Meaningful names** — names tell you what something does without a comment.
```python
# ❌ def process(d, u)
# ✅ def normalize_strava_activity(raw_activity: dict, user_id: int) -> Activity
```

**Naming conventions**
- Python: `snake_case` functions/vars, `PascalCase` classes, `UPPER_SNAKE_CASE` constants
- TypeScript: `camelCase` functions/vars, `PascalCase` components/types, `UPPER_SNAKE_CASE` constants
- Files: `snake_case.py`, `kebab-case.ts`, `PascalCase.tsx`
- Never mix within a file

**Guard clauses over nesting** — use early returns to keep code flat.
```python
# ❌ nested ifs three levels deep
# ✅
def analyze(activity_id: int) -> Analysis:
    activity = get_or_404(activity_id)
    if activity.user_id != current_user.id:
        raise HTTPException(403, "Not your activity")
    if activity.distance == 0:
        raise HTTPException(400, "Activity has no distance")
    return run_analysis(activity)
```

---

## Error Handling

**Never swallow errors silently.**
```python
# ❌ except Exception: pass
# ✅
except OllamaUnavailableError as e:
    logger.error(f"Ollama unavailable: {e}")
    raise HTTPException(503, "Coach unavailable. Is Ollama running?")
```

**Meaningful error messages** — "Bad request" is useless. "Missing field: strava_code" is actionable.

**Handle external failures** — Strava and Ollama can go down. Always handle: timeouts, bad response formats, 429 rate limits, 401 auth failures.

---

## Testability

**Dependency injection over globals** — pass db/clients as parameters, never reach for globals.
```python
# ❌ def get_activities(): return db.query(Activity).all()
# ✅ def get_activities(db: Session) -> list[Activity]: ...
```

**Pure functions where possible** — same input, same output, no side effects.

**Hard to test = doing too much** — refactor before the test becomes painful.

---

## Documentation

**Comments explain why, not what.** If you need a comment to explain what, rewrite the code.
```python
# ❌ # loop through activities and get distance
# ✅ # Strava returns meters — convert to km for display
distance_km = activity.distance_meters / 1000
```

**Docstrings on all public functions** — one line minimum.
```python
def normalize_pace(seconds_per_meter: float) -> str:
    """Convert Strava pace (seconds/meter) to min/km string."""
```

**Update docs when behavior changes** — stale docs are worse than no docs. Update `api-spec.md` for endpoints, `ux-notes.md` for components.

---

## Security

- Validate all external input — API requests, webhooks, user messages (Pydantic + TypeScript types)
- Never log tokens, user messages, or personal data
- Route handlers never touch DB directly — go through services (least privilege)
- All secrets in `.env` — never in code, never committed

---

## Performance

**No premature optimization** — correct first, fast second.

**No N+1 queries** — never query inside a loop. Use joins or eager loading.
```python
# ❌ for activity in activities: db.query(User).filter(...).first()
# ✅ db.query(Activity).options(joinedload(Activity.user)).all()
```

**Design for the slow path** — what happens with 1000 activities? 30s Ollama response? Plan for pagination, timeouts, loading states from the start.

---

## Git

- One commit = one logical change
- Never commit broken code
- Commit messages for humans: `feat: TASK-004 normalize Strava pace to min/km`

---

## Multi-Agent Rules

- Respect file ownership — don't touch other agents' files without instruction
- Read before write — check if something already exists before creating it
- Log bugs in `.claude/docs/bugs.md`, don't fix them outside your scope
- When in doubt: read `api-spec.md`, `ux-notes.md`, `decisions.md`