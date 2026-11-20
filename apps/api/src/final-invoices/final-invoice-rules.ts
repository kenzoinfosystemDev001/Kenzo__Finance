import { FinalInvoiceStatus } from '@prisma/client';

/**
 * Final invoice lifecycle.
 *
 *   DRAFT ── issue ──▶ ISSUED ── record sent ──▶ SENT
 *     │ (approval on: DRAFT ── submit ──▶ PENDING_APPROVAL ── approve ──▶ APPROVED ── issue ──▶ ISSUED;
 *     │               PENDING_APPROVAL ── send back (remarks) ──▶ DRAFT)
 *   any state except CANCELLED ── cancel (reason) ──▶ CANCELLED
 *
 * - The invoice number is allocated at ISSUE, inside the issue transaction,
 *   so numbers are consecutive and never reused (a rolled-back issue does not
 *   consume one) and drafts never leave gaps.
 * - Issuing freezes the invoice and stores the PDF once.
 * - Paid / partially paid / overdue-by-balance are derived from Payment
 *   records (Payment Management), never set by hand.
 * - Corrections to an issued invoice: cancellation with a reason. Credit notes
 *   and amendment rules are a pending legal/business decision.
 */
export const TRANSITIONS: Record<FinalInvoiceStatus, FinalInvoiceStatus[]> = {
  DRAFT: [FinalInvoiceStatus.PENDING_APPROVAL, FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.CANCELLED],
  PENDING_APPROVAL: [FinalInvoiceStatus.APPROVED, FinalInvoiceStatus.DRAFT, FinalInvoiceStatus.CANCELLED],
  APPROVED: [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.CANCELLED],
  ISSUED: [FinalInvoiceStatus.SENT, FinalInvoiceStatus.CANCELLED],
  SENT: [FinalInvoiceStatus.CANCELLED],
  CANCELLED: [],
};

export const EDITABLE: FinalInvoiceStatus[] = [FinalInvoiceStatus.DRAFT];
export const ISSUED_STATES: FinalInvoiceStatus[] = [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT];

export const label = (status: FinalInvoiceStatus) => status.toLowerCase().replace(/_/g, ' ');

export interface InvoiceNumbering {
  /** Text before the running number, e.g. "KI/INV/". */
  prefix: string;
  /** Digits of the running number (zero-padded). */
  padding: number;
  /** One series per financial year ("KI/INV/2026-27/00001"); the counter restarts each year. */
  financialYear: boolean;
  /** First month (1-12) of the financial year; 4 = April (India). */
  fyStartMonth: number;
}

export const DEFAULT_NUMBERING: InvoiceNumbering = { prefix: 'KI/INV/', padding: 5, financialYear: false, fyStartMonth: 4 };

/** "2026-27" for a date in the financial year that starts in fyStartMonth of 2026. */
export function financialYearLabel(date: Date, fyStartMonth: number): string {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() + 1 >= fyStartMonth ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Sequence key and prefix for an invoice dated `date` under the numbering settings. */
export function sequenceFor(numbering: InvoiceNumbering, date: Date): { key: string; prefix: string } {
  if (!numbering.financialYear) return { key: 'FINAL_INVOICE', prefix: numbering.prefix };
  const fy = financialYearLabel(date, numbering.fyStartMonth);
  return { key: `FINAL_INVOICE:${fy}`, prefix: `${numbering.prefix}${fy}/` };
}

/** What the n-th number would look like (for previews; allocates nothing). */
export function formatInvoiceNumber(prefix: string, padding: number, value: number): string {
  return `${prefix}${String(value).padStart(padding, '0')}`;
}

/** GST rule 46(b): an invoice serial number may not exceed 16 characters. Reported as a warning only. */
export const GST_MAX_INVOICE_NUMBER_LENGTH = 16;
