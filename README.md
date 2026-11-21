# Lyftr AI — LLM Chatbot with Key Failover and Response Caching

A full-stack chatbot (React + FastAPI + LiteLLM + SQLite) that fails over between API keys automatically, serves repeated prompts from LiteLLM's built-in cache, and shows resolution source, model, latency and token usage on **every** assistant message.

```
┌────────────┐  fetch   ┌───────────────────────────────────────────────┐
│ React (Vite)│ ───────▶ │ FastAPI                                       │
│ :3000       │          │  POST /chat ─▶ load history (SQLite)          │
└────────────┘          │             ─▶ LLMGateway                     │
                         │                 for key in [key_1, key_2, …]: │
                         │                   litellm.completion(         │
                         │                     api_key=key, caching=on)  │──▶ Gemini (or any LiteLLM provider)
                         │                 429 / quota / 5xx ─▶ next key │
                         │             ─▶ save user+assistant (SQLite)   │
                         └───────────────────────────────────────────────┘
```

## Project structure

```
backend/
  app/
    config.py     env-driven Settings (no secrets in code)
    db.py         SQLite access (stdlib sqlite3), schema created on startup
    gateway.py    key pool, failover loop, LiteLLM cache, X-Simulate-Failure parsing
    schemas.py    Pydantic request/response models + validation
    main.py       FastAPI app factory, routes, JSON error handlers, CORS
    asgi.py       `uvicorn app.asgi:app` entrypoint
  tests/          pytest suite (fake LiteLLM provider, no paid calls) + e2e_server.py
  Dockerfile      multi-stage, non-root, /data volume
frontend/
  src/            App.jsx, api.js, components/{Sidebar,Message,MetaBadges,Composer,Welcome}.jsx
  Dockerfile      multi-stage: node build -> nginx on :3000
docker-compose.yml  Makefile  .env.example  render.yaml
```

---

## 1. Live URLs

| Service  | URL |
|----------|-----|
| Frontend (Vercel) | _add after deploying — e.g. `https://<your-app>.vercel.app`_ |
| Backend (Render)  | _add after deploying — e.g. `https://<your-backend>.onrender.com` (`/health`, `/docs`)_ |

Nothing is deployed from this repository automatically; follow the steps below to produce these URLs.

### Deployment steps

#### Backend → Render
1. Push the repo to GitHub. In Render: **New → Blueprint** and select it (uses [`render.yaml`](render.yaml)), or create a **Web Service** with *Runtime: Docker*, *Root directory: `backend`*.
2. **Persistent disk:** attach a disk mounted at **`/data`** (≥1 GB). Disks need a paid instance (Starter+). Without a disk the SQLite file is wiped on every deploy/restart.
3. Environment variables: `LLM_API_KEYS` (secret), `LLM_MODEL`, `DATABASE_URL=sqlite:////data/app.db`, `ALLOWED_ORIGINS=https://<your-frontend>.vercel.app` (exact origin, no trailing slash), `ENABLE_FAILURE_SIMULATION=true` (set `false` for a real production service).
4. Health check path: `/health`. Render injects `$PORT`; the container honours it.
5. Because the cache is in-memory and SQLite is a single file, run **one instance**.

#### Frontend → Vercel
1. **New Project** → import the repo → **Root Directory: `frontend`** (Vite is auto-detected).
2. Set environment variable `VITE_API_URL=https://<your-backend>.onrender.com` (Production + Preview).
3. Deploy, then put the resulting URL into the backend's `ALLOWED_ORIGINS` and redeploy the backend. Order matters: CORS must list the exact Vercel origin.

`VITE_*` values are baked in at build time; production builds contain no hardcoded localhost URL (the localhost fallback exists only in `npm run dev`).

---

## 2. Run locally

### With Docker (recommended)

```bash
cp .env.example .env        # then put 2+ real keys in LLM_API_KEYS
make up                     # builds and starts both services
```

* Frontend: http://localhost:3000  ·  Backend: http://localhost:8000/health
* SQLite lives on the named volume `app_data`, mounted at `/data`.
* `make down` stops the stack, `make logs` tails logs, `make clean` also deletes the DB volume.
* No `make`? Run `docker compose up --build -d` directly.

### Without Docker

Requires Python 3.10+ (3.11 in Docker) and Node 18+.

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp ../.env.example .env                                 # edit keys; set DATABASE_URL=sqlite:///./app.db
uvicorn app.asgi:app --port 8000

