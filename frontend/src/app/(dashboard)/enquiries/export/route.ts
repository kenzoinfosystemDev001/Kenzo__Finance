import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Streams the enquiry CSV export through the Next server.
 *
 * The browser cannot call the API directly with a bearer token (the token is
 * httpOnly), so this route forwards the request and pipes the response back.
 * The API still enforces the enquiry.export permission.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const upstream = await fetch(
    `${API_URL}/enquiries/export${request.nextUrl.search}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      // Exports can be large, but a hung API must not hold the request forever.
      signal: AbortSignal.timeout(60_000),
    },
  ).catch(() => null);

  if (!upstream) {
    return NextResponse.json(
      { message: 'The API could not be reached. Try again shortly.' },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { message: 'The export could not be generated.' },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/csv',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ??
        'attachment; filename="enquiries.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
