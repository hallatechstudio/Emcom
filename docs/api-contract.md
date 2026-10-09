# API contract (v1)

- Base: `/v1`, JSON, versioned by URI. Interactive docs: `http://localhost:4000/docs` (Swagger).
- Machine-readable spec: `docs/openapi.json` (regenerate with `pnpm openapi`).
- Shared TypeScript contracts: `packages/shared-types` (DTO interfaces, enums) and the typed client
  `packages/api-client` used by both web and mobile.
- Auth: `Authorization: Bearer <access JWT>` (15 min). Everything is authenticated unless marked *public*.
- Validation: unknown body fields are rejected (`400 VALIDATION_FAILED`) — mass-assignment protection.
- Errors: `{ "error": { "code": "STRING", "message": "human readable", "details"?: …, "requestId": "…" } }`
- Pagination: `?limit=1..100&cursor=<opaque>` → `{ items: [...], nextCursor: string|null }` (keyset).
- Idempotency: send `Idempotency-Key: <8–100 chars>` on report, critical alert and update. Repeats return
  the original result; reusing a key for another operation → `409 IDEMPOTENCY_KEY_REUSED`.

## Error codes
`UNAUTHORIZED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `INVALID_CREDENTIALS`, `ACCOUNT_UNAVAILABLE`,
`EMAIL_NOT_VERIFIED`, `EMAIL_TAKEN`, `INVALID_CODE`, `VALIDATION_FAILED`, `NOT_FOUND`,
`MEMBERSHIP_NOT_ACTIVE`, `MEMBERSHIP_SUSPENDED`, `INSUFFICIENT_ROLE`, `FORBIDDEN`, `ALREADY_MEMBER`,
`IDENTIFICATION_REQUIRED`, `OWNER_CANNOT_LEAVE`, `OWNER_IMMUTABLE`, `INVALID_STATE_TRANSITION`,
`ALREADY_CONFIRMED`, `ALREADY_RESOLVED`, `EMERGENCY_NOT_ACTIVE`, `CONCURRENT_UPDATE`,
`IDEMPOTENCY_KEY_REUSED`, `INVALID_IDEMPOTENCY_KEY`, `UNSUPPORTED_MEDIA_TYPE`, `MEDIA_TOO_LARGE`,
`RATE_LIMITED`, `INTERNAL_ERROR`.

Community authorization semantics: **no membership → 404** (existence not revealed);
membership not APPROVED → `403 MEMBERSHIP_NOT_ACTIVE`; role too low → `403 INSUFFICIENT_ROLE`.

## Endpoints

### Auth & profile
| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /auth/register | public | `{fullName,email,phone,password}` → tokens + user; emails OTP |
| POST | /auth/login | public | generic error on bad credentials; rate-limited by IP and email |
| POST | /auth/refresh | public | rotates refresh token; reuse ⇒ family revoked |
| POST | /auth/logout | public | `{refreshToken}` revokes the session |
| POST | /auth/verify-email | user | `{code}` |
| POST | /auth/resend-verification | user | |
| POST | /auth/password/forgot | public | always 202 |
| POST | /auth/password/reset | public | `{email,code,newPassword}`; revokes all sessions |
| GET/PATCH | /me | user | profile |
| POST | /me/password | user | signs out other sessions |

### Communities & memberships
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /communities | verified user | creator = OWNER |
| GET | /communities/mine | user | all memberships incl. pending (preview only for non-approved) |
| GET | /communities/preview?code= | user | 20/hour |
| POST | /communities/join | verified user | `{code, identificationValue?}` → PENDING |
| GET | /communities/:c | MEMBER | `inviteCode` only for ADMIN+ |
| PATCH | /communities/:c | ADMIN | description/whatsappUrl; OWNER also name/type/location |
| PUT | /communities/:c/identification-field | OWNER | `{field: {label,required} \| null}` |
| POST | /communities/:c/invite-code/rotate | OWNER | members unaffected |
| GET | /communities/:c/membership | any status | caller's own membership |
| POST | /communities/:c/leave | self | owner cannot leave |
| GET | /communities/:c/members?status&role&q | ADMIN | |
| POST | /communities/:c/members/:m/{approve\|reject\|suspend\|reinstate\|remove} | ADMIN | rank rules |
| POST | /communities/:c/members/:m/role | OWNER | `{role: ADMIN\|MEMBER}` |

### Emergencies
| Method | Path | Role | Notes |
|---|---|---|---|
| POST | /communities/:c/emergencies | MEMBER | report; Idempotency-Key |
| POST | /communities/:c/critical-alerts | MEMBER | `{location?}`; → `{emergency, coalesced, broadcastStatus: QUEUED\|ALREADY_BROADCAST}` |
| GET | /communities/:c/emergencies?status=A,B&pathway&mine | MEMBER | visibility rules apply |
| GET | /communities/:c/emergencies/:e | MEMBER | |
| GET | …/:e/updates · …/:e/timeline | MEMBER | |
| POST | …/:e/acknowledge | MEMBER | idempotent |
| POST | …/:e/confirm | ADMIN | `{instructions?}` PENDING→ACTIVE + broadcast |
| POST | …/:e/dismiss | ADMIN | `{reason?}` |
| POST | …/:e/updates | ADMIN | `{message}`; Idempotency-Key |
| POST | …/:e/resolve | ADMIN | `{resolutionMessage}` required |
| GET | …/:e/acknowledgments | ADMIN | counts + push-state breakdown |
| GET | …/:e/acknowledgments/recipients?filter&q | ADMIN | paginated |

### Media
| POST | /communities/:c/media/uploads | MEMBER | `{contentType,sizeBytes}` → presigned PUT (10 min) |
| GET | /communities/:c/media/:id | MEMBER | 5-min presigned GET if the incident is visible; audited |

### Notifications & devices
| GET | /notifications?communityId&unreadOnly | user | inbox |
| GET | /notifications/unread-count | user | |
| POST | /notifications/:id/read · /notifications/read-all | user | |
| POST | /devices | user | `{token,platform,provider,appVersion?}` upsert (token refresh / owner change) |
| POST | /devices/unregister | user | own tokens only |
| GET | /devices | user | |

### Admin, ops, dev
| GET | /communities/:c/admin/overview?since= | ADMIN | members, pending requests, active, alerts today, pending reports |
| GET | /communities/:c/admin/audit-logs?action | ADMIN | |
| GET | /health/live · /health/ready | public | readiness checks DB + Redis |
| GET | /metrics | `METRICS_TOKEN` if set | Prometheus |
| GET | /v1/dev/mock-pushes | user, **non-production only** | caller's own mock deliveries |

## Realtime (Socket.IO namespace `/realtime`)
Handshake `auth: { token: <access JWT> }`. Client → `community:join {communityId}` → ack `{ok, error?}`
(DB-verified APPROVED membership). Server → envelopes
`{ communityId, emergencyId?, seq?, eventId, occurredAt, data }` for `emergency:created`,
`emergency:changed`, `emergency:update`, `emergency:ack` (admins), `membership:changed` (admins),
`community:revoked`. PENDING/DISMISSED events go only to the admin room. Sockets are disconnected when
the access token expires; on reconnect clients refetch.
