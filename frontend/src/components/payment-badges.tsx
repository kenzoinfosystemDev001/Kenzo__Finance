import { Pill } from './enquiry-badges';
import { PAYMENT_STATE_LABELS, PAYMENT_STATE_TONES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_TONES } from '@/lib/payment-labels';
import type { InvoicePaymentState, PaymentStatus } from '@/lib/types';

/** Coloured status pill for a payment (server- and client-safe). */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill tone={PAYMENT_STATUS_TONES[status]}>{PAYMENT_STATUS_LABELS[status]}</Pill>;
}

/** Payment position of an invoice: unpaid, partially paid or paid (verified payments only). */
export function PaymentStateBadge({ state }: { state: InvoicePaymentState }) {
  return <Pill tone={PAYMENT_STATE_TONES[state]}>{PAYMENT_STATE_LABELS[state]}</Pill>;
}
