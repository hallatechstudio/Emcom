# Assumptions and decisions

Each entry: the gap or conflict in the PRD, the decision taken (secure, minimal default), and how to change it.
"Ext" = engineering recommendation beyond the PRD.

| ID | Topic | Decision | Change by |
|---|---|---|---|
| A-1 | Email verification | Required (`REQUIRE_EMAIL_VERIFICATION=true`) before creating or joining a community. Login works before verification so the user can finish onboarding. | env flag |
| A-2 | Phone OTP | PRD says "OTP verification where appropriate". Email OTP is implemented. Phone is stored (validated format) but **not verified** — SMS needs a provider contract (Twilio, Termii, etc.). | Add an `SmsProvider` mirroring `PushProvider`; reuse `OtpService` with a new purpose |
| A-3 | Password policy | ≥10 chars, letters + digits, argon2id (m=19 MiB, t=2). | `Limits.password`, `ARGON_OPTS` |
| A-4 | Single owner | One OWNER per community; ownership transfer is not in the PRD and is not implemented. The owner cannot leave. | Add a transfer command later |
| A-5 | Settings permissions conflict | §3 gives *configure community / identification field / regenerate code* to the **Owner**; §7 and §24 say "Admin chooses"/"Admin/Owner can manage". The more restrictive §3 wins: Owner edits name, type, location, identification field, rotates the code and manages admins. Admins edit description and the WhatsApp link, and can view/copy/share/QR the code. | `UpdateCommunityDto` owner-only list; `@CommunityRole` on routes |
| A-6 | Moderation ranks | Admins moderate MEMBERs only; the Owner moderates admins and members; nobody moderates themselves; the Owner cannot be suspended/removed. | `canModerate` |
| A-7 | Rejoining | REJECTED / REMOVED / LEFT users may submit a new request with a valid code (back to PENDING, role reset to MEMBER). SUSPENDED users cannot rejoin until reinstated. | `MEMBERSHIP_TRANSITIONS` |
| A-8 | Notification provider | Mock transport for dev/tests; Expo Push and FCM HTTP v1 adapters for real devices. Production use is **blocked pending provider/legal review** (see notification-strategy.md §2). | `PUSH_PROVIDERS` |
| A-9 | iOS Critical Alerts | Not assumed. Pushes use `interruption-level: time-sensitive` (needs the Time Sensitive capability, no Apple approval). Critical Alerts require an Apple entitlement application. | app.json entitlements + provider payload |
| A-10 | Acknowledgment baseline | Denominator = approved members snapshotted at broadcast time (`alert_recipients`), plus approved members who join later **and acknowledge** (flagged `addedAfterBroadcast`). Members suspended afterwards stay in the baseline and are labelled. | `createBroadcast`, `AcknowledgmentsService` |
| A-11 | Acknowledging resolved alerts | Only while ACTIVE; repeat calls after resolution return the original ack. | `acknowledge()` |
| A-12 | Critical alert coalescing (Ext) | If an ACTIVE critical alert in the same community started within `CRITICAL_ALERT_COALESCE_SECONDS` (120 s), further triggers are recorded on it (timeline + counter, admins see "triggered N×") instead of re-alerting everyone. The trigger is never silently dropped: the user is told the community was already alerted. Set to 0 to disable. | env |
| A-13 | Critical alert cap (Ext) | Max `CRITICAL_ALERT_USER_LIMIT` (3) *new* critical broadcasts per member per `CRITICAL_ALERT_USER_WINDOW_SECONDS` (10 min). Excess gets an explicit 429 telling the user to call emergency services, and an audit entry. Coalescing still works while capped. | env |
| A-14 | Reporter privacy (Ext) | Members do not see who raised a report/critical alert; admins and the reporter do. | `toEmergencyDto`, `toEventDto` |
| A-15 | Reporter visibility of own report (Ext) | A reporter can see their own PENDING/DISMISSED report status (not the dismissal reason) and gets a `REPORT_DISMISSED` notification. Other members never see pending/dismissed reports. | `visibilityWhere` |
| A-16 | Sender not pushed own critical alert | The person who sends a critical alert sees the "Sent" screen; they are in the ack baseline but do not get a push. | `fanout.service.ts` |
| A-17 | Updates/resolution recipients | Current APPROVED members at fan-out time (not the original snapshot), so new members get updates and suspended ones do not. | `fanout.service.ts` |
| A-18 | Push content | Title + short body (location/instructions/update text, ≤160 chars); data payload carries ids only. `PUSH_INCLUDE_DETAILS=false` hides text ("Open EMCOM for details"). | env |
| A-19 | Incident deletion | Never during routine operation (DB trigger). Legal-hold/erasure procedures are a manual DBA operation (deployment.md). | — |
| A-20 | Account deletion | Not in the PRD; not implemented. Recommended: anonymise user (name/email/phone) and keep incident records. | future |
| A-21 | Retention defaults | Notifications 365 d, delivery rows 90 d, idempotency keys 7 d, dispatched outbox 30 d, abandoned uploads 2 d. Incidents, timelines, acknowledgments and audit logs: kept indefinitely. These are placeholders pending a data-protection review (e.g. Nigeria NDPA / GDPR). | env |
| A-22 | Emergency number | The critical-alert failure state offers "Call emergency services (112)" (Nigeria's national number). Must be localised per deployment country. | `critical-confirm.tsx` |
| A-23 | Community types | PRD examples + `OTHER`. | enum |
| A-24 | Invite code format | Name prefix (≤5 letters) + 5 random characters from an unambiguous alphabet (≈33 M combinations per prefix); preview limited to 20/hour/user. PRD example `JACOB4821` is kept as seed data. | `invite-code.ts` |
| A-25 | Media | Photos ≤10 MB (JPEG/PNG/HEIC/WebP), videos ≤50 MB (MP4/MOV), ≤4 per report; private bucket; 5-minute presigned GETs; every access audited. No malware scanning yet (deployment.md). | `Limits` |
| A-26 | Time zone | Timestamps stored in UTC; "alerts today" uses the viewer's local midnight. | — |
| A-27 | Admin web auth | Refresh token kept in an httpOnly SameSite=Strict cookie via Next route handlers; access token in memory. | `apps/web/src/lib/server-session.ts` |
| A-28 | Expo SDK | SDK 54 (React Native 0.81, React 19.1). Push notifications require a development build (Expo Go cannot receive remote pushes on Android since SDK 53); Expo Go is fine for everything else using the mock transport. | `apps/mobile/package.json` |
| A-29 | Local S3 | MinIO images are no longer published on Docker Hub; local dev uses SeaweedFS's S3 gateway. Production uses AWS S3 / DigitalOcean Spaces. | docker-compose.yml |
