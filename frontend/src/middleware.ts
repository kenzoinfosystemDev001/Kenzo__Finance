import { NextResponse, type NextRequest } from 'next/server';
import { forwardingHeadersFrom } from './lib/client-forwarding';

/**
 * Keeps the session alive.
 *
 * Server Components cannot write cookies, so a token refreshed while a page
 * renders is lost - and because refresh tokens are single-use, losing the new
 * pair meant the next attempt looked like token theft and signed the user out
 * everywhere. Middleware runs before rendering and CAN write cookies, so the
 * access token is renewed here, shortly before it expires, and the renewed
 * cookies are forwarded both to this request's render and to the browser.
 *
 * Cookie names and options mirror src/lib/session.ts.
 */
const ACCESS_COOKIE = 'kenzo_at';
const REFRESH_COOKIE = 'kenzo_rt';
const REMEMBER_COOKIE = 'kenzo_rm';
/** Renew when the access token has less than this left. */
const RENEW_BEFORE_SECONDS = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/** Seconds until the JWT's `exp`, or 0 when it cannot be read. Not a verification. */
function secondsLeft(token: string | undefined): number {
  if (!token) return 0;
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp - Math.floor(Date.now() / 1000) : 0;
  } catch {
    return 0;
  }
}

/**
 * Link prefetches run in parallel. If each one rotated the same refresh
 * token, every one after the first would present a revoked token and the API
 * would treat it as theft. Prefetches skip renewal; the real navigation does it.
 */
function isPrefetch(request: NextRequest): boolean {
  return (
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose')?.includes('prefetch') === true
  );
}

export async function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!refreshToken || secondsLeft(accessToken) > RENEW_BEFORE_SECONDS || isPrefetch(request)) {
    return NextResponse.next();
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardingHeadersFrom(request.headers) },
      body: JSON.stringify({ refreshToken }),
      // A sleeping API must not hold every page load open.
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    // API unreachable: let the page render its "API unavailable" state.
    return NextResponse.next();
  }

  if (response.status === 401) {
    // The session is over. Drop the dead cookies so the dashboard redirects
    // to /login cleanly instead of retrying a revoked token on every request.
    request.cookies.delete(ACCESS_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);
    const next = NextResponse.next({ request: { headers: request.headers } });
    next.cookies.delete(ACCESS_COOKIE);
    next.cookies.delete(REFRESH_COOKIE);
    next.cookies.delete(REMEMBER_COOKIE);
    return next;
  }

  if (!response.ok) return NextResponse.next();

  const tokens = (await response.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
  const persistent = request.cookies.get(REMEMBER_COOKIE)?.value === '1';
  const refreshMaxAge = persistent ? { maxAge: 60 * 60 * 24 * 7 } : {};

  // Make the new tokens visible to Server Components rendering this request.
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);
  const next = NextResponse.next({ request: { headers: request.headers } });

  next.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...baseOptions, maxAge: tokens.expiresIn });
  next.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseOptions, ...refreshMaxAge });
  next.cookies.set(REMEMBER_COOKIE, persistent ? '1' : '0', { ...baseOptions, ...refreshMaxAge });
  return next;
}

export const config = {
  // Everything except static assets (incl. the logo and icons), the health
  // probe and the public login background.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|login/background|.*\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
