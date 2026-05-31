# Old Legs — Product Requirements Document (PRD)

## Overview
Old Legs is a free, open-source AI running coach web app. Self-hostable via Docker. Strava-connected. Powered by a local LLM (Ollama). No subscriptions, no paywalls, no hype.

Coached by **Pak Har** — a 70-year-old who's been running since before GPS existed and will absolutely tell you what you're doing wrong.

## Target Users
- Beginner runners (0–6 months, building consistency)
- Intermediate runners (running regularly, want structured improvement)
- General fitness goal — not training for a specific race in v1
- People who want honest feedback, not cheerleading

## v1 Feature Requirements

### F1 — Strava Authentication
- User logs in via Strava OAuth
- App stores and auto-refreshes access tokens
- User can disconnect Strava

### F2 — Activity Sync
- App syncs last 90 days of Strava runs on first login
- New runs synced on dashboard load
- Data stored: distance, moving time, average pace, average HR, max HR, elevation gain, date, name

### F3 — Post-Run Analysis (Pak Har's Take)
- User can request Pak Har's analysis on any activity
- Analysis covers: effort assessment, pace quality, HR zones (if available), what went well, one specific thing to improve
- Analysis stored and shown on the activity page
- Pak Har's voice enforced — no vague or generic feedback, ever

### F4 — Weekly Training Plan
- User answers 3 onboarding questions: current weekly km, days available, biggest struggle
- App generates a 7-day plan: run type (easy/long/rest), target distance, target pace range, Pak Har's note per day
- Plan regenerates weekly or on user request
- Plan adapts based on last week's actual vs planned activity

### F5 — Chat with Pak Har
- Conversational chat interface
- Full recent activity history sent as context with every message
- Streaming response
- Chat history persisted per user session
- Rate limited: 20 messages/min

## Non-Functional Requirements
- Self-hostable with `docker compose up` — zero cloud dependencies
- Works with Ollama on the same machine (default model: llama3)
- Mobile-responsive web UI
- All user data stays local — nothing sent to external AI APIs
- Strava tokens encrypted at rest, never logged
