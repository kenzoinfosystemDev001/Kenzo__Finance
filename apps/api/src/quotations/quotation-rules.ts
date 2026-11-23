import { QuotationStatus } from '@prisma/client';
import { businessToday } from '../common/utils/business-date';

/**
 * Quotation lifecycle (applies to the CURRENT revision only; older revisions
 * are SUPERSEDED and frozen).
 *
 *   DRAFT ── submit ──▶ PENDING_APPROVAL ── approve ──▶ APPROVED ── send ──▶ SENT
 *     │  (approval off: DRAFT ── send ──▶ SENT)    └─ send back ──▶ DRAFT
 *   SENT ──▶ UNDER_NEGOTIATION | ACCEPTED | REJECTED | EXPIRED
 *   UNDER_NEGOTIATION ──▶ ACCEPTED | REJECTED | EXPIRED (changes = new revision)
 *   any open status ──▶ CANCELLED
 *
 * "Sent" records that the quotation was given to the customer by someone;
 * emailing is recorded separately (see quotation-email.service.ts).
 */
export const TRANSITIONS: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  DRAFT: [QuotationStatus.PENDING_APPROVAL, QuotationStatus.SENT, QuotationStatus.CANCELLED],
  PENDING_APPROVAL: [QuotationStatus.APPROVED, QuotationStatus.DRAFT, QuotationStatus.CANCELLED],
  APPROVED: [QuotationStatus.SENT, QuotationStatus.CANCELLED],
  SENT: [QuotationStatus.UNDER_NEGOTIATION, QuotationStatus.ACCEPTED, QuotationStatus.REJECTED, QuotationStatus.EXPIRED, QuotationStatus.CANCELLED],
  UNDER_NEGOTIATION: [QuotationStatus.ACCEPTED, QuotationStatus.REJECTED, QuotationStatus.EXPIRED, QuotationStatus.CANCELLED],
};

/** Final states: no further changes and no new revisions. */
export const FINAL: QuotationStatus[] = [QuotationStatus.ACCEPTED, QuotationStatus.CANCELLED];

/** A new revision may be cut from a current revision in these states. */
export const REVISABLE: QuotationStatus[] = [
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.APPROVED,
  QuotationStatus.SENT,
  QuotationStatus.UNDER_NEGOTIATION,
  QuotationStatus.REJECTED,
  QuotationStatus.EXPIRED,
];

/** Changes that must carry remarks in the status history. */
export const REMARKS_REQUIRED: QuotationStatus[] = [QuotationStatus.REJECTED, QuotationStatus.CANCELLED];

export const label = (status: QuotationStatus) => status.toLowerCase().replace(/_/g, ' ');

/** Today in the business time zone, as 00:00 UTC of that date (matches @db.Date columns). */
export function todayUtc(): Date {
  return businessToday();
}

export const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
