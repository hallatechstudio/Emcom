# Test plan

All automated tests use real PostgreSQL and Redis (docker compose) and the real S3-compatible store; only
the push transport (MOCK) and email (in-memory) are substituted. Integration tests run against the
separate `emcom_test` database and refuse to run elsewhere.

## Commands

```bash
pnpm db:up                                   # postgres, redis, s3, mailpit
pnpm --filter @emcom/api test                # unit + integration (migrates emcom_test first)
pnpm --filter @emcom/api test:unit
pnpm --filter @emcom/api test:integration
pnpm --filter @emcom/shared-types test
pnpm --filter @emcom/api-client test
pnpm --filter @emcom/web test                # vitest
pnpm --filter @emcom/mobile test             # jest-expo
pnpm test                                    # everything via turbo
```

## Required end-to-end scenarios → test location

| # | Scenario | Where |
|---|---|---|
| 1 | Register, create a community, join, approve | `api/test/integration/communities.e2e-spec.ts` "E2E 1" |
| 2 | One user, multiple communities, different roles | communities "E2E 2" |
| 3 | Normal report → admin notified → confirm & broadcast → acknowledge → update → resolve → history | `emergencies.e2e-spec.ts` |
| 4 | Dismissed report stays admin-only | emergencies "E2E 4" |
| 5 | Critical alert confirm → immediate broadcast intent, no admin approval | `critical-alerts.e2e-spec.ts` "E2E 5"; mobile `critical-confirm.test.tsx` |
| 6 | Critical alert cancel has no effect | critical-alerts "E2E 6"; mobile "NO, CANCEL makes no request" |
| 7 | Cross-community access & notification leakage | `isolation.e2e-spec.ts` |
| 8 | Pending / suspended / rejected / removed / left authorization | `memberships.e2e-spec.ts` matrix |
| 9 | Duplicate request & acknowledgment idempotency | critical-alerts "E2E 9", concurrency-admin, mobile retry-key test |
| 10 | Concurrent admin confirmation and alert creation | concurrency-admin "E2E 10", critical-alerts "E2E 10" |
| 11 | Queue outage, retry, recovery, duplicate jobs | `outbox-queue.e2e-spec.ts` (incl. real BullMQ workers) |
| 12 | WebSocket unauthorized join & membership revocation | `realtime.e2e-spec.ts` |
| 13 | Device token registration & invalid token handling | `devices.e2e-spec.ts` |
| 14 | Mobile navigation & notification deep links | `apps/mobile/__tests__/deeplinks.test.ts`, shared-types routing tests |
| 15 | Meaningful admin actions | concurrency-admin "E2E 15", memberships, communities; browser-verified web console |

Also: `db-invariants.e2e-spec.ts` (append-only tables, no incident deletion, one broadcast per emergency,
CHECK constraints, composite FKs), `auth.e2e-spec.ts` (OTP, refresh rotation/reuse, reset),
unit tests for providers (Expo/FCM/mock classification), state machines, enum drift, invite codes,
notification copy, env validation, API client refresh/idempotency.

## Manual checks
- Admin web in a browser against seeded data: login, live updates, confirm & broadcast, settings/QR,
  owner-only fields disabled for admins (done during development).
- Mobile in Expo Go on the iOS simulator: app boots and renders (done). Full flows on devices: see
  notification-strategy.md §5 (physical-device plan D1–D11).

## Not covered automatically (and why)
- Real FCM/APNs/Expo delivery (needs credentials and devices; adapters are unit-tested with HTTP fakes).
- Full mobile UI journeys end-to-end on a device (recommend Maestro flows on EAS builds — future work).
- Load testing (recommend k6: 5 000-member community, 10 concurrent critical alerts, fan-out latency SLO).
