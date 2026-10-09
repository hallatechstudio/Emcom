# EMCOM mobile (Expo SDK 54)

```bash
pnpm mobile:start           # from repo root; then i / a, or scan the QR with Expo Go (SDK 54)
pnpm --filter @emcom/mobile test
pnpm --filter @emcom/mobile typecheck
```

- API URL: `EXPO_PUBLIC_API_URL`, else `app.json extra.apiBaseUrl`, else `http://<Metro host>:4000`.
- Routes (Expo Router, `app/`): Splash `index`, `welcome`, `register`, `login`, `otp`, `notification-permission`,
  `communities/*` (My Communities, Create, Join, Join Request Pending), `notifications` (inbox),
  `c/[communityId]/(tabs)` (Home | Alerts | History | Profile), `report`, `report-submitted`, `critical`,
  `critical-confirm`, `critical-sent/[id]`, `incoming/[id]`, `emergency/[id]` (+ `updates`, `timeline`),
  `admin/*` (dashboard, emergency review/management, members, code/QR).
- Deep links: scheme `emcom://`; notification taps map through `routeForNotification()` in shared-types.

## Push notifications on real devices
Expo Go cannot receive remote pushes on Android (SDK 53+). In Expo Go and simulators the app registers a
**MOCK** token (dev only) so the server pipeline is still exercised (admin web → Dev push log).

For real pushes:
1. `npx eas init` and put the project id in `app.json → expo.extra.eas.projectId`.
2. Upload FCM (Android) and APNs (iOS) credentials: `npx eas credentials`.
3. `npx eas build --profile development --platform all` and install the build.
4. Enable `EXPO` in the API's `PUSH_PROVIDERS` (and `EXPO_ACCESS_TOKEN` if push security is enabled).
5. Run the physical-device test plan in `docs/notification-strategy.md §5`.

Read `docs/notification-strategy.md §2` first: provider terms for emergency use need review before launch.
