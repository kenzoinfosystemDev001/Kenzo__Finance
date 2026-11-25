const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Serves the sign-in background configured in Settings. Public by design:
 * the API only ever returns the one image the setting points at.
 */
export async function GET(): Promise<Response> {
  const upstream = await fetch(`${API_URL}/branding/login/background`, { cache: 'no-store' }).catch(
    () => null,
  );

  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream?.status === 404 ? 404 : 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'X-Content-Type-Options': 'nosniff',
      // The page requests ?v=<document id>, so a new image gets a new URL.
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
