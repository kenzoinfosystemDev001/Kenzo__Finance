import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Streams a stored document to the browser.
 *
 * Storage is private and nothing is served statically: the API checks the
 * document.download permission and records the download in the audit log.
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
    return NextResponse.json(
      { message: 'The document could not be downloaded.' },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type':
        upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment',
      // An uploaded file must never be sniffed into an executable type.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
