# Notification strategy

Notifications are safety-relevant. This document states what EMCOM does, what it cannot promise,
and what must happen before real-world deployment.

## 1. What is guaranteed vs. best effort

| Stage | Mechanism | Guarantee |
|---|---|---|
| Emergency + broadcast intent recorded | One PostgreSQL transaction (state, recipient snapshot, outbox row) | **Durable**: if the API returned 201/200, the broadcast will be processed |
| Outbox → queue | Dispatcher leases rows (`FOR UPDATE SKIP LOCKED`), retries forever with backoff ≤30 s | At-least-once; duplicates removed by jobId |
| Fan-out | Inbox row per member (`UNIQUE(userId,dedupeKey)`) + delivery row per device | Exactly one inbox entry per member per event |
| Push send | Provider adapter, 6 attempts, exponential backoff from 2 s, then `FAILED` (dead letter, kept 14 days) | Best effort; `PROVIDER_ACCEPTED` ≠ displayed |
| Device display | Apple/Google/OS | **Not guaranteed**: offline, battery saver, Focus/DND, disabled notifications |
| Acknowledgment | Member taps ACKNOWLEDGE | Proof the member saw the alert in-app — not proof of safety |

Every client therefore also: refetches on open/resume, shows active emergencies on Home, keeps an inbox,
and uses realtime while in the foreground. Copy never says "delivered"; the sender sees
"A critical alert has been sent to your community" followed by an explicit delivery caveat.

## 2. Provider eligibility — **production blocker**

| Provider | Status | Notes |
|---|---|---|
| **FCM** (Android, and iOS via Firebase) | ⛔ needs legal review | Firebase's own FCM documentation ("Set the priority of a message → Life critical use cases") states the FCM APIs are not designed for emergency alerts or other high-risk activities and that the Terms of Service prohibit such use, with the developer responsible for compliance. |
| **Expo Push Service** | ⛔ same dependency | Relays to FCM (Android) and APNs (iOS); Expo describes delivery as best effort and rate-limits to 600 notifications/s per project. Using Expo does not remove the FCM terms question. |
| **APNs direct** | 🟡 not implemented | Apple's terms should be reviewed by counsel. Standard APNs supports priority 10 and `time-sensitive`. **Critical Alerts** (bypass mute/DND) need a special entitlement that Apple grants case-by-case for health, safety, security and public-safety apps — apply via developer.apple.com; the user must also opt in. Not assumed in this build. |
| SMS / voice fallback | ➖ future | Requires provider contracts and local regulatory review (e.g. sender ID registration, DND registries). |
| WhatsApp | ➖ out of scope | PRD §28: link to the community group only; no automated messaging. |

**What must happen before production:**
1. Product/legal owner obtains a written position on FCM/Expo use for this product (positioning EMCOM as
   a *community notification* tool with an explicit "not a replacement for emergency services" stance
   is a product decision — engineering cannot make it).
2. If FCM is not acceptable, evaluate alternatives (e.g. contracted emergency-messaging providers,
   SMS fallback, Android alternatives) — the provider abstraction makes this a new adapter.
3. Apply for the iOS Critical Alerts entitlement if the product qualifies, then switch
   `interruption-level` to `critical` for `CRITICAL` priority behind a config flag.
4. Run the manual device test plan below on real hardware.

## 3. Implementation

- `PushProvider` interface (`apps/api/src/modules/notifications/providers/push-provider.ts`):
  `send(message) → {ok, providerMessageId} | {ok:false, kind: invalid_token|transient|permanent}`.
- Adapters: `MockPushProvider` (dev/test; tokens containing `invalid`/`fail` simulate errors),
  `ExpoPushProvider` (HTTP v2 API, optional access token), `FcmPushProvider` (HTTP v1, service-account JWT).
- Selection: `PUSH_PROVIDERS=MOCK,EXPO,FCM`; mock is refused in production; `PUSH_FORCE_MOCK` (dev only)
  routes everything to the mock. A token whose provider is not enabled is marked `SKIPPED`, never faked.
