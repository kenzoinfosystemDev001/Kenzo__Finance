'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';

/**
 * Sign-in page settings (Admin -> Appearance). Every call goes to the API,
 * which enforces settings.manage. Nothing here is trusted on its own.
 */

function failure(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof ApiError ? error.messages[0] : fallback };
}

export async function updateSupportEmailAction(email: string): Promise<ActionResult> {
  try {
    await apiFetch('/branding/login', { method: 'PATCH', body: { supportEmail: email.trim() || null } });
  } catch (error) {
    return failure(error, 'The support email could not be saved.');
  }
  revalidatePath('/login');
  return { ok: true };
}
