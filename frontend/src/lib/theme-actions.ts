'use server';

import { cookies } from 'next/headers';
import { THEME_COOKIE, isTheme } from './theme';

/** Saves the signed-in user's theme choice. A cookie, not a server record: it is a display preference. */
export async function setThemeAction(value: string): Promise<{ ok: true } | { error: string }> {
  if (!isTheme(value)) return { error: 'Unknown theme.' };

  (await cookies()).set(THEME_COOKIE, value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  return { ok: true };
}
