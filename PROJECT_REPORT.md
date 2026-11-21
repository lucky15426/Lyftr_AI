# Lyftr AI — Complete Project Report

*Written for: you (the owner), to understand how the project works and to deploy it.*

---

## 1. What this project is

A full-stack chatbot whose selling point is **transparency**. Most chatbots hide how an answer was produced. Lyftr shows, for **every reply**:

- where the answer came from: `LIVE_INFERENCE` (fresh from the model) or `LLM_CACHE` (served from memory)
- which model answered
- latency in ms
- input / output token counts
- which API key served it, and how many keys failed first (failover)

Three behaviours make it interesting:

| Feature | What it does |
|---|---|
| **Key failover** | You give a *pool* of API keys. If `key_1` is rate-limited / down / invalid, the request is retried on `key_2`, etc. The user never notices. |
| **Response caching** | The same prompt (same model + same conversation) is answered from an in-memory cache in ~4 ms instead of ~1400 ms. |
| **Persistent sessions** | Every successful turn is stored in SQLite, so each session keeps its own history and context. |

---

## 2. Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18, Vite 6, Tailwind CSS 4, lucide-react | Fast dev loop, static build, easy hosting |
| Backend | Python, FastAPI, Uvicorn, Pydantic 2 | Typed, validated, async-capable API |
| LLM layer | **LiteLLM** | One API for 100+ providers (Gemini, OpenAI, Claude…) + built-in cache + normalized errors |
| Database | SQLite (stdlib `sqlite3`) | Zero setup, single file |
| Tests | pytest (38 tests, no API calls) | Uses a fake LiteLLM provider |
| Packaging | Docker, docker-compose, Render blueprint, Vercel config | Reproducible deploys |

---

## 3. Architecture

```
 Browser (React, :3000)
    │  POST /chat {session_id, message, system_prompt?}
    │  (optional header X-Simulate-Failure)
    ▼
 FastAPI (:8000)  ──────────────────────────────────────────────┐
    1. validate request (Pydantic)                              │
    2. load this session's history  ◄── SQLite (messages table) │
    3. build messages = [system?] + history + new user message  │
    4. LLMGateway.complete(messages)                            │
         for key in [key_1, key_2, ...]:                        │
            litellm.completion(api_key=key, caching=on)         │
              ├─ cache hit  → return instantly (LLM_CACHE)      │
              ├─ success    → return (LIVE_INFERENCE)           │
              ├─ 429/5xx/timeout/401/403 → try next key         │
              └─ other error (e.g. 400)  → stop, HTTP 502       │
         all keys failed → HTTP 503                             │
    5. save user + assistant rows in ONE transaction ──► SQLite │
    6. return {reply, metadata}                                 │
 ◄──────────────────────────────────────────────────────────────┘
                    │
                    ▼  Gemini (or any LiteLLM provider)
```

### Request lifecycle in words
1. The frontend sends the message plus a `session_id` (a random id created on page load / "New chat").
2. The backend reads that session's earlier messages from SQLite so the model has context.
3. The gateway tries keys **in order**. LiteLLM checks its cache first; on a miss it calls the provider.
4. Only after the LLM succeeds are the user message and reply written to the DB. A failed request leaves **no trace**, and the frontend mirrors that by removing the bubble and restoring your text in the input box.

---

## 4. Folder structure

```
lyftr-chatbot/
├── .env                  your real settings (gitignored, used by Docker)
├── .env.example          template with placeholders (safe to commit)
├── docker-compose.yml    runs backend + frontend together
├── Makefile              make up / down / logs / test / clean
├── render.yaml           Render blueprint for the backend
├── README.md             original project README
├── PROJECT_REPORT.md     this file
├── backend/
│   ├── .env              backend-only env (gitignored, used for local non-Docker run)
│   ├── Dockerfile        multi-stage, non-root, /data volume
│   ├── requirements.txt  runtime deps (pinned)
│   ├── requirements-dev.txt  + pytest
│   ├── app/
│   │   ├── config.py     reads env vars into a Settings object
│   │   ├── schemas.py    request/response models + validation
│   │   ├── db.py         SQLite: schema, fetch history, atomic save
│   │   ├── gateway.py    ★ key pool, failover loop, cache, failure simulation
│   │   ├── main.py       ★ FastAPI app, routes, JSON error handlers, CORS
│   │   └── asgi.py       entrypoint: `uvicorn app.asgi:app`
│   └── tests/            38 tests + e2e server
└── frontend/
    ├── Dockerfile        node build → nginx
    ├── vercel.json       Vercel build settings
    └── src/
        ├── main.jsx      React entry
        ├── App.jsx       ★ state, send logic, layout, live route bar
        ├── api.js        fetch wrapper + friendly error messages
        ├── index.css     theme, aurora background, animations
        └── components/
            ├── Sidebar.jsx     new chat, session telemetry, failover demo, status
            ├── Message.jsx     user bubble / assistant card with colored rail
            ├── MetaBadges.jsx  per-reply "flight recorder"
            ├── RouteTrace.jsx  builds + draws the route (you → cache → key → model)
            ├── Composer.jsx    glowing input with auto-grow
            └── Welcome.jsx     landing screen
```

