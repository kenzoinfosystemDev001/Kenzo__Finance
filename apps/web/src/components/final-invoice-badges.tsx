import { Pill } from './enquiry-badges';
import { FINAL_INVOICE_STATUS_LABELS, FINAL_INVOICE_STATUS_TONES } from '@/lib/final-invoice-labels';
import type { FinalInvoiceStatus } from '@/lib/types';

/** Coloured status pill for final invoices (server- and client-safe). */
export function FinalInvoiceStatusBadge({ status }: { status: FinalInvoiceStatus }) {
  return <Pill tone={FINAL_INVOICE_STATUS_TONES[status]}>{FINAL_INVOICE_STATUS_LABELS[status]}</Pill>;
}

/** Shown in place of the invoice number until the invoice is issued. */
export function DraftNumberPill() {
  return <Pill tone="neutral">Draft</Pill>;
}

export function PastDueBadge() {
  return <Pill tone="danger">Past due date</Pill>;
}
