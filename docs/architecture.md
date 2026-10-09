# Architecture

```
                ┌──────────────────────┐        ┌───────────────────────┐
  Members ───▶  │ Mobile (Expo SDK 54) │        │ Admin web (Next.js 15)│ ◀── Owners / Admins
                └─────────┬────────────┘        └───────────┬───────────┘
                          │ HTTPS REST (+ Idempotency-Key)   │ REST + /api/session BFF (httpOnly cookie)
                          │ WSS Socket.IO /realtime          │ WSS Socket.IO
                          ▼                                  ▼
                ┌──────────────────────────────────────────────────────┐
                │ API process  (NestJS 11, apps/api/src/main.ts)       │
                │  guards: JWT → CommunityAccessGuard (per-community)  │
                │  modules: auth, communities, memberships, emergencies│
                │  critical-alerts, acknowledgments, media, devices,   │
                │  notifications(inbox), admin, realtime gateway       │
                └───────┬──────────────────────┬───────────────────────┘
          one transaction│: state + timeline +   │ Socket.IO Redis adapter
          audit + outbox │                       │ (multi-instance rooms)
                         ▼                       ▼
               ┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
               │ PostgreSQL 16    │     │ Redis 7          │     │ S3 / Spaces  │
               │ source of truth  │     │ BullMQ, rate     │     │ private media│
               │ + outbox_events  │     │ limits, pub/sub  │     │ presigned    │
               └────────┬─────────┘     └────────┬─────────┘     └──────────────┘
                        │ FOR UPDATE SKIP LOCKED │
                        ▼                        ▼
               ┌──────────────────────────────────────────────────────┐
               │ Worker process (same codebase, src/worker.ts)        │
               │  OutboxDispatcher → fanout queue → FanoutService     │
               │   (inbox rows + 1 delivery per device) → push queue  │
               │   → PushSenderService → Mock | Expo | FCM provider   │
               │  retries w/ exponential backoff, dead-letter = FAILED│
               │  retention job, metrics :9464                        │
               └──────────────────────────────────────────────────────┘
```

## Principles

1. **PostgreSQL is the source of truth.** An emergency state change, its timeline event, its audit row,
   the broadcast recipient snapshot and the *intent to notify* (outbox row) commit atomically.
   Nothing that matters lives only in Redis.
2. **At-least-once delivery, exactly-once effects.** Every hop is idempotent:
   outbox row → BullMQ jobId `outbox-<id>`; notification `UNIQUE(userId, dedupeKey)`;
   delivery `UNIQUE(notificationId, deviceTokenId)` and jobId = deliveryId; sends only from `QUEUED`.
3. **Authorization is per community, on the server, every time.** `CommunityAccessGuard` resolves the
   caller's membership for `:communityId`; services re-scope every lookup by `communityId`;
   composite foreign keys make cross-community children impossible at the database level.
4. **Commands, not status PATCHes.** `confirm`, `dismiss`, `updates`, `resolve`, `acknowledge`,
   `critical-alerts`, `approve`… each validates the transition under a row lock.
5. **Realtime is an accelerator, never the delivery path.** Socket events carry ids only; clients refetch.
   Backgrounded phones are reached by push; the inbox records everything.
6. **Honest UX.** "Sent" means *accepted by EMCOM and queued*. Provider acceptance ≠ device display ≠
   acknowledgment ≠ safety.

## Request flows

### Normal emergency
1. `POST /communities/:c/emergencies` (member, Idempotency-Key) → `PENDING` + `REPORTED` event +
   outbox `emergency.reported` → admins get `EMERGENCY_REPORT_RECEIVED` (HIGH).
2. `POST …/confirm` (admin) → row lock → `ACTIVE`, `CONFIRMED` event, `EmergencyAlert` (UNIQUE per
   emergency), recipient snapshot (APPROVED members), `COMMUNITY_ALERTED`, outbox `emergency.broadcast`.
3. Worker fans out `EMERGENCY_BROADCAST` (CRITICAL priority) + `EMERGENCY_CONFIRMED` to the reporter.
4. Members `acknowledge`; admins watch `/acknowledgments`; `updates` and `resolve` follow the same pattern.

### Critical alert
`POST /communities/:c/critical-alerts` → `pg_advisory_xact_lock(community)` → membership re-check →
coalesce into a recent active critical alert **or** cap check → create `ACTIVE/CRITICAL` + broadcast
(same `createBroadcast` as above) → 201 `{ broadcastStatus: "QUEUED" }`.

### Concurrency control
| Race | Guard |
|---|---|
| Two admins confirm / confirm vs dismiss | `SELECT … FOR UPDATE` on the emergency, then status check; `UNIQUE(emergency_alerts.emergencyId)` |
| Simultaneous critical triggers | per-community advisory lock + coalescing window |
| Retried requests | `idempotency_records UNIQUE(userId,key)`; loser of a race replays the winner |
| Double-tap acknowledge | `UNIQUE(alertId,userId)` + `createMany skipDuplicates` |
| Approve vs reject | conditional `updateMany WHERE status = <expected>` |
| Timeline ordering | `eventSeq` increment under the row lock → gapless `seq` per emergency |
| Refresh token double-use | conditional claim; reuse of a rotated token revokes the family |

## Codebase map

```
apps/api/src
  main.ts / worker.ts         two entrypoints, one codebase
  config/env.ts               zod-validated configuration (fails fast; rejects weak prod settings)
  common/                     guards, decorators, errors, pagination, idempotency, rate limit, prisma, redis
  modules/auth                register/login/refresh/logout/OTP/password reset
  modules/communities         create, preview, join, settings, identification field, code rotation
  modules/memberships         list/approve/reject/suspend/reinstate/remove/role/leave
  modules/emergencies         report, confirm, dismiss, updates, resolve, timeline, critical alerts, acks
  modules/media               presigned upload/download, attachment verification
  modules/notifications       inbox API, fan-out, push sender, providers (mock/expo/fcm), retention
  modules/outbox              outbox writer + dispatcher
  modules/realtime            Socket.IO gateway, room publisher, Redis adapter
  modules/admin, health, metrics, audit, mail, dev
apps/web                       Next.js admin console (+ /api/session cookie BFF)
apps/mobile                    Expo Router app (member + admin journeys)
apps/worker                    thin package that runs the API codebase's worker entrypoint
packages/shared-types          enums, DTO types, state machines, validation, deep-link routing
packages/api-client            typed fetch client with single-flight token refresh
```

## Scaling notes
- API is stateless; scale horizontally behind a load balancer with sticky sessions **not** required
  (Socket.IO uses the websocket transport and the Redis adapter).
- Workers scale horizontally; outbox leasing uses `SKIP LOCKED`; BullMQ distributes jobs.
- Fan-out is chunked (500 users) and push sending is concurrency-limited and rate-limited per worker.
- Hot paths are indexed: `(communityId,status,createdAt)` on emergencies, `(communityId,status,role)`
  on memberships, `(status,availableAt)` on outbox, `(userId,createdAt)` on notifications.