# frontend (second terminal)
cd frontend
cp .env.example .env                                    # VITE_API_URL=http://localhost:8000
npm install
npm run dev                                             # http://localhost:3000
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `LLM_API_KEYS` | – (required) | Comma-separated key pool → `key_1`, `key_2`, … |
| `LLM_MODEL` | `gemini/gemini-3.1-flash-lite` | Any LiteLLM model string. **If Google has retired this model, set a current one (e.g. `gemini/gemini-3.5-flash-lite`).** |
| `DATABASE_URL` | `sqlite:///./app.db` (`sqlite:////data/app.db` in Docker) | SQLite file path (4 slashes = absolute) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `ENABLE_FAILURE_SIMULATION` | `false` | Enables the `X-Simulate-Failure` header |
| `CACHE_TTL_SECONDS` | `86400` | Lifetime of cache entries |
| `LLM_TIMEOUT_SECONDS` | `30` | Per-attempt provider timeout |
| `VITE_API_URL` | – | Frontend build-time: backend URL as seen by the **browser** |

### API examples

```bash
curl localhost:8000/health
# {"status":"ok","keys_configured":2,"cache_enabled":true}

curl -X POST localhost:8000/chat -H 'content-type: application/json' \
  -d '{"session_id":"s-123","message":"What is the capital of France?"}'
# {"session_id":"s-123","reply":"…","metadata":{"resolution_source":"LIVE_INFERENCE","model":"gemini/gemini-3.1-flash-lite",
#   "latency_ms":812,"input_tokens":42,"output_tokens":9,"key_id":"key_1","fallback_attempts":0}}

curl localhost:8000/sessions/s-123/messages      # oldest first; 404 {"detail":"session not found"} if unknown
```

Errors are always JSON with a `detail` field: `422` validation, `404` unknown session, `503 {"detail":"all providers unavailable"}`, `502` for a non-retryable provider error (e.g. 400), `500` generic.

### Tests

```bash
cd backend && pip install -r requirements-dev.txt && python -m pytest -q     # or: make test
```

38 tests cover health, validation, multi-turn context, session isolation, history order, 404s, cache hit/miss, failover, total failure, the simulation hook, non-persistence of failed requests, per-request tokens, CORS, and secret leakage. A **fake LiteLLM custom provider** replaces the network hop only: requests still run through the real `litellm.completion`, so LiteLLM's actual cache and exception types are exercised. Tests need no API keys.

---

## 3. Design decisions