- Invalid tokens (`DeviceNotRegistered`, `UNREGISTERED`) mark the delivery `INVALID_TOKEN` and set
  `device_tokens.invalidatedAt`; re-registering the token clears it (token refresh).
- Multiple devices per user, and token ownership moves to the most recent account signing in on a device.

### Payload
- Android: channel `emergency-alerts` (MAX importance, sound, long vibration, public on lock screen,
  `bypassDnd` requested — only effective if the user grants DND access) for HIGH/CRITICAL; `general` for
  NORMAL. FCM `priority: HIGH`, TTL 1 h for urgent messages.
- iOS: `apns-priority: 10`, `interruption-level: time-sensitive` (app has the Time Sensitive entitlement in
  app.json), sound `default`.
- Data: `{notificationId, type, communityId, emergencyId}` only. Tapping routes via the shared
  `routeForNotification()` to the exact incident in the right community; the screen re-authorizes via the API.

### Mobile behaviour
- Permission education screen before the OS prompt, honest about Silent/Focus/DND; Profile shows the state
  with a "Open notification settings" shortcut.
- Development: Expo Go / simulators register a `MOCK` token so the whole pipeline is visible in the admin
  web **Dev push log** (`/dev/push-log`) and `GET /v1/dev/mock-pushes`.
- Real pushes require a development or production build (EAS) with `extra.eas.projectId` set and FCM/APNs
  credentials uploaded to EAS.

## 4. Monitoring

Prometheus (`/metrics` on API, `:9464/metrics` on worker):

| Metric | Alert when |
|---|---|
| `emcom_outbox_oldest_pending_age_seconds` | > 30 s for 2 min (dispatch stalled / Redis down) |
| `emcom_outbox_publish_errors_total` | rate > 0 for 5 min |
| `emcom_broadcast_fanout_latency_seconds` | p95 > 10 s |
| `emcom_push_queue_to_provider_seconds` | p95 > 30 s |
| `emcom_push_results_total{status="FAILED"}` | ratio > 5 % over 15 min |
| `emcom_queue_jobs{state="failed"}` | increasing |
| `emcom_queue_jobs{queue="push",state="waiting"}` | > 10 000 for 5 min |

Per-incident delivery breakdown is visible to admins on the acknowledgment dashboard.

## 5. Manual physical-device test plan (cannot be automated in CI)

Run on at least: one recent iPhone (iOS 18+), one Pixel (Android 15+), one low-end Android with
aggressive battery management (e.g. Tecno/Infinix/Samsung A-series), using an EAS development build.

| # | Scenario | Expected |
|---|---|---|
| D1 | App killed, phone locked, critical alert from another member | Banner + sound within seconds; tap opens Incoming Alert for the right community |
| D2 | Same with Silent switch / ringer off | Note actual behaviour (iOS: silent unless Critical Alerts entitlement); record |
| D3 | Focus / DND on, EMCOM not allowed | Record: delivered silently to Notification Center; time-sensitive may break through if allowed |
| D4 | Android DND with EMCOM granted DND access | Channel bypasses DND |
| D5 | Battery saver / Doze, app in background > 1 h | Record latency |
| D6 | Airplane mode during alert, then reconnect | Push may arrive late (TTL 1 h); inbox and Home show it on open |
| D7 | Two communities, alert in A | Only A's alert, labelled with A, deep-links into A |
| D8 | Member suspended | No further pushes; open app shows access revoked |
| D9 | Uninstall/reinstall | Old token becomes `INVALID_TOKEN` on next send; new token registered |
| D10 | Notifications denied | Education + settings guidance shown; inbox still records alerts |
| D11 | Normal report → admin push → confirm → member pushes → update → resolve | All notifications arrive in order; ack counts update live |

Record device, OS version, provider, latency and outcome for each run.
