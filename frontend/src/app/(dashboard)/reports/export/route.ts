import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** ExportQueryDto fields; anything else would be rejected (forbidNonWhitelisted). */
const ALLOWED = ['report', 'format', 'preset', 'dateFrom', 'dateTo', 'customerId', 'productId', 'assignedToId', 'buckets'];

/** Streams GET /analytics/export with the API's own content type and file name. */
export async function GET(request: NextRequest): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const search = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) search.set(key, value);
  }

  const upstream = await fetch(`${API_URL}/analytics/export?${search.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream) return NextResponse.json({ message: 'The API could not be reached, so the report could not be exported.' }, { status: 503 });
  if (!upstream.ok) {
    let message = 'The report export could not be generated.';
    try {
      const body = (await upstream.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    return NextResponse.json({ message }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="report"',
      'Cache-Control': 'private, no-store',
    },
  });
}
