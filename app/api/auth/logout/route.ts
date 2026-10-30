import { NextResponse } from 'next/server';
import { authConfig, shouldUseSecureCookies } from '@/lib/auth';

export async function POST(request: Request) {
  const secureCookie = shouldUseSecureCookies(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authConfig.cookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    path: '/',
    expires: new Date(0),
  });

  return response;
}
