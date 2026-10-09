import { NextRequest, NextResponse } from 'next/server';
import type { AuthResultDto } from '@emcom/shared-types';
import { callApi, clearRefreshCookie, REFRESH_COOKIE, sameOrigin, setRefreshCookie } from '@/lib/server-session';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Bad origin' } }, { status: 403 });
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: { code: 'NO_SESSION', message: 'Not signed in' } }, { status: 401 });
  const upstream = await callApi('/v1/auth/refresh', { refreshToken: token }, req);
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const res = NextResponse.json(body, { status: upstream.status });
    if (upstream.status === 401) clearRefreshCookie(res);
    return res;
  }
  const auth = body as AuthResultDto;
  const res = NextResponse.json({ accessToken: auth.accessToken, expiresIn: auth.accessTokenExpiresIn, user: auth.user });
  setRefreshCookie(res, auth.refreshToken, auth.refreshTokenExpiresAt);
  return res;
}
