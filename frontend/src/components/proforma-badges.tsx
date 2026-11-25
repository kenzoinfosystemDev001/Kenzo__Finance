import { Pill } from './enquiry-badges';
import { PROFORMA_STATUS_LABELS, PROFORMA_STATUS_TONES } from '@/lib/proforma-labels';
import type { ProformaStatus } from '@/lib/types';

/** Coloured status pill for proforma invoices (server- and client-safe). */
export function ProformaStatusBadge({ status }: { status: ProformaStatus }) {
  return <Pill tone={PROFORMA_STATUS_TONES[status]}>{PROFORMA_STATUS_LABELS[status]}</Pill>;
}
