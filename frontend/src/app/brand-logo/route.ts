const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The company logo, for every page and the sign-in screen. Public (the logo is
 * shown before sign-in), so no session is needed. When no logo has been
 * uploaded, it redirects to the bundled default in public/.
 *
 * Revalidated on each use (no-cache + ETag), so a new logo shows at once.
 */
export async function GET(request: Request): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/branding/logo`, {
      headers: request.headers.get('if-none-match') ? { 'If-None-Match': request.headers.get('if-none-match') as string } : {},
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    return Response.redirect(new URL('/logo.png', request.url), 302);
  }

  if (upstream.status === 404) return Response.redirect(new URL('/logo.png', request.url), 302);

  const headers: Record<string, string> = {
    'Cache-Control': 'public, no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  const etag = upstream.headers.get('etag');
  if (etag) headers.ETag = etag;

  if (upstream.status === 304) return new Response(null, { status: 304, headers });
  if (!upstream.ok || !upstream.body) return Response.redirect(new URL('/logo.png', request.url), 302);

  return new Response(upstream.body, {
    status: 200,
    headers: { ...headers, 'Content-Type': upstream.headers.get('content-type') ?? 'image/png' },
  });
}
