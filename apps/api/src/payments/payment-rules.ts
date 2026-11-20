import { InvoicePaymentState, PaymentStatus, Prisma } from '@prisma/client';

/**
 * Payment lifecycle.
 *
 *   PENDING_VERIFICATION ── verify ──▶ VERIFIED ── reverse (reason) ──▶ REVERSED
 *            └────────── reject (reason) ──▶ REJECTED
 *
 * Only VERIFIED payments count as money received. Rejected and reversed
 * payments are kept for the record (never deleted) and never count.
 * Only a payment pending verification can be edited.
 */
export const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING_VERIFICATION: [PaymentStatus.VERIFIED, PaymentStatus.REJECTED],
  VERIFIED: [PaymentStatus.REVERSED],
  REJECTED: [],
  REVERSED: [],
};

export const label = (status: PaymentStatus) => status.toLowerCase().replace(/_/g, ' ');

export interface PaymentMethodOption {
  code: string;
  label: string;
  active: boolean;
}

/**
 * The PRD's suggested methods. Which of them the business accepts must be
 * confirmed; administrators switch them on/off in Settings.
 */
export const DEFAULT_METHODS: PaymentMethodOption[] = [
  { code: 'CASH', label: 'Cash', active: true },
  { code: 'BANK_TRANSFER', label: 'Bank Transfer', active: true },
  { code: 'UPI', label: 'UPI', active: true },
  { code: 'CHEQUE', label: 'Cheque', active: true },
  { code: 'CARD', label: 'Card', active: true },
  { code: 'OTHER', label: 'Other', active: true },
];

const D = Prisma.Decimal;

/** Payment position of an invoice from its total and verified receipts. */
export function paymentState(grandTotal: Prisma.Decimal, received: Prisma.Decimal): InvoicePaymentState {
  if (received.lessThanOrEqualTo(0)) return InvoicePaymentState.UNPAID;
  if (received.greaterThanOrEqualTo(grandTotal)) return InvoicePaymentState.PAID;
  return InvoicePaymentState.PARTIALLY_PAID;
}

/** Lower-cased reference without spaces/dashes, for duplicate detection. */
export function normalizeReference(value: string | null | undefined): string | null {
  if (!value) return null;
  const n = value.toLowerCase().replace(/[\s\-_/]/g, '');
  return n || null;
}

export const money = (value: Prisma.Decimal | string | number) => new D(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
