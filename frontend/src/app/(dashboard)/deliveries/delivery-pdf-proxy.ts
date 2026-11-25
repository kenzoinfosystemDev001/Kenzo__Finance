import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams a delivery PDF (challan or packing list) from the API. Before
 * dispatch the API renders a watermarked DRAFT preview; after dispatch it
 * returns the stored document. `?inline=1` opens it in the browser.
 */
export async function proxyDeliveryPdf(request: NextRequest, id: string, kind: 'challan' | 'packing-list', label: string): Promise<Response> {
  if (!UUID.test(id)) return NextResponse.json({ message: 'Delivery not found.' }, { status: 404 });
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  const upstream = await fetch(`${API_URL}/deliveries/${id}/${kind}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream || !upstream.ok) {
    const body = upstream ? await upstream.json().catch(() => null) : null;
    return NextResponse.json({ message: body?.message ?? `The ${label} could not be downloaded.` }, { status: upstream?.status ?? 503 });
  }
  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = upstream.headers.get('content-disposition') ?? `attachment; filename="${kind}.pdf"`;
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': inline ? disposition.replace(/^attachment/, 'inline') : disposition,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
