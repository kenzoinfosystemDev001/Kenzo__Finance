import 'server-only';
import { cookies } from 'next/headers';

/**
 * Session cookies.
 *
 * Tokens live in httpOnly cookies set by the Next server, never in
 * localStorage (docs/03_SYSTEM_ARCHITECTURE.md 7) - script running on the
 * page cannot read them, so an XSS bug cannot exfiltrate a session.
 */
const ACCESS_COOKIE = 'kenzo_at';
const REFRESH_COOKIE = 'kenzo_rt';
/** "1" when the user ticked Remember me; decides whether cookies outlive the browser. */
const REMEMBER_COOKIE = 'kenzo_rm';

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/**
 * Writes the session cookies.
 *
 * `remember` is passed at sign-in. On a silent refresh it is omitted and the
 * choice made at sign-in is kept. Without Remember me the refresh cookie is a
 * browser-session cookie, so closing the browser ends the session.
 */
export async function setSessionCookies(
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  remember?: boolean,
): Promise<void> {
  const store = await cookies();
  const persistent = remember ?? store.get(REMEMBER_COOKIE)?.value === '1';
  const refreshMaxAge = persistent ? { maxAge: 60 * 60 * 24 * 7 } : {};

  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: tokens.expiresIn,
  });

  // The refresh cookie outlives the access token so a session can be renewed.
  store.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseOptions, ...refreshMaxAge });
  store.set(REMEMBER_COOKIE, persistent ? '1' : '0', { ...baseOptions, ...refreshMaxAge });
}

export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(REMEMBER_COOKIE);
}
