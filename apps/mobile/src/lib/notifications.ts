import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { DevicePlatform, PushData, PushProviderName } from '@emcom/shared-types';
import { routeForNotification } from '@emcom/shared-types';
import { api } from './api';
import { APP_VERSION, EAS_PROJECT_ID, IS_EXPO_GO } from './config';

/** Must match ANDROID_CHANNEL in apps/api/src/modules/notifications/providers/push-provider.ts */
export const CHANNELS = { EMERGENCY: 'emergency-alerts', GENERAL: 'general' } as const;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Android channels. "emergency-alerts" uses MAX importance, sound and vibration.
 * bypassDnd only takes effect if the user grants Do-Not-Disturb access in system settings; EMCOM
 * never promises to break through Silent/Focus/DND.
 */
export async function setupChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNELS.EMERGENCY, {
    name: 'Emergency alerts',
    description: 'Critical alerts and confirmed emergencies in your communities',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 600, 300, 600, 300, 600],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.GENERAL, {
    name: 'Community updates',
    description: 'Membership decisions and other non-urgent messages',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const s = await Notifications.getPermissionsAsync();
  return s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionState> {
  const s = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: true, allowCriticalAlerts: false },
  });
  return s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';
}

const MOCK_TOKEN_KEY = 'emcom.mockPushToken';

/**
 * Obtains a push token and registers it with the API (idempotent; also handles token refresh).
 * Real devices with an EAS project id use Expo push tokens. Expo Go / simulators in development use
 * a MOCK token so the full server pipeline stays visible (admin web → Dev push log).
 */
export async function registerDevice(): Promise<{ provider: PushProviderName } | null> {
  if ((await getPermission()) !== 'granted') return null;
  const platform: DevicePlatform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
  let token: string;
  let provider: PushProviderName;
  if (Device.isDevice && !IS_EXPO_GO && EAS_PROJECT_ID) {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
    provider = 'EXPO';
  } else if (__DEV__) {
    token = (await SecureStore.getItemAsync(MOCK_TOKEN_KEY)) ?? `mock-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await SecureStore.setItemAsync(MOCK_TOKEN_KEY, token);
    provider = 'MOCK';
  } else {
    return null;
  }
  await api.devices.register({ token, platform, provider, appVersion: APP_VERSION });
  return { provider };
}

export async function unregisterDevice(): Promise<void> {
  try {
    const mock = await SecureStore.getItemAsync(MOCK_TOKEN_KEY);
    if (mock) await api.devices.unregister(mock);
    if (Device.isDevice && !IS_EXPO_GO && EAS_PROJECT_ID) {
      const t = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
      await api.devices.unregister(t);
    }
  } catch {
    // best effort on sign-out
  }
}

/** Route for a tapped notification. Authorization is re-checked by the screen's API call. */
export function routeFromResponse(response: Notifications.NotificationResponse): string {
  const data = (response.notification.request.content.data ?? {}) as Partial<PushData>;
  return routeForNotification(data);
}
