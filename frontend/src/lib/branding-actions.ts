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

function pathFor(kind: AppearanceKind): string {
  return kind === 'login' ? '/branding/login/background' : `/branding/appearance/${kind}`;
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

  try {
    await apiFetch(pathFor(kind), { method: 'POST', formData: body });
  } catch (error) {
    return failure(error, 'The image could not be saved. The current background is unchanged.');
  }
  refreshAppearance();
  return { ok: true };
}

/** Removes the image for one kind (its stored file is deleted) and restores the default. */
export async function removeAppearanceImageAction(kind: string): Promise<ActionResult> {
  if (!isKind(kind)) return { error: 'Unknown background type.' };

  try {
    await apiFetch(pathFor(kind), { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The image could not be removed. The current background is unchanged.');
  }
  refreshAppearance();
  return { ok: true };
}
