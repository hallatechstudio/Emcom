import Constants from 'expo-constants';

/**
 * API base URL. Priority: EXPO_PUBLIC_API_URL → app.json extra.apiBaseUrl → the Metro host
 * (so a phone on the same Wi-Fi reaches the laptop running `pnpm api:dev` on :4000).
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  if (extra.apiBaseUrl) return extra.apiBaseUrl.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:4000`;
}

export const API_URL = resolveApiUrl();
export const EAS_PROJECT_ID = ((Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } }).eas?.projectId || undefined;
/** Expo Go cannot receive remote pushes (SDK 53+ on Android); dev uses the mock transport instead. */
export const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
