import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Streams the filtered PI CSV export. The API enforces proforma.export. */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const upstream = await fetch(`${API_URL}/proforma-invoices/export${request.nextUrl.search}`, {
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
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="proforma-invoices.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
