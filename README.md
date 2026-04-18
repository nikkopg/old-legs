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
STRAVA_REDIRECT_URI=http://localhost:8000/auth/strava/callback
FRONTEND_URL=http://localhost:3000
SECRET_KEY=change-this-to-a-random-string
```

### 2. Start

```bash
docker compose up
```

This starts Postgres, Ollama, the API, and the web app. First run pulls the Ollama image and model — give it a few minutes.

### 3. Pull the model

```bash
docker exec -it oldlegs_ollama ollama pull gemma4:31b-cloud
```

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

Install [Ollama](https://ollama.com), then:

```bash
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
