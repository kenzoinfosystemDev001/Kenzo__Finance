'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_TYPES, isPhotoOwner, type PhotoOwner } from './profile-photo';
import type { ActionResult } from './vendor-actions';

/**
 * Profile photo changes. The API validates the file bytes, re-encodes the
 * image and enforces ownership; the checks here only give a fast, clear
 * message and keep oversized uploads off the wire.
 */

export interface PhotoActionResult extends ActionResult {
  /** New photo version, or null after removal. */
  version?: string | null;
}

function failure(error: unknown, fallback: string): PhotoActionResult {
  return { error: error instanceof ApiError ? error.messages[0] : fallback };
}

function pathFor(owner: PhotoOwner): string {
  return owner === 'me' ? '/account/photo' : `/users/${owner}/photo`;
}

/** The header and every page show the user, so refresh the whole layout tree. */
function refreshEverywhere(): void {
  revalidatePath('/', 'layout');
}

export async function saveProfilePhotoAction(owner: string, formData: FormData): Promise<PhotoActionResult> {
  if (!isPhotoOwner(owner)) return { error: 'Unknown user.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return { error: 'The profile photo must be 2 MB or smaller.' };
  if (!(PROFILE_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return { error: 'The profile photo must be a JPG, PNG or WEBP image.' };
  }

  const body = new FormData();
  body.set('file', file, 'profile-photo.jpg');

  let saved: { hasPhoto: boolean; version: string | null };
  try {
    saved = await apiFetch(pathFor(owner), { method: 'PUT', formData: body });
  } catch (error) {
    return failure(error, 'The photo could not be saved. Your current photo is unchanged.');
  }

  refreshEverywhere();
  return { ok: true, version: saved.version };
}

export async function removeProfilePhotoAction(owner: string): Promise<PhotoActionResult> {
  if (!isPhotoOwner(owner)) return { error: 'Unknown user.' };

  try {
    await apiFetch(pathFor(owner as PhotoOwner), { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The photo could not be removed. Your current photo is unchanged.');
  }

  refreshEverywhere();
  return { ok: true, version: null };
}
