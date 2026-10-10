# EMCOM — Community Emergency Alert

*Your Community's Emergency Network.*

Multi-community emergency alerting: members report emergencies or raise a Critical Alert, admins verify
and broadcast, members acknowledge, admins post updates and resolve — with a permanent timeline.
EMCOM is **not** a replacement for police, fire, ambulance or other emergency services.

| Part | Tech | Path |
|---|---|---|
| API + worker | NestJS 11, Prisma 6 / PostgreSQL 16, BullMQ / Redis 7, Socket.IO | `apps/api` (worker entrypoint: `src/worker.ts`, wrapper `apps/worker`) |
| Admin console | Next.js 15, Tailwind, shadcn-style UI, TanStack Query | `apps/web` |
| Mobile app | Expo SDK 54, Expo Router, TanStack Query, Zustand, RHF + Zod | `apps/mobile` |
| Shared | types/state machines/validation; typed API client | `packages/shared-types`, `packages/api-client` |

Docs: [requirements matrix](docs/requirements-matrix.md) · [architecture](docs/architecture.md) ·
[data model](docs/data-model.md) · [API](docs/api-contract.md) · [security](docs/security-and-authorization.md) ·
[notifications](docs/notification-strategy.md) · [assumptions](docs/assumptions.md) · [tests](docs/test-plan.md) ·
[deployment](docs/deployment.md) · [plan/status](docs/implementation-plan.md)

## Local setup (one time)

Requirements: Node 20.11+, pnpm 9 (`corepack enable`), Docker.

```bash
pnpm install
pnpm db:up                                   # Postgres :5433, Redis :6380, S3 :9000, Mailpit :8025
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @emcom/shared-types build && pnpm --filter @emcom/api-client build
pnpm db:migrate                              # prisma migrate dev
pnpm db:seed                                 # demo communities & users
```

## Run (four terminals)

```bash
pnpm api:dev        # http://localhost:4000  (Swagger: /docs)
pnpm worker:dev     # outbox → fan-out → push (mock); metrics :9464
pnpm web:dev        # http://localhost:3001  admin console
pnpm mobile:start   # Expo Go; press i (iOS simulator) / a (Android) or scan the QR (Expo Go SDK 54)
                    # with an EAS development build installed: pnpm --filter @emcom/mobile start:dev-client
```

A phone on the same Wi-Fi reaches the API automatically (`http://<Metro host>:4000`). For media uploads from
a phone, set `S3_PUBLIC_ENDPOINT=http://<your-LAN-IP>:9000` in `apps/api/.env`.

### Demo logins
All seeded accounts use the password defined in `apps/api/prisma/seed.ts` (`SEED_PASSWORD`, default
`Emcom!Demo2026`) — local development only.

| Email | Jacob Mews (`JACOB4821`) | Grace Chapel (`GRACE7K2M`) | Nova Works (`NOVAW9P4`) |
|---|---|---|---|
| owner@emcom.dev | Owner | Member | — |
| admin@emcom.dev | Admin | — | — |
| david@emcom.dev | Member | Owner | Admin |
| ada@emcom.dev | Member | Admin | Owner |
| pending@emcom.dev | Pending | — | — |
| suspended@emcom.dev | Suspended | — | — |

### Seeing notifications locally
No FCM/APNs credentials are needed. In development the app registers a **mock** push token; every push the
worker sends is recorded and visible in the admin console → **Dev push log**, or `GET /v1/dev/mock-pushes`.
Verification/reset emails land in **Mailpit** at http://localhost:8025. The in-app inbox and realtime updates
work in Expo Go. Real pushes need an EAS development build — see `apps/mobile/README.md`.

## Tests

```bash
pnpm db:up
pnpm --filter @emcom/api test        # 24 unit + 67 integration tests against real Postgres/Redis/S3
pnpm --filter @emcom/web test
pnpm --filter @emcom/mobile test
pnpm --filter @emcom/shared-types test && pnpm --filter @emcom/api-client test
```

## Status
All PRD MVP workflows are implemented and tested locally. **Before production**, see
[implementation-plan.md → Remaining work](docs/implementation-plan.md) — in particular the push-provider
eligibility review in [notification-strategy.md §2](docs/notification-strategy.md).
