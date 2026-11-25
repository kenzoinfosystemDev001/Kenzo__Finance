'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';

/** Same limits as the API (apps/api brand-logo.service). */
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function failure(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof ApiError ? error.messages[0] : fallback };
}

/** Every page and the sign-in screen show the logo, so refresh the whole tree. */
function refresh(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/login');
}

export async function saveCompanyLogoAction(formData: FormData): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };
  if (file.size > MAX_BYTES) return { error: 'The logo must be 2 MB or smaller.' };
  if (!TYPES.includes(file.type)) return { error: 'The logo must be a PNG, JPG or WEBP image.' };

  const body = new FormData();
  body.set('file', file, 'company-logo');
  try {
    await apiFetch('/branding/logo', { method: 'PUT', formData: body });
  } catch (error) {
    return failure(error, 'The logo could not be saved. The current logo is unchanged.');
  }
  refresh();
  return { ok: true };
}

export async function restoreCompanyLogoAction(): Promise<ActionResult> {
  try {
    await apiFetch('/branding/logo', { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The default logo could not be restored. The current logo is unchanged.');
  }
  refresh();
  return { ok: true };
}
