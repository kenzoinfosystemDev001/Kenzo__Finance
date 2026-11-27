import 'server-only';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export interface LoginBranding {
  supportEmail: string | null;
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
    if (!response.ok) return { supportEmail: null };
    return (await response.json()) as LoginBranding;
  } catch {
    return { supportEmail: null };
  }
}
