# Security and authorization

## Authorization model
- Roles are **per community** (`community_memberships.role` + `status`). There is no global admin.
- `JwtAuthGuard` (global): verifies HS256 access token, loads the user, rejects disabled accounts.
- `CommunityAccessGuard` (global, opt-in per route with `@CommunityRole(MEMBER|ADMIN|OWNER)`): loads the
  caller's membership for `:communityId` from the database on every request. No membership → 404,
  not APPROVED → 403, insufficient role → 403.
- Services re-scope every child lookup by `communityId` (`findFirst({ where: { id, communityId } })`),
  so an id from another community is "not found" (IDOR-safe). Composite FKs enforce the same in PostgreSQL.
- Moderation rank: actor must outrank target (`canModerate`); self-moderation is refused; the owner role
  is immutable through the API.
- Realtime: socket auth at connect, DB membership check at room join, admin-only room for pending /
  dismissed / ack / membership events, immediate `socketsLeave` on suspension/removal/leave/demotion.
- Background work re-checks APPROVED status at fan-out time, so a member suspended after a broadcast was
  queued does not receive it.
- Web console hides controls by role for UX only; tests prove the API refuses regardless
  (`memberships.e2e-spec.ts`, `isolation.e2e-spec.ts`).

## Authentication
- argon2id password hashing; timing-equalised login for unknown emails; generic error messages.
- Access JWT 15 min. Refresh tokens: 256-bit random, stored as SHA-256, rotated on every use, grouped in
  families; presenting a rotated token revokes the family and writes an audit entry.
- Password reset and change revoke other sessions. OTPs are HMAC-hashed, 6 digits, 10 min, 5 attempts.
- Mobile: refresh token in iOS Keychain / Android Keystore via `expo-secure-store`; access token in memory.
- Web: refresh token in an httpOnly, SameSite=Strict, path-scoped cookie set by Next route handlers;
  Origin check on those handlers; access token only in memory.

## Input, transport and headers
- class-validator DTOs with `whitelist` + `forbidNonWhitelisted`; length limits shared via `Limits`.
- WhatsApp links: only `https://chat.whatsapp.com/<code>` (no credentials, ports or look-alike hosts).
- JSON body limit 100 kB; helmet headers on the API; strict CSP, frame-ancestors none, no-referrer on web.
- CORS allow-list (`CORS_ORIGINS`). `TRUST_PROXY` for correct client IPs behind a load balancer.

## Rate limiting and abuse prevention
| Surface | Limit | Store |
|---|---|---|
| login | 30/15 min per IP, 10/15 min per email | Redis |
| register | 10/h per IP | Redis |
| OTP check / resend, forgot/reset | 10/15 min, 5/h, 3/h | Redis |
| community preview (code guessing) | 20/h per user | Redis |
| join, create community, media upload | 20/h, 10/day, 30/h | Redis |
| emergency reports | 10 per 10 min per user per community (env) | Redis |
| critical alerts | 3 new broadcasts per 10 min per user per community (env) + coalescing | PostgreSQL (inside the advisory lock) |

The Redis limiter **fails open** (logged) so a Redis outage can never block an emergency. The critical
alert cap returns an explicit message telling the user to call emergency services and is audited —
genuine emergencies are never silently suppressed. Admins can suspend abusers; suspension takes effect
on the next request and immediately on sockets.

## Media
Private bucket; uploads only via presigned PUT signed for the declared content type and length;
allow-listed types and size caps; attachment requires object existence and exact size match; downloads via
5-minute presigned GET only when the caller may see the incident (dismissed/pending: admins + reporter);
every access audited. **Not yet done:** malware/content scanning, EXIF stripping (recommend an S3 event →
scanner Lambda, and stripping GPS EXIF before storage).

## Logging and privacy
- pino JSON logs with request ids; `authorization`, cookies, passwords, tokens, OTP codes redacted; only the
  URL path (no query string) is logged; email bodies never logged.
- Push data payload contains identifiers only; visible text can be reduced with `PUSH_INCLUDE_DETAILS=false`.
- Reporter identity hidden from non-admin members.
- Sentry with `sendDefaultPii: false`.

## Audit log
Append-only (`audit_logs` UPDATE/DELETE blocked by trigger). Recorded actions:
registration, email verification, password reset/change, refresh-token reuse, community create/update,
identification field change, invite code rotation, membership request/approve/reject/suspend/reinstate/
remove/leave, role change, emergency reported/confirmed/dismissed/broadcast queued/update/resolved,
critical alert triggered/coalesced/rate-limited, media accessed. Each row stores actor, community,
entity, metadata, IP, user agent and request id.

## Retention
Configurable via env (see assumptions A-21). A daily worker job deletes expired idempotency keys,
delivery rows, inbox notifications, dispatched outbox rows, expired OTPs/refresh tokens and abandoned
uploads. Incidents, timelines, updates, acknowledgments and audit logs are never deleted automatically.

## Secrets
No secrets in git (`.env*` ignored; `.env.example` contains placeholders; `.env.test` points only at local
docker services). Production secrets via the platform secret manager (deployment.md). The API refuses to
start in production with a placeholder JWT secret, mock push or non-SMTP mail.

## Known gaps (tracked)
- SMS/phone verification (A-2), media scanning, account deletion/anonymisation (A-20).
- Access tokens remain valid up to 15 min after logout (refresh is revoked immediately; community access
  is still re-checked on every request, so suspension is immediate).
- A professional penetration test is recommended before launch.