---

## 5. Backend in detail

### 5.1 API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{"status":"ok","keys_configured":2,"cache_enabled":true}`; 503 if DB broken or no keys |
| POST | `/chat` | Send a message, get reply + metadata |
| GET | `/sessions/{id}/messages` | Full history of a session (oldest first); 404 if unknown |
| GET | `/docs` | Auto-generated Swagger UI |

**Error codes** (always JSON `{"detail": …}`, never stack traces): `422` validation, `404` unknown session, `502` non-retryable provider error, `503` all providers unavailable, `500` unexpected.

### 5.2 Failover logic (`gateway.py`)
`LLM_API_KEYS=a,b,c` becomes ids `key_1, key_2, key_3`. For each request the gateway loops through them:
- **Retry on next key**: 429, quota exhausted, 5xx, timeouts, connection errors, 401/403 (a bad key is key-specific).
- **Do not retry**: other errors such as 400 (they would fail identically on every key) → HTTP 502.
- Nothing is permanently "disabled"; a recovered key is used again on the next request.
- `fallback_attempts` counts failed keys; `key_id` is the key that finally answered.

### 5.3 Caching
LiteLLM's built-in **in-memory** cache. The cache key = model + full message list. It does **not** include the API key, so an answer produced by `key_1` can be served even if `key_1` later dies. Entries last `CACHE_TTL_SECONDS` (default 24 h). On a hit: `resolution_source = LLM_CACHE`, `key_id = null`.
*Limitation:* the cache lives in RAM, so it resets on every restart and is not shared between instances.

### 5.4 Database
One table, `messages(id, session_id, role, content, metadata, created_at)`. Roles are `system`, `user`, `assistant`. The assistant row's `metadata` column holds the JSON metadata. History is isolated per `session_id`. A turn is written in a single transaction.

### 5.5 Failure-simulation hook
Header `X-Simulate-Failure: key_1=429` (or `key_1=500`, `key_1=429,key_2=500`, `*=429`) makes the named key fail *for that request only*, so you can demo failover without breaking real keys. Only works when `ENABLE_FAILURE_SIMULATION=true`. Requests with the header skip cache reads.

---

## 6. Frontend in detail

### 6.1 The redesign (what changed and why)
The old UI was a standard "indigo bubbles + sidebar" chat clone. The new one is built around the project's real differentiator: **showing the route**.

| Element | Description |
|---|---|
| **Theme** | Dark "mission control" look: deep ink background, drifting aurora glow, faint grid, glass panels, Space Grotesk + JetBrains Mono fonts |
| **Live route bar** (top) | While a request is in flight a glowing packet travels along a line ("routing request…"). When it finishes the bar shows the actual path: `you → Cache(miss) → key_1(✗) → key_2 → model` |
| **Color-coded replies** | Each reply is a card with a colored rail: **teal = live**, **lime = cache**, **amber = recovered via failover** |
| **Flight recorder** | Under every reply: source, model, route chips, a latency bar (relative to the slowest reply in the chat) and an input-vs-output token bar |
| **Session telemetry** | Sidebar tiles: replies, average latency, cache hits, failovers, total tokens |
| **Landing page** | "See how every answer is made." with the three paths explained and one-click starter prompts |
| **Composer** | Gradient glowing border, auto-growing textarea |

All `data-testid` attributes were preserved, so any automated UI tests still work.

### 6.2 How the UI talks to the backend
`api.js` reads `VITE_API_URL` (set **at build time**) and calls `/chat` and `/health`. Health is polled every 15 s for the status dot. Error messages are translated into human text (e.g. 503 → "All AI providers are currently unavailable…").

---

## 7. Configuration reference

| Variable | Where | Meaning |
|---|---|---|
| `LLM_API_KEYS` | backend | **Required.** Comma-separated key pool. 2+ recommended |
| `LLM_MODEL` | backend | Any LiteLLM model string. **Now `gemini/gemini-3.1-flash-lite`** |
| `DATABASE_URL` | backend | `sqlite:///./app.db` locally; `sqlite:////data/app.db` in Docker/Render (4 slashes = absolute) |
| `ALLOWED_ORIGINS` | backend | CORS: exact frontend origin(s), no trailing slash |
| `ENABLE_FAILURE_SIMULATION` | backend | `true` enables the demo header; set `false` for a real production service |
| `CACHE_TTL_SECONDS` | backend | Cache lifetime (default 86400) |
| `LLM_TIMEOUT_SECONDS` | backend | Per-attempt timeout (default 30) |
| `VITE_API_URL` | frontend (build time) | Backend URL as seen by the **browser** |

