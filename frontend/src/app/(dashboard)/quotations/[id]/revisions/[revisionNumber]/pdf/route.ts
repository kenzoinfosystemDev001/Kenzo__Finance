import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams the PDF of one quotation revision to the browser.
 *
 * An issued revision returns its stored document; a revision that was never
 * issued returns a preview marked DRAFT. The API checks quotation.download
 * and records the access.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionNumber: string }> },
): Promise<Response> {
  const { id, revisionNumber } = await params;
  if (!UUID.test(id) || !/^\d{1,6}$/.test(revisionNumber)) {
    return NextResponse.json({ message: 'Revision not found.' }, { status: 404 });
  }

  const token = await getAccessToken();
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const upstream = await fetch(`${API_URL}/quotations/${id}/revisions/${revisionNumber}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json(
      { message: 'The quotation PDF could not be generated.' },
      { status: upstream?.status ?? 503 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment; filename="quotation.pdf"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
