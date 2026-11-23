import type { EnquiryTone } from './enquiry-labels';
import type { InvoicePaymentState, PaymentMethodOption, PaymentStatus } from './types';

/** Labels for Payment Management (mirror of the API's payment-rules.ts). */

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING_VERIFICATION: 'Pending Verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  REVERSED: 'Reversed',
};

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, EnquiryTone> = {
  PENDING_VERIFICATION: 'warning',
  VERIFIED: 'success',
  REJECTED: 'danger',
  REVERSED: 'neutral',
};

export const PAYMENT_STATE_LABELS: Record<InvoicePaymentState, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
};

export const PAYMENT_STATES = Object.keys(PAYMENT_STATE_LABELS) as InvoicePaymentState[];

export const PAYMENT_STATE_TONES: Record<InvoicePaymentState, EnquiryTone> = {
  UNPAID: 'danger',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

export const PAYMENT_DOCUMENT_KIND_LABELS: Record<string, string> = {
  PAYMENT_PROOF: 'Payment proof',
  PAYMENT_RECEIPT: 'Payment receipt',
};

/** The configured label for a method code; unknown codes are shown readably. */
export function methodLabel(code: string, methods: PaymentMethodOption[] = []): string {
  return methods.find((m) => m.code === code)?.label ?? code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Today in the business calendar (YYYY-MM-DD, local time of the server or browser). */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
