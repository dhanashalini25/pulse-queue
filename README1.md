# PulseQueue

**Distributed Background Job Processing Platform**

PulseQueue is an asynchronous job-processing platform built on Node.js, Express, and BullMQ (Redis-backed). It supports queued tasks, concurrent worker execution, scheduling, priorities, automatic retries with exponential backoff, dead-letter handling, structured logging, and live operational monitoring — all through a REST API, a built-in dashboard UI, and Bull Board.

**Live demo:** https://pulse-queue-api.onrender.com
**Source:** https://github.com/dhanashalini25/pulse-queue

## Features

- **Job lifecycle management** — full status tracking (`waiting` → `active` → `completed`/`failed`), with structured execution logs for every transition.
- **Priorities** — `critical`, `high`, `normal`, `low` job priority levels.
- **Scheduling** — delay a job's execution by any amount of time (`delayMs`).
- **Retries & backoff** — configurable retry attempts per job with exponential backoff.
- **Dead-letter queue (DLQ)** — jobs that exhaust all retries are automatically moved to a DLQ for inspection and manual/automatic replay.
- **Concurrency control** — worker concurrency is configurable via environment variable.
- **Rate limiting** — the public API is protected with configurable rate limits.
- **Validation** — all job submissions are validated with Joi before entering the queue.
- **Live dashboard UI** — a custom operational dashboard at `/` with real-time stat tiles, a job-submission form, and an auto-refreshing recent-jobs table. Light/dark theme, no build step, zero extra dependencies.
- **Monitoring dashboard (Bull Board)** — a deeper, job-level admin UI at `/admin/queues` (Basic Auth protected) for inspecting individual jobs, retrying, and replaying failures.
- **Operational API** — REST endpoints for queue stats, job CRUD, retries, and DLQ replay.

## Architecture

```
                    ┌─────────────┐
   HTTP clients ───▶│  API server │──▶ dashboard UI, enqueue jobs, query status, DLQ ops
                    │  (Express)  │
                    └──────┬──────┘
                           │
                     ┌─────▼─────┐
                     │   Redis   │  (BullMQ-backed queues; Render calls its managed
                     │  /Valkey  │   version "Key Value" — fully Redis-compatible)
                     └─────┬─────┘
                           │
                    ┌──────▼──────┐
                    │   Worker    │──▶ processes jobs concurrently
                    │  (BullMQ)   │──▶ retries with backoff on failure
                    └──────┬──────┘──▶ sends exhausted jobs to Dead-Letter Queue
                           │
                    ┌──────▼──────┐
                    │ Bull Board  │  admin dashboard at /admin/queues
                    └─────────────┘
```

The API and worker are **independently scalable processes by design** — locally (via `docker-compose.yml`) and on any paid host, they run as two separate services against the same Redis. On Render's **free tier**, which doesn't offer a Background Worker service type, the worker instead runs *embedded* inside the API process (`EMBED_WORKER=true` — see `src/api/server.js` and the "Deploying to production" section below). Nothing about the job-processing logic changes between the two modes; only whether the worker has its own process.

## Project layout

```
pulse-queue/
├── public/                      # Static dashboard UI, served at "/"
│   ├── index.html               # Stat tiles, job form, recent-jobs table
│   └── app.js                   # Polls the REST API and renders the UI
├── src/
│   ├── api/
│   │   ├── server.js            # Express app, static UI mount, dashboard mount
│   │   ├── routes/jobs.js       # job CRUD endpoints
│   │   ├── routes/queueStats.js # stats / health / dead-letter endpoints
│   │   └── middleware/          # validation + rate limiting
│   ├── worker/
│   │   └── worker.js            # BullMQ worker: concurrency, retries, DLQ routing
│   ├── queue/
│   │   ├── queue.js             # queue definitions & core operations
│   │   └── processors/          # per-job-type business logic
│   ├── config/                  # redis connection, logger
│   └── scripts/seed.js          # demo job seeding script
├── tests/                       # smoke tests
├── Dockerfile
├── docker-compose.yml           # local dev: redis + api + worker (two processes)
├── render.yaml                  # one-click Render Blueprint (free tier, embedded worker)
└── .env.example
```

## Getting started (local)

### Option A — Docker Compose (recommended, no local Redis needed)

```bash
cp .env.example .env
docker compose up --build
```

This starts Redis, the API (port `4000`), and a separate worker process.

> **Port conflicts:** if `docker compose up` fails with `Bind for 0.0.0.0:6379 failed: port is already allocated` (or port `4000`), something else on your machine — another project, a native Redis install, a leftover container — already owns that port. Either stop the conflicting process (`docker ps -a` to find it, `docker stop <name>`) or remap the port in `docker-compose.yml` / `.env`. Also make sure Docker Desktop is actually running before `docker compose up` — `failed to connect to the docker API at npipe:...` means it isn't.

### Option B — Run natively

