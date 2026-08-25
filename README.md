# PulseQueue

**Distributed Background Job Processing Platform**

PulseQueue is an asynchronous job-processing platform built on Node.js, Express, and BullMQ (Redis-backed). It supports queued tasks, concurrent worker execution, scheduling, priorities, automatic retries with exponential backoff, dead-letter handling, structured logging, and live operational monitoring.

## Features

- **Job lifecycle management** — full status tracking (`waiting` → `active` → `completed`/`failed`), with structured execution logs for every transition.
- **Priorities** — `critical`, `high`, `normal`, `low` job priority levels.
- **Scheduling** — delay a job's execution by any amount of time (`delayMs`).
- **Retries & backoff** — configurable retry attempts per job with exponential backoff.
- **Dead-letter queue (DLQ)** — jobs that exhaust all retries are automatically moved to a DLQ for inspection and manual/automatic replay.
- **Concurrency control** — worker concurrency is configurable via environment variable.
- **Rate limiting** — the public API is protected with configurable rate limits.
- **Validation** — all job submissions are validated with Joi before entering the queue.
- **Monitoring dashboard** — a live Bull Board UI at `/admin/queues` (Basic Auth protected) showing queue health, worker activity, throughput, and failed jobs.
- **Operational API** — REST endpoints for queue stats, job CRUD, retries, and DLQ replay.

## Architecture

```
                    ┌─────────────┐
   HTTP clients ───▶│  API server │──▶ enqueue jobs, query status, DLQ ops
                    │  (Express)  │
                    └──────┬──────┘
                           │
                     ┌─────▼─────┐
                     │   Redis   │  (BullMQ-backed queues)
                     └─────┬─────┘
                           │
                    ┌──────▼──────┐
                    │   Worker    │──▶ processes jobs concurrently
                    │  (BullMQ)   │──▶ retries with backoff on failure
                    └──────┬──────┘──▶ sends exhausted jobs to Dead-Letter Queue
                           │
                    ┌──────▼──────┐
                    │ Bull Board  │  live dashboard at /admin/queues
                    └─────────────┘
```

The API process and worker process are **independently scalable** — run many worker instances against the same Redis to increase throughput without touching the API tier.

## Project layout

```
pulse-queue/
├── src/
│   ├── api/
│   │   ├── server.js            # Express app + dashboard mount
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
├── docker-compose.yml           # local dev: redis + api + worker
├── render.yaml                  # one-click Render deployment blueprint
└── .env.example
```

## Getting started (local)

### Option A — Docker Compose (recommended, no local Redis needed)

```bash
cp .env.example .env
docker compose up --build
```

This starts Redis, the API (port `4000`), and a worker.

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

### Seed some demo jobs

```bash
npm run seed
```

Then visit:
- **Dashboard:** http://localhost:4000/admin/queues (login: `admin` / `changeme`, from `.env`)
- **Stats API:** http://localhost:4000/api/queue/stats

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
| `GET` | `/health` | Health check |

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
| `WORKER_CONCURRENCY` | Max jobs a single worker processes in parallel |
| `JOB_DEFAULT_ATTEMPTS` / `JOB_BACKOFF_DELAY_MS` | Default retry policy |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | Basic auth for `/admin/queues` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | API rate limiting |

## Tests

```bash
npm test
```

## Deploying to production (Render)

This repo ships with a `render.yaml` **Blueprint** that provisions three pieces: the API web service, a worker service, and a managed Redis instance.

1. Push this repo to GitHub (see below).
2. Go to https://dashboard.render.com/blueprints and select **New Blueprint Instance**.
3. Connect your GitHub repo — Render will read `render.yaml` automatically.
4. Set the `DASHBOARD_USER` / `DASHBOARD_PASSWORD` secrets when prompted (marked `sync: false`).
5. Deploy. Render builds both services from the same `Dockerfile` with different start commands.

The same `Dockerfile` works unmodified on Railway, Fly.io, or any container platform — just set the `REDIS_URL` env var to a managed Redis instance and run `node src/api/server.js` for the API and `node src/worker/worker.js` for the worker as two separate services/processes.

## License

MIT
