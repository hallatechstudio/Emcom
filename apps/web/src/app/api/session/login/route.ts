import { NextRequest, NextResponse } from 'next/server';
import type { AuthResultDto } from '@emcom/shared-types';
import { callApi, sameOrigin, setRefreshCookie } from '@/lib/server-session';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Bad origin' } }, { status: 403 });
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const upstream = await callApi('/v1/auth/login', { email, password }, req);
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(body, { status: upstream.status });
  const auth = body as AuthResultDto;
  const res = NextResponse.json({ accessToken: auth.accessToken, expiresIn: auth.accessTokenExpiresIn, user: auth.user });
  setRefreshCookie(res, auth.refreshToken, auth.refreshTokenExpiresAt);
  return res;
}
