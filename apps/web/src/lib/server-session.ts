import { NextRequest, NextResponse } from 'next/server';

export const REFRESH_COOKIE = 'emcom_rt';
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * The admin web never exposes the refresh token to JavaScript: it lives in an httpOnly,
 * SameSite=Strict cookie scoped to /api/session. Only the short-lived access token reaches the page.
 */
export function setRefreshCookie(res: NextResponse, token: string, expiresAt: string) {
  res.cookies.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/session',
    expires: new Date(expiresAt),
  });
}

export function clearRefreshCookie(res: NextResponse) {
  res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: '/api/session', maxAge: 0 });
}

/** CSRF defence in depth on top of SameSite=Strict: state-changing calls must be same-origin. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function callApi(path: string, body: unknown, req: NextRequest) {
  return fetch(`${API_INTERNAL_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': req.headers.get('user-agent') ?? 'emcom-web',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}
