import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Streams a delivery document (POD, signature, photo, attachment, stored challan / packing list). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  const { id, documentId } = await params;
  if (!UUID.test(id) || !UUID.test(documentId)) return NextResponse.json({ message: 'Document not found.' }, { status: 404 });
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  const preview = request.nextUrl.searchParams.get('preview') === '1' || request.nextUrl.searchParams.get('preview') === 'true';
  const upstream = await fetch(`${API_URL}/deliveries/${id}/documents/${documentId}/content?preview=${preview ? 'true' : 'false'}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream || !upstream.ok) {
    const body = upstream ? await upstream.json().catch(() => null) : null;
    return NextResponse.json({ message: body?.message ?? 'The document could not be downloaded.' }, { status: upstream?.status ?? 503 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
