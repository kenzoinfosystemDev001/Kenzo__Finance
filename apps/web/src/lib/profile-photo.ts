/**
 * Profile photo helpers shared by server and client code. No server-only
 * imports here: the avatar and crop dialog run in the browser.
 */

/** Matches the API limit (apps/api profile-photo.service). */
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `me` for the signed-in user, otherwise a user id. */
export type PhotoOwner = 'me' | string;

export function isPhotoOwner(value: string): boolean {
  return value === 'me' || UUID.test(value);
}

/**
 * Same-origin URL that the web server answers with the image (it adds the
 * session token; the browser never holds one). `version` changes whenever the
 * photo changes, so a replaced photo is never shown from cache.
 */
export function profilePhotoUrl(owner: PhotoOwner, version: string | null | undefined): string | null {
  if (!version) return null;
  return `/profile-photo/${owner}?v=${encodeURIComponent(version)}`;
}

/** Version string from the API's content hash (matches the API's photoVersion). */
export function versionFromSha(sha256: string | null | undefined): string | null {
  return sha256 ? sha256.slice(0, 16) : null;
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
