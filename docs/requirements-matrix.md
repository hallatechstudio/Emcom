# EMCOM — Requirements Matrix

Source of truth: **EMCOM PRD** (`Emcom 2.pdf`, 21 pages, A4). Page numbers below are PDF pages.
Status: ✅ implemented & tested · 🟡 implemented, limitation noted · ⛔ blocked (reason given) · ➖ excluded by PRD.
"Ext" marks an **engineering recommendation** that extends the PRD (not a source requirement).

Test references: `api:` = `apps/api/test/**`, `web:` = `apps/web/src/**/*.test.*`, `mob:` = `apps/mobile/__tests__/**`.

## 1. Product scope (§1–§2, p.1)

| ID | Requirement (PRD) | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-1.1 | Platform for organized communities (estates, neighborhoods, churches, schools, workplaces, hotels, apartment complexes, industrial facilities) | 1 | ✅ | `CommunityType` enum (+ `OTHER`, Ext) | api: communities |
| R-1.2 | Not a replacement for police/fire/ambulance | 1 | ✅ | Disclaimer on Welcome, Home, Profile, permission education, critical-alert error states | — |
| R-2.1 | Two entry paths: Normal Emergency (report→verify→alert→ack→updates→resolve) and Critical Alert (trigger→confirm→alert→updates→resolve) | 1 | ✅ | `emergencies.service.ts`, `critical-alerts.service.ts`; `pathway` NORMAL/CRITICAL | api: emergencies, critical-alerts |
| R-2.2 | Critical Alert does not require Admin approval | 1 | ✅ | Created directly `ACTIVE` with broadcast | api: critical-alerts "E2E 5" |

## 2. Users & roles (§3, p.2)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-3.1 | Member: create account, join communities, belong to many, report, trigger critical, receive/ack alerts, receive updates, view active & history | 2 | ✅ | Mobile member screens; API member routes | api: communities "E2E 2", emergencies |
| R-3.2 | Admin: approve/reject, manage members, receive reports, confirm, broadcast, updates, monitor acks, resolve, history, manage settings | 2 | ✅ | `@CommunityRole('ADMIN')` routes; web console; mobile admin | api: memberships, emergencies, concurrency-admin |
| R-3.3 | Owner: everything Admin can + add/remove admins, configure community, configure identification field, regenerate code | 2 | ✅ | `@CommunityRole('OWNER')` on role/identification/rotate; owner-only fields in PATCH | api: memberships "only the owner…", communities |
| R-3.4 | Roles are per community (Ext: explicit in prompt) | 2–3 | ✅ | `CommunityMembership(role,status)` unique per (community,user); `CommunityAccessGuard` | api: communities "E2E 2", isolation |

## 3. Multi-community (§4, p.3)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-4.1 | One user can belong to multiple communities | 3 | ✅ | Membership table; My Communities screen; switcher (web + mobile "Switch") | api: "E2E 2" |
| R-4.2 | Each community has own members, admins, emergencies, alerts, updates, history | 3 | ✅ | `communityId` on every scoped table; composite FKs keep children in the same community | api: db-invariants |
| R-4.3 | **An alert from Community A must NEVER reach Community B** | 3 | ✅ | Recipient snapshot by `communityId`; send-time membership re-check; room-scoped realtime; composite FKs | api: isolation (all), realtime |

## 4. Account (§5, p.3)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-5.1 | Create account: full name, email, phone, password | 3 | ✅ | `POST /v1/auth/register`; mobile Create Account | api: auth |
| R-5.2 | OTP verification where appropriate | 3 | 🟡 | Email OTP (6 digits, hashed, single use, 5 attempts, TTL). **Phone/SMS OTP not implemented** — needs an SMS provider (see assumptions A-2) | api: auth |
| R-5.3 | After registration: Create Community or Join Community | 3 | ✅ | Mobile flow → My Communities with both actions | — |

## 5. Create community & identification (§6–§7, p.4)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-6.1 | Creator enters name, type, location, description | 4 | ✅ | `CreateCommunityDto`; mobile Create Community | api: communities "E2E 1" |
| R-6.2 | Creator automatically becomes Owner + Admin | 4 | ✅ | OWNER membership (OWNER ⊇ ADMIN rights) | api: "E2E 1" |
| R-7.1 | Configurable identification field (e.g. Block/Apartment, Branch/Cell, Department, Hostel/Room) | 4 | ✅ | `CommunityIdentificationField` (1 per community) | api: communities |
| R-7.2 | Admin chooses field name and Required/Optional | 4 | 🟡 | Implemented **Owner-only** per §3 (conflict with §7/§24 wording — assumption A-5) | api: communities |

