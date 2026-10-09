# Deployment and operations

> Nothing in this repository has been deployed to a cloud environment. This is a reproducible plan;
> the Docker images were built locally and CI builds/pushes them on `main`.

## Topology (recommended: DigitalOcean or AWS)

| Component | DigitalOcean | AWS | Notes |
|---|---|---|---|
| API (2+ instances) | App Platform service or Droplets behind LB | ECS Fargate service + ALB | image `api`, CMD `node dist/main.js`, port 4000, WebSockets enabled on LB |
| Worker (2+ instances) | App Platform worker | ECS service (no LB) | same image, CMD `node dist/worker.js`; scale on `emcom_queue_jobs{state="waiting"}` |
| Admin web | App Platform static/service | ECS or Amplify | image `web`, port 3001 |
| PostgreSQL 16 | Managed Database (HA standby) | RDS Multi-AZ | private network only, TLS required |
| Redis 7 | Managed Redis/Valkey | ElastiCache (Multi-AZ, AOF) | private only; `maxmemory-policy noeviction` (BullMQ requirement) |
| Object storage | Spaces (private) | S3 (private, SSE, Block Public Access) | CORS: allow PUT/GET from the app origins |
| TLS / reverse proxy | LB-managed certs | ACM + ALB | HTTPS only, HSTS, HTTP→HTTPS redirect; WebSocket idle timeout ≥ 60 s |
| Secrets | App Platform encrypted env | Secrets Manager / SSM | never baked into images |
| Monitoring | Prometheus/Grafana (or DO Monitoring), Sentry | AMP/Grafana or CloudWatch, Sentry | alerts in notification-strategy.md §4 |

**Never expose PostgreSQL or Redis to the public internet.** Put them in a VPC/private network and allow
only the API and worker security groups.

## Environment (production)
Set everything from `apps/api/.env.example` with real values. Mandatory differences:
`NODE_ENV=production`, strong `JWT_ACCESS_SECRET` (`openssl rand -base64 48`), real `SMTP_*`,
`MAIL_TRANSPORT=smtp`, `PUSH_PROVIDERS` without `MOCK` (after the provider review), `EXPO_ACCESS_TOKEN`
and/or `FCM_*`, `S3_*` (no `S3_AUTO_CREATE_BUCKET`), `CORS_ORIGINS=https://admin.example.com`,
`TRUST_PROXY=true`, `SWAGGER_ENABLED=false` (or protect it), `METRICS_TOKEN`, `SENTRY_DSN`.
The API refuses to boot with placeholder secrets, mock push or non-SMTP mail in production.

Web build args: `NEXT_PUBLIC_API_URL=https://api.example.com`, `NEXT_PUBLIC_MEDIA_ORIGIN=https://<bucket host>`;
runtime env `API_INTERNAL_URL` (private API URL for the session route handlers).
Mobile: set `EXPO_PUBLIC_API_URL` per EAS profile (`apps/mobile/eas.json`) and `extra.eas.projectId`.

## Release procedure
1. CI green on `main` → images `ghcr.io/<repo>/api:<sha>` and `web:<sha>`.
2. **Migrate first** (one-off task, same image): `npx prisma migrate deploy`.
   Migrations must be backward compatible with the previous release (expand → deploy → contract).
3. Roll out workers, then API, then web (rolling update, health checks on `/health/ready`).
4. Smoke test: `/health/ready`, login on web, create a test report in a staging community, check the
   Dev/ops dashboard for fan-out latency.

## Rollback
- Application: redeploy the previous image tag (stateless services).
- Database: migrations are forward-only; ship a new migration to revert schema changes. For a destructive
  mistake, restore from PITR (below) into a new instance and cut over.
- Outbox rows written by the new version are processed by the old worker only if their `type` exists —
  never remove an outbox type in the same release that stops producing it.

## Graceful shutdown & scaling
- API: `enableShutdownHooks()` closes HTTP, sockets (clients reconnect elsewhere), Prisma and Redis.
- Worker: on SIGTERM stops leasing outbox rows, lets in-flight BullMQ jobs finish (`worker.close()`),
  then exits; unfinished jobs are retried by other replicas. Give it ≥ 30 s termination grace.
- Both are horizontally scalable; outbox leasing (`SKIP LOCKED`) and BullMQ make concurrent workers safe.

## Backups & disaster recovery
| Asset | Backup | Target |
|---|---|---|
| PostgreSQL | Managed automated backups + point-in-time recovery (≥ 7 days; 30 recommended); weekly logical dump to a separate account/region | RPO ≤ 5 min, RTO ≤ 1 h |
| Redis | AOF persistence; not a system of record (outbox replays undispatched work) | — |
| Object storage | Versioning + lifecycle; cross-region replication if required | — |

DR drill (quarterly): restore the latest PITR into a scratch instance, run `prisma migrate status`,
point a staging API at it, verify counts and a sample incident timeline.

If Redis is lost: start a fresh Redis; workers re-dispatch every `PENDING` outbox row; already
`DISPATCHED` rows whose jobs were lost can be re-queued with
`UPDATE outbox_events SET status='PENDING', "availableAt"=now() WHERE "dispatchedAt" > now() - interval '1 hour';`
— safe because fan-out and sends are idempotent.

## Data operations
- Incidents and audit logs cannot be deleted through the application (DB triggers). A lawful erasure
  request requires a reviewed DBA procedure (disable trigger in a transaction, anonymise rather than
  delete, record the action) — document each occurrence.
- Media: recommended S3 event → malware scanner before objects are served; strip GPS EXIF.

## Local container run
```bash
cp apps/api/.env.example apps/api/.env
docker compose --profile app up --build      # api :4000 + worker, plus infra
docker compose run --rm api npx prisma migrate deploy
```