```bash
npm install
cp .env.example .env
# make sure Redis is running locally (e.g. `docker run -p 6379:6379 redis:7-alpine`)

# terminal 1
npm start           # API server on :4000

# terminal 2
npm run start:worker
```

To run everything as a single process locally (mirroring the free-tier Render setup), set `EMBED_WORKER=true` in `.env` and just run `npm start` — no second terminal needed.

### Seed some demo jobs

```bash
npm run seed
```

Then visit:
- **Dashboard UI:** http://localhost:4000 — live stats, a job-submission form, and recent jobs
- **Admin dashboard (Bull Board):** http://localhost:4000/admin/queues (login: `admin` / `changeme`, from `.env`)
- **Stats API:** http://localhost:4000/api/queue/stats

## Dashboard UI

`/` serves a self-contained operational dashboard (plain HTML/CSS/JS, no build step):

- Six live stat tiles — waiting, active, completed, failed, delayed, dead-letter — refreshed every 5 seconds from `/api/queue/stats`
- A **Submit a test job** form that posts directly to `/api/jobs`
- A **Recent jobs** table (status, priority, attempts, payload, time) via `/api/jobs`
- A live/unreachable status pill backed by `/health`
- Automatic light/dark theme via `prefers-color-scheme`
- Links out to the GitHub repo and the deeper Bull Board admin UI

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Enqueue a new job |
| `GET` | `/api/jobs?status=failed` | List jobs, optionally filtered by status |
| `GET` | `/api/jobs/:id` | Get job status, progress, and result |
| `POST` | `/api/jobs/:id/retry` | Manually retry a failed job |
| `DELETE` | `/api/jobs/:id` | Remove a job |
| `GET` | `/api/queue/stats` | Queue counts, throughput, health |
| `GET` | `/api/queue/dead-letter` | List dead-lettered jobs |
| `POST` | `/api/queue/dead-letter/:id/replay` | Requeue a dead-lettered job |
| `POST` | `/api/queue/pause` / `/resume` | Pause / resume processing |
| `GET` | `/api/info` | Service metadata (name, description, endpoint list) |
| `GET` | `/health` | Health check |
| `GET` | `/` | Dashboard UI (static) |

### Enqueue a job

```bash
curl -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "payload": { "to": "user@example.com", "subject": "Hello" },
    "priority": "high",
    "delayMs": 0,
    "attempts": 3
  }'
```

Built-in job types: `email`, `report`. Any other `type` value falls back to a generic echo processor, so the API works out of the box for demos — add real processors in `src/queue/processors/`.

## Environment variables

See `.env.example`. Key ones:

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Redis connection string (local or hosted) |
| `EMBED_WORKER` | If `true`, the API process also runs the BullMQ worker in-process — no separate worker service needed. Used on Render's free tier; leave unset for local dev / docker-compose, which already run two processes. |
| `WORKER_CONCURRENCY` | Max jobs a single worker processes in parallel |
| `JOB_DEFAULT_ATTEMPTS` / `JOB_BACKOFF_DELAY_MS` | Default retry policy |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Basic auth for `/admin/queues` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | API rate limiting |

## Tests

```bash
npm test
```

## Deploying to production (Render)

This repo ships with a `render.yaml` **Blueprint** that provisions two pieces on Render's **free tier**: the API web service (with the worker embedded in the same process) and a managed Key Value (Redis-compatible) instance.

1. Push this repo to GitHub.
2. Go to https://dashboard.render.com/blueprints and select **New Blueprint Instance**.
3. Connect your GitHub repo — Render reads `render.yaml` automatically.
4. Set the `DASHBOARD_USER` / `DASHBOARD_PASSWORD` secrets when prompted (marked `sync: false`) — these protect `/admin/queues`.
5. Click **Deploy Blueprint**. Render provisions the Key Value instance first, then builds and deploys the API from the Dockerfile.
6. Auto-deploy is on by default — every push to `main` redeploys automatically.

**Why the worker is embedded here:** Render's free plan doesn't offer a Background Worker service type (only Web Service, Key Value, and Postgres are free) — creating one prompts a plan-upgrade error. `render.yaml` works around this with `EMBED_WORKER=true`, which makes the API process also run the BullMQ worker (see the `if (process.env.EMBED_WORKER === 'true')` block in `src/api/server.js`). Functionally this is identical to the two-process setup — same queue, same retry/DLQ behavior — the only tradeoff is the API and worker can no longer scale independently, and a very heavy job could briefly slow down API responses.

**Running it as two independent services instead** (on a paid Render plan, or any other host): set `EMBED_WORKER=false` (or remove it) on the web service, and add a second service of `type: worker` with `dockerCommand: node src/worker/worker.js`, pointed at the same Redis/Key Value instance — exactly like `docker-compose.yml` does locally. The same Dockerfile works unmodified on Railway, Fly.io, or any container platform this way.

## License

MIT
