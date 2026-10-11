import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { api } from './api';
import { resetPresented } from './incoming';
import { unregisterDevice } from './notifications';
import { clearPersistedCache } from './query-cache';
import { getStoredRefreshToken, useSession } from './session-store';

/**
 * Signs out on this device: stops push to this phone, revokes the session on the server,
 * clears the keystore and cached data. Local sign-out still happens if the server is unreachable.
 */
export async function signOut(qc: QueryClient): Promise<void> {
  await unregisterDevice();
  const rt = await getStoredRefreshToken();
  if (rt) await api.auth.logout(rt).catch(() => undefined);
  await useSession.getState().clear();
  qc.clear();
  await clearPersistedCache().catch(() => undefined);
  resetPresented();
  router.dismissAll?.();
  router.replace('/welcome');
}

export function confirmSignOut(qc: QueryClient): void {
  Alert.alert('Sign out?', 'You will stop receiving emergency alerts on this phone until you sign in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut(qc) },
  ]);
}
