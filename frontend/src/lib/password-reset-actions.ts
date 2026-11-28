'use server';

import { redirect } from 'next/navigation';
import { forwardingHeaders } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** A deliberate action the user waits on; tolerate a backend waking from idle. */
const TIMEOUT_MS = Number(process.env.API_LOGIN_TIMEOUT_MS ?? 20000);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type PasswordResetFormState = { error?: string; sent?: boolean; message?: string };

const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';

async function post(path: string, body: unknown): Promise<Response | { networkError: string }> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await forwardingHeaders()) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError');
    return {
      networkError: timedOut
        ? 'The server took too long to respond. It may be waking from idle - please try again.'
        : 'Could not reach the server. Please try again in a moment.',
    };
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  if (response.status === 429) return TOO_MANY;
  const body = await response.json().catch(() => null);
  const message = body?.message;
  return (Array.isArray(message) ? message[0] : message) ?? fallback;
}

export async function forgotPasswordAction(
  _prev: PasswordResetFormState,
  formData: FormData,
): Promise<PasswordResetFormState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!EMAIL_PATTERN.test(email)) return { error: 'Enter a valid email address.' };

  const response = await post('/auth/password/forgot', { email });
  if ('networkError' in response) return { error: response.networkError };
  if (!response.ok) return { error: await errorMessage(response, 'The request could not be completed. Please try again.') };

  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return { sent: true, message: body?.message };
}

export async function resetPasswordAction(
  _prev: PasswordResetFormState,
  formData: FormData,
): Promise<PasswordResetFormState> {
  const token = String(formData.get('token') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!token) return { error: 'This password reset link is invalid or has expired. Request a new one.' };
  if (newPassword.length < 12) return { error: 'New password must be at least 12 characters.' };
  if (newPassword !== confirmPassword) return { error: 'The passwords do not match.' };

  const response = await post('/auth/password/reset', { token, newPassword });
  if ('networkError' in response) return { error: response.networkError };
  if (!response.ok) return { error: await errorMessage(response, 'The password could not be reset. Please try again.') };

  // redirect() throws internally, so it stays outside any try block.
  redirect('/login?reason=password-reset');
}
