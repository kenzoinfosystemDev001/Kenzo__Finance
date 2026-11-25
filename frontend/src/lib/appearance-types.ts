/**
 * Appearance types shared by server and client code. Kept free of
 * 'server-only' so client components can import the constants and helpers.
 */

export const APPEARANCE_KINDS = ['login', 'sidebar', 'workspace'] as const;
export type AppearanceKind = (typeof APPEARANCE_KINDS)[number];

export const APPEARANCE_LABELS: Record<AppearanceKind, string> = {
  login: 'Login page background',
  sidebar: 'Sidebar background',
  workspace: 'Main workspace background',
};

/** The file information an authenticated user may see about an active image. */
export interface BackgroundSummary {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export type AppearanceConfig = Record<AppearanceKind, BackgroundSummary | null>;

export const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;
export const BACKGROUND_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Versioned by document id: a replaced image gets a new URL, so the browser
 * never shows a stale copy. Served by the signed-in-only proxy route.
 */
export function appearanceImageUrl(kind: Exclude<AppearanceKind, 'login'>, documentId: string): string {
  return `/appearance-image/${kind}?v=${encodeURIComponent(documentId)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Client-side check so a bad file is rejected before upload. The server re-checks the bytes. */
export function validateBackgroundFile(file: File): string | null {
  if (!(BACKGROUND_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Choose a PNG, JPEG or WEBP image.';
  }
  if (file.size === 0) return 'The file is empty.';
  if (file.size > BACKGROUND_MAX_BYTES) return 'The image must be 5 MB or smaller.';
  return null;
}