### Key fallback
`LLM_API_KEYS=a,b,c` becomes an ordered pool with ids `key_1, key_2, key_3`. `LLMGateway.complete` loops over the pool and calls `litellm.completion(api_key=…, num_retries=0)` for each key (LiteLLM's own retries are off so failover is explicit and fast). A failure moves to the next key when it is retryable: **429, quota/resource-exhausted, 5xx, timeouts/connection errors, and 401/403** (a bad key is key-specific). Non-retryable errors (e.g. 400) are *not* retried against other keys, since they would fail identically; they return 502. Each failed attempt increments `fallback_attempts`; the winning key is reported as `key_id`. If every key fails → `503 {"detail":"all providers unavailable"}`. State is per request: nothing is ever "disabled", so a key that recovers is used again on the next request. The UI shows the user nothing if another key succeeds.

### Caching
LiteLLM's built-in cache (`litellm.cache = Cache(type="local")`, in-memory — no Redis, no custom cache). The cache key is derived from **model + the full message list sent to the LLM** (system prompt + history + new message), and *not* from the API key, so a response generated through `key_1` can be served after `key_1` dies. Consequences: identical first messages in different sessions hit; a different prompt, history or system prompt misses. On a hit the response (and its stored token usage) comes straight from the cache, `resolution_source` is `LLM_CACHE`, `key_id` is `null`, and `fallback_attempts` is `0`. Hits are detected from LiteLLM's own `cache_hit` flag. Trade-off: the in-memory cache is per process and cleared on restart (LiteLLM's Redis/S3 backends were excluded by the assignment). Entries expire after `CACHE_TTL_SECONDS`.
Latency is measured with `time.perf_counter()` around the provider/cache call, so a cache hit is typically single-digit ms versus hundreds of ms live.

### SQLite session storage
One `messages` table exactly as specified (`id, session_id, role, content, metadata, created_at`), created on startup. Each successful turn writes the user row and the assistant row (plus a `system` row when a new system prompt is supplied) in **one transaction**, after the LLM succeeded — so failed requests leave no trace. History for a request is read per `session_id` in `id` order, which isolates sessions and keeps chronological order. The assistant row's `metadata` column holds the JSON metadata. `system` rows are used as context for later turns in that session but are filtered out of `GET /sessions/{id}/messages`. Token counts are whatever the provider reports for *that* call (prompt = system + history + new message), never cumulative. The DB path comes from `DATABASE_URL`; Docker mounts a named volume at `/data`.

### Secrets and errors
API keys exist only in backend environment variables; they are never logged, returned, or sent to the browser (a test asserts they never appear in responses). Error responses are JSON only, with no stack traces.

### Failure-simulation hook
`X-Simulate-Failure: key_1=429`, `key_1=500`, `key_1=429,key_2=500`, `*=429` (only when `ENABLE_FAILURE_SIMULATION=true`). The named key raises a real LiteLLM `RateLimitError`/`InternalServerError` *instead of calling the provider*, for that request only; the next key then makes a real LLM call, so a simulated failover returns genuine generated text. Because it targets the live path, requests carrying the header **bypass cache reads** (otherwise a cached prompt would hide the simulated outage).

---

## 4. Verification

Use the UI at http://localhost:3000 or curl. Metadata is on every assistant bubble (`meta-source`, `meta-model`, `meta-latency`, `meta-input-tokens`, `meta-output-tokens`, plus key and failover badges).

**Per-message token usage** — send two messages in one chat; turn 2's `in` count is larger than turn 1's because it includes history, and each bubble has its own numbers.

**Cache hit**
```bash
for s in a b; do curl -s -X POST localhost:8000/chat -H 'content-type: application/json' \
  -d "{\"session_id\":\"cache-$s\",\"message\":\"Name three primary colors.\"}" | jq -c '.metadata'; done
# 1st: LIVE_INFERENCE, key_1   2nd: LLM_CACHE, key_id null, fallback_attempts 0, identical reply, far lower latency
```
In the UI: ask the same thing, click **New chat**, ask it again → green `LLM_CACHE` badge.

**Failover**
```bash
# key_1 fails, key_2 answers (HTTP 200, key_id "key_2", fallback_attempts 1)
curl -s -X POST localhost:8000/chat -H 'content-type: application/json' -H 'X-Simulate-Failure: key_1=429' \
  -d '{"session_id":"fo-1","message":"hello"}' | jq .metadata

# everything fails -> 503 {"detail":"all providers unavailable"}, and nothing is stored:
curl -si -X POST localhost:8000/chat -H 'content-type: application/json' -H 'X-Simulate-Failure: *=429' \
  -d '{"session_id":"fo-2","message":"hello"}'
curl -s localhost:8000/sessions/fo-2/messages      # -> {"detail":"session not found"}
```
In the UI: sidebar → **Failover demo** → pick a scenario, then chat.
A genuine (non-simulated) failover also happens if a key is invalid: put a bad key first in `LLM_API_KEYS`; the provider returns 401 and the next key is used.

---

## 5. Setup Used

* **Editor:** VS Code (Claude Code extension).
* **AI tools:** Claude Code (Claude Sonnet 5.5) wrote the implementation, tests and docs from the assignment spec; I reviewed and ran everything.
* **Stack:** FastAPI, LiteLLM 1.110, Pydantic 2, SQLite, React 18 + Vite 6, Tailwind CSS 4, lucide-react, pytest, Playwright (browser E2E checks, run from outside the repo), Docker/Compose.

> Edit this section to match your own setup before submitting.

---

## 6. Bonus features

* **Failover demo selector** in the sidebar — triggers the simulation header without curl, so failover is demonstrable live.
* **Key ID and failover badges** per message, beyond the required five fields.
* **Backend connection indicator** polling `/health`.
* **Honest error UX:** a failed turn is removed from the chat and the text restored to the input, mirroring the server (which stores nothing).
* **Cache warm-up** at startup so the first cache hit isn't slowed by LiteLLM's lazy imports.
* **Atomic persistence** (single transaction per turn) and a persistent system prompt per session.
* Copy-reply button, suggestion chips, auto-growing composer, mobile drawer layout.
#   L y f t r _ A I  
 