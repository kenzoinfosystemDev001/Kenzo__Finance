import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ message: 'Payment not found.' }, { status: 404 });
  const token = await getAccessToken();
  if (!token) return NextResponse.redirect(new URL('/login', request.url));
  const upstream = await fetch(`${API_URL}/payments/${id}/receipt`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!upstream || !upstream.ok) return NextResponse.json({ message: 'The payment receipt could not be downloaded.' }, { status: upstream?.status ?? 503 });
  const inline = request.nextUrl.searchParams.get('inline') === '1';
  const disposition = upstream.headers.get('content-disposition') ?? 'attachment; filename="payment-receipt.pdf"';
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
