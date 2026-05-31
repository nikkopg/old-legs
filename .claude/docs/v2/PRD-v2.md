# Old Legs — Product Requirements Document (PRD) v2

## Overview
Old Legs is a free, open-source AI running coach web app. Self-hostable via Docker Compose. Connects to Strava, analyzes runs, and delivers honest coaching powered by a local LLM via Ollama. No subscriptions, no cloud AI APIs, no cheerleading.

Coached by **Pak Har** — a 70-year-old Indonesian uncle who's been running since before GPS existed. Blunt, specific, zero hype. See `apps/api/prompts/pak_har.py` for the source of truth on his voice.

## Target Users
- Beginner runners (0–6 months, building consistency)
- Intermediate runners (running regularly, want structured improvement)
- Goal-oriented runners preparing for a specific event (5K, 10K, half marathon) — added in v2
- People who want honest feedback, not cheerleading

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+ |
| Database | SQLite (dev) / PostgreSQL (prod) via SQLAlchemy |
| AI | Ollama (local LLM) — model: `gemma4:31b-cloud` |
| Auth | Strava OAuth 2.0 |
| Deployment | Docker Compose |

---

## v1 Features (shipped 2026-04-18 — do not re-implement)

- **Strava OAuth** — login, token auto-refresh, disconnect
- **Activity sync** — last 90 days on first login, new runs on dashboard load
- **Post-run analysis** — Pak Har's take on effort, pace, HR, what to improve
- **Weekly training plan** — 7-day plan based on recent activity data
- **Chat with Pak Har** — conversational coaching, streaming SSE, rate-limited

---

## v2 Feature Requirements

### F1 — Dashboard Restructure
- `/dashboard` becomes a true weekly hub, not a runs list
- Shows: weekly stats (total km, runs, total time), today's plan day, last run snapshot with Pak Har's one-liner, quick entry to chat
- `/activities` becomes its own paginated route
- Navigation adds "Activities" as a separate item

### F2 — Onboarding + User Preferences
- First-time users answer 3 questions: current weekly km, days available per week, biggest struggle
- Answers stored in `user_preferences` table
- Plan generation prompt receives these as context — replaces current generic fallback
- Users can update preferences from settings page at any time

### F3 — Weekly Review from Pak Har
- On-demand (button on dashboard) or auto-triggered at week end
- Compares this week's planned runs (from `TrainingPlan`) vs actual runs (from `Activity`)
- Pak Har's assessment: what the gap means, whether it's a pattern, one concrete adjustment
- Stored as a `weekly_review` record, shown on dashboard

### F4 — Settings / Profile Page
- New `/settings` route
- Shows: name, avatar (Strava), connected account status
- Actions: update preferences, disconnect Strava, delete account

### F5 — HR Zone Interpretation
- Post-run analysis upgraded: Pak Har flags HR zone mismatches
- Easy run at zone 4 HR → flagged as "that wasn't easy"
- HR trending up week-over-week at same pace → flagged as potential fatigue
- No new data needed — HR already synced from Strava

### F6 — Run Filtering & Search
- `/activities` page: filter by date range, distance, pace zone
- Search by run name
- Server-side pagination

### F7 — Trend Analysis
- New insights section (dashboard or `/insights` route)
- Pak Har surfaces patterns over 4–8 weeks: pace trends, consistency, volume changes
- New `GET /insights` endpoint — aggregated stats + Pak Har commentary
- On-demand, not automatic

### F8 — UI Redesign
- Full visual redesign of all pages
- UX brief to be written before implementation starts — do not begin until explicitly instructed
- Must preserve Pak Har's voice and no-hype aesthetic

### F9 — Goal Setting (stretch)
- User sets a goal: target event (5K, 10K, half), target date, current fitness level
- Plan generation becomes goal-aware and periodized
- Treat as stretch goal — may move to v3

---

## Non-Functional Requirements
- Self-hostable with `docker compose up` — zero cloud dependencies
- Ollama only — no OpenAI, Anthropic, or any paid AI API
- Mobile-responsive web UI
- All user data stays local — nothing sent to external AI APIs
- Strava tokens encrypted at rest (Fernet), never logged
