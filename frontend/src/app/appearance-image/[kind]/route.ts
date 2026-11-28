import { getAccessToken } from '@/lib/session';
import { APPEARANCE_KINDS } from '@/lib/appearance-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Serves an active sidebar or workspace background to signed-in users only.
 * The browser never sees the API token; this route forwards the session
 * token server-side, and the API enforces the signed-in check again.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await params;
  if (!(APPEARANCE_KINDS as readonly string[]).includes(kind)) return new Response(null, { status: 404 });

  const token = await getAccessToken();
  if (!token) return new Response(null, { status: 401 });

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/branding/appearance/${kind}/image`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  if (upstream.status === 401 || upstream.status === 404) return new Response(null, { status: upstream.status });
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      // Private: the image belongs to a signed-in session, never a shared cache.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
