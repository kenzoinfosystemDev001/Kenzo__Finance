import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Streams the filtered invoice register as CSV. The API validates the filters and enforces invoice.export. */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const upstream = await fetch(`${API_URL}/final-invoices/export${request.nextUrl.search}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ message: 'The export could not be generated.' }, { status: upstream?.status ?? 503 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/csv',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="invoices.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
