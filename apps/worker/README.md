# @emcom/worker

The worker is **the same NestJS codebase as the API** with a different entrypoint
(`apps/api/src/worker.ts` → `WorkerModule`). It runs:

- the **outbox dispatcher** (PostgreSQL `outbox_events` → BullMQ, `FOR UPDATE SKIP LOCKED` leases),
- **fan-out** jobs (inbox notifications + one push delivery per device),
- **push** jobs (Mock / Expo / FCM providers, retry with exponential backoff, dead-letter → `FAILED`),
- **maintenance** (daily retention sweep).

```bash
pnpm worker:dev                 # from repo root, watches apps/api/src
node apps/api/dist/worker.js    # production (after `pnpm --filter @emcom/api build`)
```

Health/metrics on `WORKER_METRICS_PORT` (default 9464): `/health/live`, `/health/ready`, `/metrics`.
Scale horizontally by running more replicas; every step is idempotent.
