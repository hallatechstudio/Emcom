import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
import { APP_VERSION } from './config';

/**
 * Offline cache: the user's communities, active emergencies and opened incident details are saved
 * on the device so the app still shows them when launched without signal. Cleared on sign-out.
 */
export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'emcom.query-cache', throttleTime: 1000 });

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
export const PERSIST_BUSTER = APP_VERSION;

export function shouldPersistQuery(q: Query): boolean {
  if (q.state.status !== 'success') return false;
  const [root, , kind, sub] = q.queryKey as unknown[];
  if (root === 'mine') return true;
  if (root !== 'c') return false;
  if (kind === 'emergencies' && sub === 'ACTIVE') return true;
  if (kind === 'emergency' && q.queryKey.length === 4) return true; // incident details (not timeline/acks)
  if (kind === 'details') return true;
  return false;
}

export async function clearPersistedCache(): Promise<void> {
  await queryPersister.removeClient();
}
