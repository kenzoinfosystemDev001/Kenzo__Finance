import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams a product image.
 *
 * Document storage is private, so there is no public URL an <img> could point
 * at. This route forwards the request with the server-held token to the
 * product-scoped endpoint, so the API checks both the download permission and
 * that the image belongs to this product (any other document id is a 404).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  const { id, documentId } = await params;
  if (!UUID.test(id) || !UUID.test(documentId)) {
    return new NextResponse(null, { status: 404 });
  }
  const token = await getAccessToken();

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const upstream = await fetch(
    `${API_URL}/products/${id}/documents/${documentId}/content?preview=true`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
  ).catch(() => null);

  if (!upstream || !upstream.ok) {
    return new NextResponse(null, { status: upstream?.status ?? 503 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';

  // Only ever render an image inline. Anything else is returned as a download
  // so a mis-filed document cannot execute in the page's origin.
  const isImage = contentType.startsWith('image/');

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': isImage ? contentType : 'application/octet-stream',
      'Content-Disposition': isImage ? 'inline' : 'attachment',
      'X-Content-Type-Options': 'nosniff',
      // Private per user; never cached by a shared proxy.
      'Cache-Control': 'private, max-age=60',
    },
  });
}
