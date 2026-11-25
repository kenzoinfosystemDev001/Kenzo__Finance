import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Streams a sales export through the Next server. The browser never sees the
 * API token; the API still enforces the analytics and export permissions.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const upstream = await fetch(`${API_URL}/sales/export${request.nextUrl.search}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);

  if (!upstream) {
    return NextResponse.json({ message: 'The API could not be reached. Try again shortly.' }, { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { message: upstream.status === 403 ? 'You do not have permission to export sales.' : 'The export could not be generated.' },
      { status: upstream.status === 403 ? 403 : 502 },
    );
  }

  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Cache-Control', 'private, no-store');
  return new Response(upstream.body, { status: 200, headers });
}
