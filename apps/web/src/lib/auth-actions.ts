'use server';

import { redirect } from 'next/navigation';
import { apiFetch, ApiError, isApiUnavailable } from './api';
import {
  clearSessionCookies,
  getRefreshToken,
  setSessionCookies,
} from './session';
import type { CurrentUser } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email address and password.' };
  }

  let tokens: { accessToken: string; refreshToken: string; expiresIn: number };

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.message;
      return {
        error:
          (Array.isArray(message) ? message[0] : message) ??
          'Sign-in failed. Check your details and try again.',
      };
    }

    tokens = await response.json();
  } catch {
    return {
      error:
        'Could not reach the server. Confirm the API is running and try again.',
    };
  }

  await setSessionCookies(tokens);

  // redirect() throws internally, so it must sit outside the try block.
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    // Revoke server-side so the token cannot be replayed; a failure here must
    // not stop the local session from being cleared.
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await clearSessionCookies();
  redirect('/login');
}

export type SessionResult =
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'anonymous' }
  | { status: 'api-unavailable'; detail?: string };

/**
 * Resolves the session without throwing.
 *
 * Three outcomes are genuinely different and must not be collapsed: signed in,
 * not signed in, and "the backend is down". Treating the third as "not signed
 * in" would bounce the user to a login page that cannot work either.
 */
export async function getSession(): Promise<SessionResult> {
  try {
    return { status: 'authenticated', user: await apiFetch<CurrentUser>('/auth/me') };
  } catch (error) {
    if (isApiUnavailable(error)) {
      return {
        status: 'api-unavailable',
        detail:
          error instanceof ApiError ? String(error.body.details ?? '') : undefined,
      };
    }
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return { status: 'anonymous' };
    }
    throw error;
  }
}

/** Current user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  return session.status === 'authenticated' ? session.user : null;
}