### Important finding: model change
`gemini-2.0-flash` and `gemini-2.5-flash` returned 404 ("no longer available to new users") for your key, so every chat failed with HTTP 502 `upstream provider error`. I tested the models your key can use and switched the default to **`gemini/gemini-3.1-flash-lite`** in `.env.example`, `config.py`, `render.yaml`, `README.md` and your local `.env` files. Verified live: first call ~1.4 s `LIVE_INFERENCE`, repeat call 4 ms `LLM_CACHE`, simulated `key_1=429` answered by `key_2` with `fallback_attempts: 1`. Google retires models often; if you see 502 again, change `LLM_MODEL` (no code change needed).

---

## 8. Running locally

```powershell
# Backend  (terminal 1)
cd backend
.venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.asgi:app --port 8000        # reads backend\.env

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                             # http://localhost:3000
```
Tests: `cd backend; python -m pytest -q` (38 pass, no keys needed).
Or with Docker: `docker compose up --build -d` (reads root `.env`).

---

## 9. Deployment guide

**Plan:** backend on **Render** (Docker), frontend on **Vercel**. Order matters because each needs the other's URL.

### Step 0 — Before you push to GitHub
- `.env` and `backend/.env` are gitignored. **Never commit real keys.** `.env.example` now contains placeholders only.
- If any key was ever pasted somewhere public, rotate it at https://aistudio.google.com/apikey.
- Push: `git init`, `git add .`, `git commit`, create a GitHub repo, `git push`.

### Step 1 — Backend on Render
1. Render dashboard → **New → Blueprint** → choose your repo (uses `render.yaml`).
   Or **New → Web Service**: Runtime *Docker*, Root directory `backend`.
2. Set environment variables:
   - `LLM_API_KEYS` = your keys, comma-separated (mark secret)
   - `LLM_MODEL` = `gemini/gemini-3.1-flash-lite`
   - `DATABASE_URL` = `sqlite:////data/app.db`
   - `ALLOWED_ORIGINS` = leave a placeholder for now (set in Step 3)
   - `ENABLE_FAILURE_SIMULATION` = `true` to keep the Failover demo, `false` for a real product
3. **Persistent disk** mounted at `/data` (≥1 GB). This needs a paid instance (Starter). Without it the SQLite file is wiped on every deploy/restart.
4. Health check path: `/health`. Deploy and note the URL, e.g. `https://lyftr-ai-backend.onrender.com`.
5. Run **one instance only** (in-memory cache + single-file SQLite).

### Step 2 — Frontend on Vercel
1. **New Project** → import repo → **Root Directory: `frontend`** (Vite auto-detected).
2. Environment variable: `VITE_API_URL=https://<your-backend>.onrender.com` (Production and Preview).
3. Deploy and note the URL, e.g. `https://lyftr-ai.vercel.app`.

### Step 3 — Connect them (CORS)
In Render, set `ALLOWED_ORIGINS=https://lyftr-ai.vercel.app` (exact origin, no trailing slash) and redeploy the backend.

### Step 4 — Verify
- `https://<backend>/health` → `{"status":"ok","keys_configured":2,…}`
- Open the Vercel URL, ask a question → teal `LIVE_INFERENCE` card.
- Ask it again after "New chat" → lime `LLM_CACHE` card, a few ms.
- Sidebar → Failover demo → "key_1 → 429" → amber card with failover count 1.

### Free-tier alternative
If you don't want to pay for a disk: deploy without it (history resets on restart), or move to Postgres (would need a code change in `db.py`).

### Common problems
| Symptom | Cause / fix |
|---|---|
| Chat shows "Cannot reach the backend" | Wrong `VITE_API_URL`, or backend asleep (free Render instances cold-start ~30–60 s) |
| Browser console CORS error | `ALLOWED_ORIGINS` doesn't exactly match the frontend origin |
| 502 "upstream provider error" | Model retired or bad request → change `LLM_MODEL` |
| 503 "all providers unavailable" | All keys rate-limited/invalid |
| Changed `VITE_API_URL` but nothing changed | It's baked in at build time → redeploy the frontend |
| History disappears after deploy | No persistent disk at `/data` |

---

## 10. Limitations and ideas for next steps

- Cache is per-process and cleared on restart (could use Redis).
- SQLite = single instance; use Postgres to scale horizontally.
- No user accounts: sessions are anonymous random ids, and a page reload starts a new session (history is stored but not yet listed in the UI).
- Replies are not streamed token-by-token.
- No Markdown / code-block rendering in replies.
- No rate limiting on `/chat` (anyone with your public URL can spend your API quota; consider auth or rate limits before sharing widely).
