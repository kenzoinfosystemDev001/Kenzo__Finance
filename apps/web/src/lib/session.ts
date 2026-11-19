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

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function setSessionCookies(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): Promise<void> {
  const store = await cookies();

  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    maxAge: tokens.expiresIn,
  });

  // The refresh cookie outlives the access token so a session can be renewed.
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions,
    maxAge: 60 * 60 * 24 * 7,
  });
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
}
