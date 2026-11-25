import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams a quotation document to the browser.
 *
 * Storage is private and nothing is served statically. The API checks the
 * document.download permission, confirms the document belongs to this quotation (generated PDFs also need quotation.download)
 * and records the access. `?preview=1` asks for inline display; the API only
 * honours it for PDF and raster images, everything else downloads.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  const { id, documentId } = await params;
  if (!UUID.test(id) || !UUID.test(documentId)) {
    return NextResponse.json({ message: 'Document not found.' }, { status: 404 });
  }

  const token = await getAccessToken();
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const preview = request.nextUrl.searchParams.get('preview') === '1';
  const upstream = await fetch(
    `${API_URL}/quotations/${id}/documents/${documentId}/content${preview ? '?preview=true' : ''}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  ).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json(
      { message: 'The document could not be retrieved.' },
      { status: upstream?.status ?? 503 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'attachment',
      // The verified type must be used as-is; never sniffed into something executable.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
