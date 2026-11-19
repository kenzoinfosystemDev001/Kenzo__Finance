import 'server-only';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface LoginBranding {
  backgroundId: string | null;
  supportEmail: string | null;
}

/**
 * Public sign-in branding. Read without a session; a failure falls back to
 * the plain design rather than blocking sign-in.
 */
export async function getLoginBranding(): Promise<LoginBranding> {
  try {
    const response = await fetch(`${API_URL}/branding/login`, { cache: 'no-store' });
    if (!response.ok) return { backgroundId: null, supportEmail: null };
    return (await response.json()) as LoginBranding;
  } catch {
    return { backgroundId: null, supportEmail: null };
  }
}

/** Versioned by document id, so a replaced image is never served from cache. */
export function loginBackgroundUrl(backgroundId: string): string {
  return `/login/background?v=${encodeURIComponent(backgroundId)}`;
}
