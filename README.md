# Old Legs

<p align="center"><img src="docs/screenshots/landing-page.png" alt="Old Legs landing page" /></p>
Old Legs is a free, self-hosted AI running coach. It connects to your Strava account, analyzes your runs, and gives you honest, specific feedback — powered by a local LLM via Ollama. No subscription. No cloud. No cheerleading.

---

## What it does

<table>
<tr>
<td width="40%" valign="top">

**Post-run analysis** — Pak Har reads your run data and tells you what actually happened. Splits, HR zones, cardiac drift, efficiency factor, RPE — the full picture, not just pace and distance.

</td>
<td width="60%"><img src="docs/screenshots/02-activities.png" alt="Run list" /><img src="docs/screenshots/03-dispatch.png" alt="Post-run dispatch" /></td>
</tr>
<tr>
<td valign="top">

**Weekly review** — Pak Har's assessment of the week: how training load compared to the plan, what patterns he sees, what needs to change.

</td>
<td><img src="docs/screenshots/01-dashboard.png" alt="Dashboard with weekly review" /></td>
</tr>
<tr>
<td valign="top">

**Weekly training plans** — structured 7-day plans based on your recent training load, goal event, and race date. Filed every Monday.

</td>
<td><img src="docs/screenshots/04-plan.png" alt="Training plan" /></td>
</tr>
<tr>
<td valign="top">

**Chat** — ask Pak Har anything about your training. He has your run history, your plan, and your weekly review in front of him.

</td>
<td><img src="docs/screenshots/05-chat.png" alt="Chat" /></td>
</tr>
</table>

- **Onboarding** — first-run questions to calibrate coaching: weekly km capacity, available days, biggest struggle, goal event, race date, resting HR, max HR
- **Settings** — editable preferences, coach voice level (gentle / standard / unfiltered), automatic delivery toggles, Strava disconnect, full context reset

---

## Who is Pak Har?

Your coach. He's been running since before GPS existed. He has no patience for excuses and no interest in hollow encouragement. He'll tell you your pace dropped because you went out too hard, not because you "had an off day". He's the kind of coach you'd actually listen to.

## What Pak Har considers

The same signals a professional coach would pull — not just average pace and HR.

| Category | Signal | What he looks for |
|---|---|---|
| The run | Distance & pace | Moving time, average pace, elevation gain |
| The run | Per-km splits | Pace, HR, cadence, elevation change per km |
| Effort | HR zones | 5 zones via Karvonen, calibrated to your RHR/MHR — not population averages |
| Effort | Zone distribution | Time in each zone from per-second streams — exact, not averaged per km |
| Effort | Zone mismatch | Called it easy but ran at Zone 4 — he'll say so |
| Effort | Cardiac drift | HR climbing while pace holds = dehydration or aerobic ceiling |
| Pacing | Split pattern | Whether you faded, ran even, or negative-split |
| Pacing | Cadence drop | Form breakdown under fatigue, not just tiredness |
| Perceived effort | RPE | 1–10, cross-referenced against HR zone and splits |
| Perceived effort | RPE mismatch | Zone 2 run rated 9/10 gets named — calibration, heat, fatigue, or sleep |
| Fitness trend | Efficiency factor | Speed per heartbeat vs your last 4 runs — building or declining |
| Fitness trend | HR trend | HR climbing across comparable distances = fatigue accumulation |
| Context | Today's plan | Zone 4 HR on a scheduled tempo is expected — he won't flag it |
| Context | Last 3 analyses | Same problem flagged three times = escalation, not repetition |
| Context | Weekly review | Hard effort after a heavy week reads differently than after two rest days |
| Context | Your preferences | Weekly km, available days, biggest struggle |

---

## Self-hosting

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- A Strava API application (free) — takes 2 minutes:
  1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
  2. Fill in any name and website (e.g. `http://localhost`)
  3. Set **Authorization Callback Domain** to `localhost`
  4. Copy your **Client ID** and **Client Secret**

### 1. Clone and configure

```bash
git clone https://github.com/nikkopg/old-legs.git
cd old-legs
```

Create `apps/api/.env` and fill in your Strava credentials:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
FRONTEND_URL=http://localhost:3000
SECRET_KEY=change-this-to-a-random-string
COOKIE_SECURE=false
DATABASE_URL=postgresql://oldlegs:oldlegs@postgres:5432/oldlegs
OLLAMA_MODEL=gemma4:31b-cloud
```

> **`DATABASE_URL`** uses `postgres` as the host — that's the service name in Docker Compose. If you're running the API locally (not in Docker), change `postgres` to `localhost`.

> **`COOKIE_SECURE=false`** is required for local development over plain HTTP. Remove this line (or set it to `true`) when running behind HTTPS in production.

### 2. Start

```bash
docker compose up -d
```

This starts Postgres, Ollama, the API, and the web app. On first run it will also pull the AI model — give it a few minutes.

### 3. Sign in to Ollama (first time only)

The AI model requires a free Ollama account. [Sign up at ollama.com](https://ollama.com) if you don't have one, then:

```bash
docker exec -it oldlegs_ollama ollama login
```

Follow the prompts. Your credentials are saved in the `ollama_data` volume — you won't need to do this again.

### 4. Open

`http://localhost:3000` — connect your Strava account and you're in.

---

## Local development

### API

```bash
cd apps/api
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

API runs at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Ollama (local)

Install [Ollama](https://ollama.com), create a free account, then:

```bash
ollama login
ollama pull gemma4:31b-cloud
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4 |
| Backend | FastAPI, Python 3.11+ |
| Database | PostgreSQL |
| AI | Ollama — default model: `gemma4:31b-cloud` |
| Auth | Strava OAuth 2.0 |

---

## Running tests

```bash
cd apps/api
pip install -r requirements-test.txt
pytest
```

---

## License

MIT
