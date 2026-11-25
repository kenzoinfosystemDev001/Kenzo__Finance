'use server';

import { cache } from 'react';
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

/**
 * A sign-in is a deliberate action the user is waiting on, so it tolerates a
 * backend waking from idle. Page renders use the much shorter timeout in
 * api.ts, because a visitor should not stare at a blank page for a minute.
 */
const LOGIN_TIMEOUT_MS = Number(process.env.API_LOGIN_TIMEOUT_MS ?? 20000);

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
      // Longer than a page render: a backend waking from idle should still be
      // able to complete a deliberate sign-in rather than fail instantly.
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
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
  } catch (cause) {
    const timedOut =
      cause instanceof Error &&
      (cause.name === 'TimeoutError' || cause.name === 'AbortError');

    return {
      error: timedOut
        ? 'The server took too long to respond. It may be waking from idle - please try again.'
        : 'Could not reach the server. Please try again in a moment.',
    };
  }

  await setSessionCookies(tokens, formData.get('remember') === 'on');

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
      // Signing out must never hang on an unreachable API; the cookies are
      // cleared locally either way.
      signal: AbortSignal.timeout(5000),
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
/**
 * Next signals a page that reads cookies during static prerendering with this
 * digest. It is control flow, not an error: rethrow it so Next can render the
 * route dynamically. Catching it logged one error per route at build time.
 */
function isDynamicRenderSignal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { digest?: unknown }).digest === 'DYNAMIC_SERVER_USAGE';
}

async function resolveSession(): Promise<SessionResult> {
  try {
    return { status: 'authenticated', user: await apiFetch<CurrentUser>('/auth/me') };
  } catch (error) {
    if (isDynamicRenderSignal(error)) throw error;
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

    // Anything else - a 404 because the base URL is missing /api/v1, a 500
    // inside the API, an unparseable body - still means "no usable session".
    // Rethrowing produced an unhandled Server Component error, which Vercel
    // renders as a bare "Application error ... Digest: 123456" with no way
    // forward. The operator needs the detail, so it goes to the server log
    // where it is actually readable; the visitor gets a page with a retry.
    console.error('[getSession] Unexpected failure resolving the session:', error);

    return {
      status: 'api-unavailable',
      detail:
        error instanceof ApiError
          ? `HTTP ${error.status}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }
}

/**
 * Once per request: the layout and the page both ask for the session while
 * rendering, and React cache() makes that one API call instead of two.
 */
const sessionForRequest = cache(resolveSession);

export async function getSession(): Promise<SessionResult> {
  return sessionForRequest();
}

/** Current user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  return session.status === 'authenticated' ? session.user : null;
}
