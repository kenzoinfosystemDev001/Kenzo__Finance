'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';

/** Sign-in page branding, managed from Settings (settings.manage on the API). */

function failure(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof ApiError ? error.messages[0] : fallback };
}

function refresh(): void {
  revalidatePath('/settings');
  revalidatePath('/login');
}

export async function uploadLoginBackgroundAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };

  const body = new FormData();
  body.set('file', file);
  try {
    await apiFetch('/branding/login/background', { method: 'POST', formData: body });
  } catch (error) {
    return failure(error, 'The image could not be uploaded.');
  }
  refresh();
  return { ok: true };
}

export async function removeLoginBackgroundAction(): Promise<ActionResult> {
  try {
    await apiFetch('/branding/login/background', { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The image could not be removed.');
  }
  refresh();
  return { ok: true };
}

export async function updateSupportEmailAction(email: string): Promise<ActionResult> {
  try {
    await apiFetch('/branding/login', { method: 'PATCH', body: { supportEmail: email.trim() || null } });
  } catch (error) {
    return failure(error, 'The support email could not be saved.');
  }
  refresh();
  return { ok: true };
}
