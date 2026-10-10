jest.mock('expo-router', () => ({ router: { replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('@/lib/notifications', () => ({ unregisterDevice: jest.fn(async () => undefined) }));
const mockLogout = jest.fn(async () => undefined);
jest.mock('@/lib/api', () => ({ api: { auth: { logout: (...a: unknown[]) => mockLogout(...(a as [])) } } }));

import { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { unregisterDevice } from '@/lib/notifications';
import { useSession } from '@/lib/session-store';
import { signOut } from '@/lib/sign-out';

describe('sign out', () => {
  it('stops pushes to this phone, revokes the server session, wipes local credentials and returns to Welcome', async () => {
    await useSession.getState().setSession(
      { id: 'u1', fullName: 'Ada', email: 'ada@x.dev', phone: '+234', emailVerified: true, createdAt: '' },
      'access-token',
      'refresh-token-123',
    );
    const qc = new QueryClient();
    qc.setQueryData(['mine'], [{ secret: true }]);

    await signOut(qc);

    expect(unregisterDevice).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledWith('refresh-token-123');
    expect(await SecureStore.getItemAsync('emcom.refreshToken')).toBeNull();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().accessToken).toBeNull();
    expect(qc.getQueryData(['mine'])).toBeUndefined();
    expect(router.replace).toHaveBeenCalledWith('/welcome');
  });

  it('still signs out locally when the server cannot be reached', async () => {
    mockLogout.mockRejectedValueOnce(new Error('offline'));
    await useSession.getState().setSession({ id: 'u1', fullName: 'A', email: 'a@x.dev', phone: '+1', emailVerified: true, createdAt: '' }, 'a', 'r');
    await signOut(new QueryClient());
    expect(useSession.getState().user).toBeNull();
  });
});
