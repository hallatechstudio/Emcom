import { ApiError, createApiClient } from '@emcom/api-client';
import { API_URL } from './config';
import { getStoredRefreshToken, storeRefreshToken, useSession } from './session-store';

/** Rotates the stored refresh token. Concurrent callers are de-duplicated by the client. */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await api.auth.refresh(refreshToken);
    await storeRefreshToken(res.refreshToken);
    useSession.getState().setAccessToken(res.accessToken);
    useSession.getState().setUser(res.user);
    return res.accessToken;
  } catch (err) {
    // Only a definitive rejection ends the session; offline keeps the stored token for later.
    if (err instanceof ApiError && err.status === 401) await useSession.getState().clear();
    return null;
  }
}

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => useSession.getState().accessToken,
  refresh: refreshAccessToken,
  onSessionExpired: () => void useSession.getState().clear(),
});

export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}
