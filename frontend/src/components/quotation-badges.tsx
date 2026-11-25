import { Pill } from './enquiry-badges';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_TONES } from '@/lib/quotation-labels';
import type { QuotationStatus } from '@/lib/types';

/** Coloured status pills for quotations (server- and client-safe). */

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Pill tone={QUOTATION_STATUS_TONES[status]}>{QUOTATION_STATUS_LABELS[status]}</Pill>;
}

/** Shown when the validity date has passed but the quotation was not marked expired. */
export function PastValidityBadge() {
  return <Pill tone="warning">Validity passed</Pill>;
}
