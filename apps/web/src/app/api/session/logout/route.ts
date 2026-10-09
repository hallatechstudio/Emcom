import { NextRequest, NextResponse } from 'next/server';
import { callApi, clearRefreshCookie, REFRESH_COOKIE, sameOrigin } from '@/lib/server-session';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Bad origin' } }, { status: 403 });
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (token) await callApi('/v1/auth/logout', { refreshToken: token }, req).catch(() => undefined);
  const res = new NextResponse(null, { status: 204 });
  clearRefreshCookie(res);
  return res;
}
