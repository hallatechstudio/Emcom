# Data model

Schema: `apps/api/prisma/schema.prisma`. Migrations: `apps/api/prisma/migrations/` (Prisma Migrate;
hand-written invariants appended to the initial migration).

## Entities

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Account | `email` unique (stored lower-case); argon2id `passwordHash`; `emailVerifiedAt` |
| `otp_codes` | Email verification / password reset codes | HMAC-hashed, `attempts`, `expiresAt`, single use |
| `refresh_tokens` | Rotating refresh tokens | SHA-256 `tokenHash` unique; `familyId` (session); `revokedReason` |
| `communities` | Community | `inviteCode` unique; `whatsappUrl` validated in API |
| `community_code_history` | Retired invite codes | `code` unique → a code is never reissued |
| `community_identification_fields` | PRD §7 field | `communityId` unique (one per community) |
| `community_memberships` | Per-community role + status | `UNIQUE(communityId,userId)`; `UNIQUE(id,communityId)` (composite FK target); idx `(communityId,status,role)`, `(userId,status)` |
| `emergencies` | Incident (report or critical) | `pathway`, `status`; CHECKs (below); idx `(communityId,status,createdAt)`; delete blocked by trigger |
| `emergency_alerts` | The broadcast | `UNIQUE(emergencyId)` → never broadcast twice; FK `(emergencyId,communityId)` |
| `alert_recipients` | Ack baseline snapshot | `UNIQUE(alertId,userId)`; FKs `(alertId,communityId)`, `(membershipId,communityId)` |
| `alert_acknowledgments` | "I have seen this" | `UNIQUE(alertId,userId)`; same composite FKs |
| `emergency_updates` | Admin updates | FK `(emergencyId,communityId)` |
| `emergency_events` | Timeline | `UNIQUE(emergencyId,seq)`; append-only trigger |
| `emergency_media` | Photos/videos | private `objectKey`; `PENDING_UPLOAD → ATTACHED` |
| `device_tokens` | Push tokens | `token` unique (moves between accounts); `invalidatedAt` |
| `notifications` | In-app inbox | `UNIQUE(userId,dedupeKey)` (idempotent fan-out) |
| `notification_deliveries` | One per (notification, device) | `UNIQUE(notificationId,deviceTokenId)`; status QUEUED/PROVIDER_ACCEPTED/FAILED/INVALID_TOKEN/SKIPPED |
| `outbox_events` | Transactional outbox | `dedupeKey` unique; idx `(status,availableAt)` |
| `audit_logs` | Immutable audit trail | append-only trigger; idx `(communityId,createdAt)`, `(action,createdAt)` |
| `idempotency_records` | Replay protection | `UNIQUE(userId,key)`, scoped by operation |

## Database-enforced invariants (migration SQL)

```sql
-- audit_logs and emergency_events: UPDATE/DELETE raise 'append-only'
-- emergencies: DELETE raises (incidents are never hard-deleted routinely)
CHECK (pathway <> 'NORMAL'   OR category IS NOT NULL)
CHECK (pathway <> 'CRITICAL' OR status IN ('ACTIVE','RESOLVED'))
CHECK (status  <> 'RESOLVED' OR ("resolutionMessage" IS NOT NULL AND "resolvedAt" IS NOT NULL))
CHECK (status  <> 'DISMISSED' OR "dismissedAt" IS NOT NULL)
```
Composite foreign keys (`(alertId, communityId) → emergency_alerts(id, communityId)` etc.) make it
impossible for an acknowledgment, recipient, update or timeline event to reference a parent in a
different community. Covered by `apps/api/test/integration/db-invariants.e2e-spec.ts`.

## State machines (`packages/shared-types/src/state-machines.ts`)

```
Emergency:  PENDING ──confirm──▶ ACTIVE ──resolve──▶ RESOLVED
               └─────dismiss──▶ DISMISSED
            CRITICAL alerts are created ACTIVE.

Membership: (new) ─▶ PENDING ─approve─▶ APPROVED ─suspend─▶ SUSPENDED ─reinstate─▶ APPROVED
                        │ reject             │ remove/leave      │ remove
                        ▼                    ▼                   ▼
                     REJECTED ─join─▶ PENDING   REMOVED/LEFT ─join─▶ PENDING
```

## Timestamps
Every table has `createdAt`; significant transitions have their own: `confirmedAt`, `dismissedAt`,
`resolvedAt`, `requestedAt`, `decidedAt`, `approvedAt`, `suspendedAt`, `removedAt`, `broadcastAt`,
`acknowledgedAt`, `queuedAt`, `acceptedAt`, `failedAt`, `dispatchedAt`, `inviteCodeRotatedAt`.

## Seed data (`pnpm db:seed`)
Three communities with overlapping members in different roles (password in `prisma/seed.ts`,
default `Emcom!Demo2026`, override with `SEED_PASSWORD`):

| User | Jacob Mews (ESTATE, code JACOB4821) | Grace Chapel (CHURCH, GRACE7K2M) | Nova Works (WORKPLACE, NOVAW9P4) |
|---|---|---|---|
| owner@emcom.dev | OWNER | MEMBER | — |
| admin@emcom.dev | ADMIN | — | — |
| david@emcom.dev | MEMBER | OWNER | ADMIN |
| ada@emcom.dev | MEMBER | ADMIN | OWNER |
| pending@emcom.dev | PENDING | — | — |
| suspended@emcom.dev | SUSPENDED | — | — |
