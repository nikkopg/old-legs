# Old Legs

> *"He's 70. He's already lapped you. And he has thoughts."*

Old Legs is a free, self-hosted AI running coach. It connects to your Strava account, analyzes your runs, and gives you honest, specific feedback — powered by a local LLM via Ollama. No subscription. No cloud. No cheerleading.

---

## What it does

- **Post-run analysis** — Pak Har reads your run data and tells you what actually happened
- **Weekly training plans** — structured 7-day plans based on your recent training load
- **Chat** — ask Pak Har anything about your training

## Who is Pak Har?

Your coach. He's been running since before GPS existed. He has no patience for excuses and no interest in hollow encouragement. He'll tell you your pace dropped because you went out too hard, not because you "had an off day". He's the kind of coach you'd actually listen to.

## What Pak Har considers

When analyzing a run, Pak Har doesn't just read your average pace and HR. He looks at the full picture — the same signals a professional coach would pull from the data:

**The run itself**
- Distance, moving time, average pace, elevation gain
- Per-km splits — pace, HR, cadence, and elevation change per kilometre

**Effort and zones**
- Average HR classified into 5 zones using the Karvonen formula (calibrated to your personal max HR and resting HR — not population averages)
- Your exact zone boundaries in bpm, so he never cites a generic threshold
- Easy-run vs HR zone mismatch — if you called it easy but ran at Zone 4, he'll say so
- Cardiac drift — HR climbing while pace holds signals dehydration or working beyond your aerobic ceiling

**Pacing pattern**
- Splits let him see whether you went out too fast and faded, ran even, or negative-split
- Cadence drop across the run signals form breakdown under fatigue, not just tiredness

**Fitness trend**
- Efficiency factor (speed per heartbeat) compared against your last 4 runs — improving means aerobic fitness is building; declining means you're working harder to cover the same ground
- HR trend across comparable distances — if your HR at 8km has climbed 10 bpm over the last 3 similar runs, that's fatigue accumulation

**Context**
- Your active training plan for the day — if Tuesday was scheduled as a tempo, Zone 4 HR is expected and he won't flag it as "too hard"
- Your last 3 run analyses — if he's flagged the same problem three times, he escalates instead of repeating himself
- Your most recent weekly review — training load context so a hard effort after a heavy week reads differently than the same effort after two rest days
- Your stated preferences — weekly km target, days available, biggest struggle

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
```

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
| Database | SQLite (dev) / PostgreSQL (prod) |
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
