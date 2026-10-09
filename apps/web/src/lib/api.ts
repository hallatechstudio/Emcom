'use client';
import { createApiClient } from '@emcom/api-client';
import type { UserDto } from '@emcom/shared-types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Access token lives only in memory; the refresh token is an httpOnly cookie handled by /api/session. */
let accessToken: string | null = null;
let sessionListener: ((user: UserDto | null) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function onSessionChange(fn: (user: UserDto | null) => void) {
  sessionListener = fn;
}

export async function refreshSession(): Promise<{ accessToken: string; user: UserDto } | null> {
  const res = await fetch('/api/session/refresh', { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const body = (await res.json()) as { accessToken: string; user: UserDto };
  accessToken = body.accessToken;
  return body;
}

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => accessToken,
  refresh: async () => (await refreshSession())?.accessToken ?? null,
  onSessionExpired: () => sessionListener?.(null),
});
