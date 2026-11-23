import { Pill } from './enquiry-badges';
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONES,
  INVOICE_DELIVERY_STATE_LABELS,
  INVOICE_DELIVERY_STATE_TONES,
} from '@/lib/delivery-labels';
import type { DeliveryStatus, InvoiceDeliveryState } from '@/lib/types';

/** Coloured status pill for a delivery (server- and client-safe). */
export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return <Pill tone={DELIVERY_STATUS_TONES[status]}>{DELIVERY_STATUS_LABELS[status]}</Pill>;
}

/** Delivery position of an invoice, derived from confirmed quantities only. */
export function InvoiceDeliveryStateBadge({ state }: { state: InvoiceDeliveryState }) {
  return <Pill tone={INVOICE_DELIVERY_STATE_TONES[state]}>{INVOICE_DELIVERY_STATE_LABELS[state]}</Pill>;
}

/** Expected date passed and the delivery is still open. */
export function DelayedBadge() {
  return <Pill tone="danger">Delayed</Pill>;
}