## 6. Community code (§8, p.5)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-8.1 | Every community receives a unique code (e.g. JACOB4821) | 5 | ✅ | `inviteCode @unique`; name prefix + 5 unambiguous random chars; retired codes never reused | api: domain "invite codes" |
| R-8.2 | Members join using the code | 5 | ✅ | `POST /v1/communities/join` | api: "E2E 1" |
| R-8.3 | Admin can Copy, Share, Display QR, Regenerate | 5 | ✅ | Web Settings + mobile Code/QR; regenerate is Owner-only (§3) | api: rotation test |
| R-8.4 | Regenerating does not remove existing members | 5 | ✅ | Rotation touches only `communities.inviteCode` + history | api: "rotating the code never removes members" |

## 7. Join community (§9, p.5)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-9.1 | Step 1 enter code; Step 2 preview name/type/location/description; Step 3 identification; Step 4 submit | 5 | ✅ | Mobile Join Community (3 steps); `GET /preview` | api: "E2E 1" |
| R-9.2 | Status PENDING ADMIN APPROVAL | 5 | ✅ | Join Request Pending screen (polls) | api: memberships |
| R-9.3 | Admin receives notification; chooses APPROVE or REJECT | 5 | ✅ | `JOIN_REQUEST` notification to admins; approve/reject commands | api: "E2E 1" |
| R-9.4 | Only approved members receive emergency alerts | 5 | ✅ | Snapshot of APPROVED + re-check at fan-out | api: memberships matrix, critical-alerts suspended test |

## 8. Member home (§10, p.6)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-10.1 | Extremely simple screen: community name + COMMUNITY NORMAL | 6 | ✅ | `app/c/[communityId]/(tabs)/index.tsx` | mob: screens exist |
| R-10.2 | Primary actions REPORT EMERGENCY and CRITICAL ALERT | 6 | ✅ | Two large buttons (critical opens confirmation; nothing sent on first tap) | mob: critical-confirm |
| R-10.3 | Also: recent alerts, active emergency, emergency history, community info | 6 | ✅ | Sections on Home | — |
| R-10.4 | Bottom navigation Home \| Alerts \| History \| Profile | 6 | ✅ | `(tabs)/_layout.tsx` | — |

## 9. Normal emergency (§11–§12, p.7–8)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-11.1 | Types: Fire, Security Threat, Medical, Electrical, Gas Leak, Flood, Other | 7 | ✅ | `EmergencyCategory` (order preserved) | api: domain enums |
| R-11.2 | Member enters type, location, description, optional photo, optional video | 7 | ✅ | Report screen; presigned S3 uploads (JPEG/PNG/HEIC/WebP ≤10 MB, MP4/MOV ≤50 MB) | api: emergencies media test |
| R-11.3 | SUBMIT REPORT → "REPORT SUBMITTED — Your report has been sent to the community administrator." | 7 | ✅ | Report Submitted screen (exact copy) | — |
| R-12.1 | Admin receives high-priority notification | 8 | ✅ | `EMERGENCY_REPORT_RECEIVED` priority HIGH to admins only | api: emergencies |
| R-12.2 | Admin chooses CONFIRM & BROADCAST or DISMISS | 8 | ✅ | Commands `/confirm`, `/dismiss` (web + mobile) | api: emergencies, concurrency |
| R-12.3 | Dismissed report remains in Admin history | 8 | ✅ | DISMISSED visible to admins (+ reporter, Ext) only | api: "E2E 4" |
| R-12.4 | Confirmed: all approved members receive the notification; then ack → updates → resolve | 8 | ✅ | Outbox → fan-out → push; see §16–19 | api: "E2E 3" |

## 10. Critical alert (§13–§14, p.9–10)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-13.1 | No emergency type selected first | 9 | ✅ | DTO has no category; extra fields rejected | api: critical-alerts |
| R-13.2 | Confirmation shows "CRITICAL ALERT / <community> / Are you sure…? / This will immediately alert the entire community" with YES, SEND ALERT / NO, CANCEL | 9 | ✅ | `critical-confirm.tsx` (exact copy, community named) | mob: critical-confirm |
| R-13.3 | NO, CANCEL has no effect | 9 | ✅ | No request is made | mob + api "E2E 6" |
| R-14.1 | YES immediately broadcasts to all approved members of that community | 10 | ✅ | ACTIVE incident + snapshot + outbox in one transaction | api: "E2E 5" |
| R-14.2 | Sender sees "EMERGENCY! <community> A critical alert has been sent to your community." | 10 | ✅ | `critical-sent/[emergencyId].tsx` + honest delivery note | — |
| R-14.3 | OPEN COMMUNITY WHATSAPP (optional, supplementary) | 10 | ✅ | `WhatsAppButton` (only valid chat.whatsapp.com links) | shared: whatsapp validation |
| R-14.4 | Ext: idempotency, coalescing of simultaneous triggers, per-user cap with explicit 429, audit | — | ✅ | `critical-alerts.service.ts` (advisory lock) | api: "E2E 9", "E2E 10", rate-limit test |

