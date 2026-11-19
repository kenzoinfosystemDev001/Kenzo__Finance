import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Streams a product image.
 *
 * Document storage is private, so there is no public URL an <img> could point
 * at. This route forwards the request with the server-held token; the API
 * still enforces the download permission.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  const { documentId } = await params;
  const token = await getAccessToken();

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const upstream = await fetch(`${API_URL}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
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
