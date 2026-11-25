import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Streams the filtered delivery register CSV from the API (delivery.export is checked there). */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  const upstream = await fetch(`${API_URL}/deliveries/export${request.nextUrl.search}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream || !upstream.ok) {
    const body = upstream ? await upstream.json().catch(() => null) : null;
    return NextResponse.json({ message: body?.message ?? 'The delivery export could not be generated.' }, { status: upstream?.status ?? 503 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/csv',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="deliveries.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}
