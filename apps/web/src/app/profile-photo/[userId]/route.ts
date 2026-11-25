import { getAccessToken } from '@/lib/session';
import { isPhotoOwner } from '@/lib/profile-photo';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Serves a profile photo to the signed-in browser. The session token is held
 * in an httpOnly cookie, so the browser cannot call the API directly; this
 * route forwards it server-side, and the API enforces who may see the photo.
 *
 * `ETag` and `If-None-Match` pass straight through, so an unchanged photo is a
 * cheap 304 and a replaced photo (new ETag) is fetched fresh.
 */
export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }): Promise<Response> {
  const { userId } = await params;
  if (!isPhotoOwner(userId)) return new Response(null, { status: 404 });

  const token = await getAccessToken();
  if (!token) return new Response(null, { status: 401 });

  const path = userId === 'me' ? '/account/photo' : `/users/${userId}/photo`;
  const ifNoneMatch = request.headers.get('if-none-match');

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 502 });
  }

  const headers = {
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...(upstream.headers.get('etag') ? { ETag: upstream.headers.get('etag') as string } : {}),
  };

  if (upstream.status === 304) return new Response(null, { status: 304, headers });
  if (upstream.status === 401 || upstream.status === 403 || upstream.status === 404) {
    return new Response(null, { status: upstream.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': upstream.headers.get('content-type') ?? 'image/webp',
    },
  });
}