## 11. Incoming alert, acknowledgment, active emergency (§15–§17, p.11–12)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-15.1 | Incoming critical: "EMERGENCY! <community> A critical alert has been triggered…" + VIEW ALERT + OPEN COMMUNITY WHATSAPP | 11 | ✅ | `incoming/[emergencyId].tsx`; push copy in `content.ts` | api: critical "E2E 5" title assertion |
| R-15.2 | Incoming normal: ACTIVE EMERGENCY / FIRE EMERGENCY / location / message / ACKNOWLEDGE ALERT | 11 | ✅ | Same screen, normal variant | — |
| R-15.3 | Must communicate: something is happening, where, what to do, have I acknowledged | 11 | ✅ | Title, location, instructions, ack state | — |
| R-16.1 | ACKNOWLEDGE ALERT → "✓ ALERT ACKNOWLEDGED"; recorded | 12 | ✅ | `AcknowledgeButton`; `alert_acknowledgments` | api: emergencies |
| R-16.2 | Each member can acknowledge only once | 12 | ✅ | UNIQUE(alertId,userId) + idempotent endpoint | api: "E2E 9" double-tap |
| R-16.3 | Admin sees "121 / 147 ACKNOWLEDGED" with Acknowledged / Not acknowledged | 12 | ✅ | Summary + filterable, searchable recipient list (web + mobile) | api: concurrency-admin baseline test |
| R-17.1 | Active Emergency: type, location, STATUS: ACTIVE, reported time, instructions, latest update; ACKNOWLEDGE ALERT, VIEW TIMELINE | 12 | ✅ | `emergency/[emergencyId]/index.tsx` | — |

## 12. Updates, resolve, timeline, history (§18–§21, p.13–15)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-18.1 | Admin sends updates during an active emergency; timestamped, connected, visible, sent as notifications | 13 | ✅ | `/updates` (idempotent), `EMERGENCY_UPDATE` notification | api: "E2E 3", update idempotency |
| R-19.1 | RESOLVE EMERGENCY → resolution message → CONFIRM RESOLUTION; ACTIVE→RESOLVED | 13 | ✅ | Required message (5–1000 chars); confirmation dialog | api: "E2E 3" |
| R-19.2 | Members notified; see RESOLVED, type, location, reported time, resolved time, resolution message | 13 | ✅ | `EMERGENCY_RESOLVED`; resolved variant of emergency screen | api: "E2E 3" |
| R-19.3 | Incident remains in history | 13 | ✅ | Never deleted (DB trigger) | api: db-invariants |
| R-20.1 | Every emergency gets a permanent timeline | 14 | ✅ | `emergency_events` append-only, per-emergency `seq` | api: db-invariants, "E2E 3" seq check |
| R-21.1 | Members view Active and Resolved; admins additionally Dismissed; every incident opens details + timeline | 15 | ✅ | History tab (role-aware) | api: "E2E 4" |

