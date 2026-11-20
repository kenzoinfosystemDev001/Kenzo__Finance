import { NextResponse, type NextRequest } from 'next/server';

/**
 * Silent session renewal.
 *
 * The access-token cookie expires with the token (15 minutes by default). A
 * Server Component cannot write cookies, so a refresh attempted during a page
 * render rotated the refresh token on the API while the browser kept the old,
 * now-revoked one; the next request presented it, tripped the API's reuse
 * detection and signed the user out on every device. Middleware runs before
 * the render and CAN write cookies, so renewal happens here: the new tokens
 * go on the response for the browser and on the forwarded request so the
 * render that follows already sees them.
 */
const ACCESS_COOKIE = 'kenzo_at';
const REFRESH_COOKIE = 'kenzo_rt';
const REMEMBER_COOKIE = 'kenzo_rm';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Renew a little before expiry so a token cannot lapse mid-render. */
const EXPIRY_SKEW_SECONDS = 30;

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function secondsUntilExpiry(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp - Math.floor(Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

function needsRefresh(accessToken: string | undefined): boolean {
  if (!accessToken) return true;
  const remaining = secondsUntilExpiry(accessToken);
  return remaining !== null && remaining <= EXPIRY_SKEW_SECONDS;
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

  if (!refreshToken || !needsRefresh(accessToken) || isPrefetch(request)) {
    return NextResponse.next();
  }

  let tokens: { accessToken: string; refreshToken: string; expiresIn: number } | null = null;
  let rejected = false;
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (response.ok) tokens = await response.json();
    // 401/403: the refresh token is dead. Anything else (API asleep, 5xx) is
    // not the session's fault, so the cookies are left for a later attempt.
    else rejected = response.status === 401 || response.status === 403;
  } catch {
    // Unreachable API: let the page render its own "API unavailable" state.
  }

  if (!tokens) {
    if (!rejected) return NextResponse.next();
    // Clear the dead session so later requests stop presenting it.
    request.cookies.delete(ACCESS_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);
    const response = NextResponse.next({ request: { headers: request.headers } });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    response.cookies.delete(REMEMBER_COOKIE);
    return response;
  }

  const persistent = request.cookies.get(REMEMBER_COOKIE)?.value === '1';
  const refreshMaxAge = persistent ? { maxAge: 60 * 60 * 24 * 7 } : {};

  // Forward the new tokens to this request's render...
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, tokens.refreshToken);
  const response = NextResponse.next({ request: { headers: request.headers } });

  // ...and persist them in the browser.
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: tokens.expiresIn,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseOptions, ...refreshMaxAge });
  response.cookies.set(REMEMBER_COOKIE, persistent ? '1' : '0', { ...baseOptions, ...refreshMaxAge });
  return response;
}

export const config = {
  // Everything except static assets and the health probe.
  matcher: ['/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|txt)$).*)'],
};
