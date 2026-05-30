# Old Legs

Most running apps are optimized for engagement. That means positive reinforcement by default. After enough "Great effort! Every km counts!" you start to wonder if the app is coaching you or just keeping you subscribed.

Old Legs is different. It connects to your Strava account and gives you honest, specific feedback from a coach named Pak Har — a 70-year-old Indonesian runner who has been running since before GPS existed and has no patience for hollow praise.

**What Pak Har actually sounds like:**

> *After a week with one run:*
> "You ran once this week. That's not training, that's a coincidence. What actually happened?"

> *After a slow run you still showed up for:*
> "That was slow. But you went out when you didn't want to — that matters more than the pace right now."

> *After hitting a PR:*
> "You hit a PR. Six weeks of not quitting will do that. Now don't use it as an excuse to rest for a month."

> *After seven days straight with declining pace:*
> "Seven days straight and your pace is getting worse. Rest two days. That's not weakness — that's how this works."

No subscription. No OpenAI or Anthropic. No cheerleading. The default model uses Ollama's free cloud inference — or swap in any local model for fully private, on-device coaching.

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
- **Sync to Watch** — push your weekly training plan to your Garmin Connect watch calendar. Each day maps to a structured workout with HR-zone targets. Rest days are skipped. Connect your Garmin account in Settings.
- **Settings** — editable preferences, coach voice level (gentle / standard / unfiltered), automatic delivery toggles, watch platform connection (Garmin Connect), Strava disconnect, full context reset

---

## Who is Pak Har?

Your coach. He's been running since before GPS existed. He has no patience for excuses and no interest in hollow encouragement. He'll tell you your pace dropped because you went out too hard, not because you "had an off day". He's the kind of coach you'd actually listen to.

## What Pak Har considers

The same signals a professional coach would pull — not just average pace and HR.

| Category | Signal | What he looks for |
|---|---|---|
| The run | Distance & pace | Moving time, average pace, elevation gain |
| The run | Per-km splits | Pace, HR, cadence, elevation change, grade-adjusted pace (GAP) per km |
| Effort | HR zones | 5 zones via Karvonen, calibrated to your RHR/MHR — not population averages |
| Effort | Zone distribution | Time in each zone from per-second streams — exact, not averaged per km |
| Effort | Zone mismatch | Called it easy but ran at Zone 4 — he'll say so |
| Effort | Cardiac drift | HR climbing while pace holds = dehydration or aerobic ceiling |
| Pacing | Grade-adjusted pace (GAP) | Effort per km normalised for gradient using Minetti's metabolic cost curve — a slow km up a 15% climb reads as the hard effort it actually was |
| Pacing | Split pattern | Whether you faded, ran even, or negative-split |
| Pacing | Cadence drop | Form breakdown under fatigue, not just tiredness |
| Perceived effort | RPE | 1–10, cross-referenced against HR zone and splits |
| Perceived effort | RPE mismatch | Zone 2 run rated 9/10 gets named — calibration, heat, fatigue, or sleep |
| Fitness trend | Efficiency factor | Speed per heartbeat vs your last 4 runs — building or declining |
| Fitness trend | HR trend | HR climbing across comparable distances = fatigue accumulation |
| Context | Today's plan | Zone 4 HR on a scheduled tempo is expected — he won't flag it. Correctly executed sessions get a forward observation, not a manufactured criticism |
| Context | Last 3 analyses | Same problem flagged three times = escalation, not repetition |
| Context | Weekly review | Hard effort after a heavy week reads differently than after two rest days |
| Context | Your preferences | Weekly km, available days, biggest struggle |

---

## Self-hosting

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (macOS: increase Docker Desktop RAM to at least 4GB in Settings → Resources)
- A free [Ollama account](https://ollama.com) (required to use the AI model)
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

Generate the two required secret keys:

```bash
# FERNET_KEY — encrypts your Strava tokens at rest
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# SECRET_KEY — signs session cookies
python -c "import secrets; print(secrets.token_hex(32))"
```

Create `apps/api/.env` and fill in your values:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
FRONTEND_URL=http://localhost:3000
SECRET_KEY=<output from python command above>
FERNET_KEY=<output from python command above>
COOKIE_SECURE=false
DATABASE_URL=postgresql://oldlegs:oldlegs@postgres:5432/oldlegs
OLLAMA_MODEL=gemma4:31b-cloud
```

> **`OLLAMA_MODEL`** — `gemma4:31b-cloud` is the default: it routes inference through Ollama's free cloud API, so your run data is sent to Ollama's servers to generate responses. For fully private, on-device coaching, swap in a local model:
>
> ```env
> OLLAMA_MODEL=llama3.2:3b     # fast, ~2GB, decent quality
> OLLAMA_MODEL=gemma2:9b       # better quality, ~5GB
> ```
>
> Local models don't require an Ollama account and never send data off your machine. Quality is lower than the cloud model.

> **`DATABASE_URL`** uses `postgres` as the host — that's the service name in Docker Compose. If you're running the API locally (not in Docker), change `postgres` to `localhost`.

> **`COOKIE_SECURE=false`** is required for local development over plain HTTP. Remove this line (or set it to `true`) when running behind HTTPS in production.

### 2. Sign in to Ollama (first time only)

The AI model requires a free Ollama account. Start the Ollama container and log in before pulling the model:

```bash
docker compose up -d ollama
docker exec -it oldlegs_ollama ollama login
```

Follow the prompts. Your credentials are saved in the `ollama_data` volume — you won't need to do this again.

### 3. Start

```bash
docker compose up -d
```

This starts Postgres, Ollama, the API, and the web app. On first run, Docker will build the images and register the AI model with Ollama cloud.

Verify all containers are running:

```bash
docker compose ps
```

All five services (`postgres`, `ollama`, `ollama-init`, `api`, `web`) should show as running or exited (ollama-init exits after the model registers — that's expected).

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

API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

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

## Upgrading

```bash
git pull
docker compose up --build -d
```

Check the [CHANGELOG](CHANGELOG.md) before upgrading — breaking changes (new required env vars, schema changes) are listed there with instructions.

---

## Running tests

```bash
cd apps/api
pip install -r requirements-test.txt
pytest
```

---

## Common issues

**`RuntimeError: FERNET_KEY is not set`**
You're missing `FERNET_KEY` in your `.env`. Generate one:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Add `FERNET_KEY=<value>` to `apps/api/.env` and restart: `docker compose restart api`.

**Pak Har gives no response / "model not found" error**
The `ollama-init` container failed to register the model, usually because Ollama login wasn't done first. Fix:
```bash
docker exec -it oldlegs_ollama ollama login
docker compose run --rm ollama-init
```

**Strava OAuth error after sign-in**
The `STRAVA_REDIRECT_URI` in your `.env` must match what you set in your Strava app's Authorization Callback Domain. It should be `http://localhost:3000/auth/callback` for local development.

**Port 8000 or 3000 already in use**
Another process is using the port. Either stop it, or edit the port mappings in `docker-compose.yml` (e.g. `"3001:3000"` to run the frontend on 3001).

**API crashes immediately / can't reach localhost:8000**
Check the API logs: `docker compose logs api`. Common causes: `FERNET_KEY` not set, `SECRET_KEY` not set, or Postgres still initializing (wait 10s and retry).

---

## License

MIT
