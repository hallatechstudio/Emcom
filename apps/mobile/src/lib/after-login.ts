import { router } from 'expo-router';
import type { AuthResultDto } from '@emcom/shared-types';
import { getPermission, registerDevice } from './notifications';
import { useSession } from './session-store';

/** Common post-authentication routing: verify email → notification education → pending deep link → communities. */
export async function completeSignIn(res: AuthResultDto): Promise<void> {
  await useSession.getState().setSession(res.user, res.accessToken, res.refreshToken);
  if (!res.user.emailVerified) {
    router.replace('/otp');
    return;
  }
  await continueAfterVerified();
}

export async function continueAfterVerified(): Promise<void> {
  const perm = await getPermission().catch(() => 'undetermined' as const);
  if (perm !== 'granted') {
    router.replace('/notification-permission');
    return;
  }
  void registerDevice().catch(() => undefined);
  const pending = useSession.getState().pendingRoute;
  if (pending) {
    useSession.getState().setPendingRoute(null);
    router.replace('/communities');
    router.push(pending as never);
  } else {
    router.replace('/communities');
  }
}
