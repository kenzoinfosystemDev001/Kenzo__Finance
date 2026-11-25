import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams the invoice PDF. An issued invoice returns its stored document; a
 * draft returns a preview marked DRAFT. The API checks invoice.download and
 * records the access. `?inline=1` shows it in the browser (print / preview).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ message: 'Invoice not found.' }, { status: 404 });

  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));

  const upstream = await fetch(`${API_URL}/final-invoices/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ message: 'The invoice PDF could not be generated.' }, { status: upstream?.status ?? 503 });
  }

  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = upstream.headers.get('content-disposition') ?? 'attachment; filename="invoice.pdf"';
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      // Only the PDF type is ever served inline, so nothing executable renders here.
      'Content-Disposition': inline ? disposition.replace(/^attachment/, 'inline') : disposition,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
