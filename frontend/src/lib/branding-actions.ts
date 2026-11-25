'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import { APPEARANCE_KINDS, validateBackgroundFile, type AppearanceKind } from './appearance-types';
import type { ActionResult } from './vendor-actions';

/**
 * Appearance management (Admin -> Appearance). Every call goes to the API,
 * which enforces settings.manage and validates the file bytes again. Nothing
 * here is trusted on its own.
 */

function failure(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof ApiError ? error.messages[0] : fallback };
}

function isKind(value: string): value is AppearanceKind {
  return (APPEARANCE_KINDS as readonly string[]).includes(value);
}

/** The whole app reads appearance in its layout, so refresh all of it. */
function refreshAppearance(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/login');
}

export async function setAppearanceImageAction(kind: string, formData: FormData): Promise<ActionResult> {
  if (!isKind(kind)) return { error: 'Unknown background type.' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'Choose an image to upload.' };
  const problem = validateBackgroundFile(file);
  if (problem) return { error: problem };

  const body = new FormData();
  body.set('file', file);
  const path = kind === 'login' ? '/branding/login/background' : `/branding/appearance/${kind}`;

  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return failure(error, 'The image could not be saved. The current background is unchanged.');
  }
  refreshAppearance();
  return { ok: true };
}

/** Restores the default for one kind. The previous image is archived, not deleted. */
export async function restoreAppearanceImageAction(kind: string): Promise<ActionResult> {
  if (!isKind(kind)) return { error: 'Unknown background type.' };
  const path = kind === 'login' ? '/branding/login/background' : `/branding/appearance/${kind}`;

  try {
    await apiFetch(path, { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The default could not be restored. The current background is unchanged.');
  }
  refreshAppearance();
  return { ok: true };
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
