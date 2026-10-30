import { NextRequest, NextResponse } from 'next/server';
import { authConfig, verifySessionToken } from '@/lib/auth';
import { canAccessDashboardPath, getDefaultDashboardHref } from '@/lib/dashboard-access';

// Gerado a cada requisição (Edge runtime não tem Buffer por padrão, daí
// btoa em vez de Buffer.from). O nonce vai tanto no header CSP quanto nos
// headers da requisição encaminhada — é assim que o Next.js App Router sabe
// aplicar o mesmo nonce nos scripts inline que ele injeta para hidratação
// (payload de RSC), o que exige 'strict-dynamic' no script-src.
function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildCsp(nonce: string) {
  const isProd = process.env.NODE_ENV === 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${isProd ? '' : ' ws://localhost:* ws://127.0.0.1:*'}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  function withCsp(response: NextResponse) {
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard');
  const token = request.cookies.get(authConfig.cookieName)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isDashboardRoute && !session) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirectedFrom', request.nextUrl.pathname);
    return withCsp(NextResponse.redirect(loginUrl));
  }

  if (isDashboardRoute && session) {
    const canAccess = canAccessDashboardPath(
      request.nextUrl.pathname,
      session.plan,
      session.role,
      session.permissions,
    );

    if (!canAccess || !session.active) {
      const destination = getDefaultDashboardHref(
        session.plan,
        session.role,
        session.permissions,
      );

      if (request.nextUrl.pathname !== destination) {
        return withCsp(NextResponse.redirect(new URL(destination, request.url)));
      }
    }
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
