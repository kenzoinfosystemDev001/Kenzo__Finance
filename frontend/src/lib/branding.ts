import 'server-only';
import { cache } from 'react';
import { apiFetch } from './api';
import type { AppearanceConfig } from './appearance-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface LoginBranding {
  /** Document id of the sign-in background, or null for the plain panel. */
  backgroundId: string | null;
}

/**
 * Public sign-in branding. Read without a session; a failure falls back to
 * the plain design rather than blocking sign-in.
 */
export async function getLoginBranding(): Promise<LoginBranding> {
  try {
    const response = await fetch(`${API_URL}/branding/login`, {
      // Decoration must never hold up sign-in. Without a deadline a sleeping
      // backend hangs the login page until the host kills the request.
      signal: AbortSignal.timeout(Number(process.env.API_TIMEOUT_MS ?? 8000)),
      cache: 'no-store',
    });
    if (!response.ok) return { backgroundId: null };
    const body = (await response.json()) as Partial<LoginBranding>;
    return { backgroundId: typeof body.backgroundId === 'string' ? body.backgroundId : null };
  } catch {
    return { backgroundId: null };
  }
}

/** Versioned by document id, so a replaced image is never served from cache. */
export function loginBackgroundUrl(backgroundId: string): string {
  return `/login/background?v=${encodeURIComponent(backgroundId)}`;
}

/**
 * Active sidebar, workspace and login images for a signed-in user. A failure
 * is logged and returns null, so every surface falls back to its default
 * colour instead of breaking the page.
 */
async function loadAppearanceConfig(): Promise<AppearanceConfig | null> {
  try {
    return await apiFetch<AppearanceConfig>('/branding/appearance');
  } catch (error) {
    console.error('[appearance] Could not load appearance settings; using defaults.', error);
    return null;
  }
}

/** Once per request: the layout and pages can both ask for it. */
export const getAppearanceConfig = cache(loadAppearanceConfig);