## 13. Admin dashboard, member management, settings (§22–§24, p.15–16)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-22.1 | Overview: members, pending requests, active emergency, alerts today | 15 | ✅ | `GET /admin/overview` (local-day aware) | api: "E2E 15" |
| R-22.2 | Tabs Pending \| Active \| Resolved \| Dismissed | 15 | ✅ | Web emergencies page | — |
| R-22.3 | Actions: View, Confirm, Broadcast, Send Update, View Acknowledgments, Resolve | 15 | ✅ | Web detail page; mobile admin emergency | Browser-verified (confirm) |
| R-23.1 | Admin: approve, reject, suspend, remove, view identification | 16 | ✅ | Members page; rank rules (admins can't moderate admins/owner) | api: memberships |
| R-23.2 | Owner: add/remove Admin | 16 | ✅ | `POST /members/:id/role` (OWNER) | api: memberships |
| R-24.1 | Settings: name, type, location, description, identification field, code, QR, administrators | 16 | 🟡 | All present; name/type/location/identification/rotation are Owner-only (A-5) | api: communities |

## 14. Notifications (§25, p.16)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-25.1 | Membership: join request, approved, rejected | 16 | ✅ | `JOIN_REQUEST`, `MEMBERSHIP_APPROVED`, `MEMBERSHIP_REJECTED` | api: "E2E 1" |
| R-25.2 | Emergencies: report received, confirmed, broadcast, critical alert, update, resolved | 16 | ✅ | Matching `NotificationType`s | api: "E2E 3", "E2E 5" |
| R-25.3 | Strongest legitimate iOS/Android mechanisms (sound, vibration, priority) | 16 | 🟡 | Android MAX-importance channel w/ sound+vibration; APNs priority 10 + `time-sensitive`. **Critical Alerts entitlement not assumed** (A-9) | api: providers unit tests |
| R-25.4 | Do not promise bypass of Silent/Focus/DND | 16 | ✅ | Copy in permission education, Profile, Sent screen | — |
| R-25.5 | Provider eligibility for life-critical use | — | ⛔ | **FCM documentation states its APIs are not designed for emergency alerts and its Terms prohibit high-risk use; Expo push relays through FCM/APNs.** Legal/provider review required before production — see notification-strategy.md §2 | — |

## 15. Security & data (§26–§27, p.17)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-26.1 | Secure authentication | 17 | ✅ | argon2id, 15-min JWT, rotating hashed refresh tokens w/ reuse detection | api: auth |
| R-26.2 | Role-based authorization, server-side checks | 17 | ✅ | Global JWT guard + `CommunityAccessGuard` + service rank checks | api: memberships matrix |
| R-26.3 | Community-level data isolation | 17 | ✅ | Scoped queries, composite FKs, scoped realtime rooms | api: isolation |
| R-26.4 | Audit logs | 17 | ✅ | Append-only `audit_logs` (DB trigger) for all listed actions | api: several + db-invariants |
| R-26.5 | Rate limiting | 17 | ✅ | Redis limiter (fail-open) on auth/preview/join/report/upload; DB cap on critical alerts | api: preview rate-limit, critical cap |
| R-26.6 | Critical Alert abuse prevention | 17 | ✅ | Coalescing, per-user cap with explicit 429, audit, suspension | api: critical-alerts |
| R-26.7 | Member suspension/removal | 17 | ✅ | Commands + immediate socket revocation | api: realtime |
| R-26.8 | Member can never access admin functions by manipulating the frontend | 17 | ✅ | All checks server-side; web hides controls only as UX | api: memberships, isolation |
| R-27.1 | Core data: users, communities, memberships, identification fields, reports, alerts, updates, acknowledgments, notifications, audit logs | 17 | ✅ | Prisma schema (+ deliveries, outbox, events, media, tokens, idempotency) | — |
| R-27.2 | Every emergency/alert tied to a Community ID | 17 | ✅ | NOT NULL `communityId` + composite FKs | api: db-invariants |

## 16. WhatsApp, screens, exclusions, success criteria (§28–§31, p.18–20)

| ID | Requirement | Page | Status | Implementation | Tests |
|---|---|---|---|---|---|
| R-28.1 | No chat; save official WhatsApp group link; OPEN COMMUNITY WHATSAPP | 18 | ✅ | `whatsappUrl` validated (https://chat.whatsapp.com only) | api: communities; shared tests |
| R-29.1 | Member screens 1–22 | 18–19 | ✅ | See mobile `app/` (route list asserted in mob: deeplinks) | mob: deeplinks |
| R-29.2 | Admin screens 23–35 | 19 | ✅ | Web console (all) + mobile admin (dashboard, details, confirm, manage, update, acks, resolve, members, approval, admin mgmt, code/QR). Settings editing & audit log are web-only on purpose | — |
| R-30 | MVP exclusions (payments, visitors, maintenance, hall booking, marketplace, chat, social feed, ads, vendors, billing, complex analytics, accounting) | 19 | ➖ | None built | — |
| R-31.1 | Scenario 1 — Normal emergency end-to-end | 20 | ✅ | — | api: "E2E 3" |
| R-31.2 | Scenario 2 — Critical alert end-to-end | 20 | ✅ | — | api: "E2E 5" |

## 17. Engineering extensions (from implementation brief — not in the PDF)

| ID | Extension | Status | Where |
|---|---|---|---|
| X-1 | Transactional outbox + BullMQ fan-out, retries, dead-letter, idempotent processing | ✅ | `outbox-dispatcher.service.ts`, `fanout.service.ts`, `push-sender.service.ts`; api: outbox-queue |
| X-2 | Delivery states QUEUED / PROVIDER_ACCEPTED / FAILED / INVALID_TOKEN / SKIPPED; never shown as "delivered" | ✅ | `notification_deliveries` |
| X-3 | Persistent in-app inbox | ✅ | `notifications` + mobile Notifications/Alerts |
| X-4 | Authenticated Socket.IO rooms, revocation on suspension | ✅ | api: realtime |
| X-5 | Metrics, health/readiness, structured logs, Sentry | ✅ | `/metrics`, `/health/*`, pino, `instrument.ts` |
| X-6 | Retention configuration | ✅ | `retention.service.ts` + env |
| X-7 | Reporter can follow own pending/dismissed report; reporter identity hidden from other members | ✅ | `visibilityWhere`, presenters (A-13, A-14) |
| X-8 | Admin web console | ✅ | `apps/web` |
