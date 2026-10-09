# Implementation plan and status

Built as vertical slices; each slice ended with checks run and the requirements matrix updated.

| # | Slice | Status | Evidence |
|---|---|---|---|
| 1 | Workspace bootstrap (pnpm + turbo), docker compose (Postgres, Redis, S3, Mailpit), env, shared packages | ✅ | `docker-compose.yml`, `packages/*` |
| 2 | Database (Prisma schema + migration + DB invariants), auth (register/OTP/login/refresh rotation/reset), memberships | ✅ | `auth`, `memberships`, `db-invariants` suites |
| 3 | Community create / preview / join / approve / settings / identification field / code rotation | ✅ | `communities` suite |
| 4 | Normal emergency end-to-end (report, media, confirm, dismiss) | ✅ | `emergencies` suite |
| 5 | Critical alert end-to-end (idempotency, advisory lock, coalescing, cap) | ✅ | `critical-alerts` suite |
| 6 | Durable notifications (outbox, BullMQ, fan-out, providers, inbox, devices) + realtime gateway | ✅ | `outbox-queue`, `devices`, `realtime` suites |
| 7 | Acknowledgments, updates, resolution, timeline, history | ✅ | `emergencies`, `concurrency-admin` |
| 8 | Mobile UX (all 22 member screens + admin journeys, deep links, permission education, offline) | ✅ | `apps/mobile`, jest suites, Android bundle export, iOS simulator boot |
| 9 | Admin web (all admin screens) | ✅ | `apps/web` build + browser verification |
| 10 | Security hardening, CI, Dockerfiles, docs | ✅ | `.github/workflows/ci.yml`, `infra/docker/*`, `docs/*` |

## Remaining work (outside this build's reach)
1. **Provider/legal decision on push transport** (FCM/Expo terms on emergency use) — blocker for production.
2. EAS project + FCM/APNs credentials; development build; physical-device test plan D1–D11.
3. iOS Critical Alerts entitlement application (optional, if eligible).
4. SMS phone verification and optional SMS fallback (provider contracts).
5. Media malware scanning / EXIF stripping; account deletion/anonymisation flow.
6. Cloud deployment (infrastructure accounts not available here), load test, penetration test.
7. Maestro/Detox device UI tests on EAS builds.
