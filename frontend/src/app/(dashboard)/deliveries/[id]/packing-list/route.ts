import type { NextRequest } from 'next/server';
import { proxyDeliveryPdf } from '../../delivery-pdf-proxy';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxyDeliveryPdf(request, id, 'packing-list', 'packing list');
}
