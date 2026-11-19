import { todayIso, type EnquiryTone } from './enquiry-labels';
import type { DiscountType, QuotationDocumentKind, QuotationStatus } from './types';

/** Display labels and lifecycle rules for Quotation Management. */

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  SENT: 'Sent',
  UNDER_NEGOTIATION: 'Under Negotiation',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  SUPERSEDED: 'Superseded',
};

/** Statuses a quotation (its current revision) can be in; SUPERSEDED applies only to older revisions. */
export const QUOTATION_STATUSES = (Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).filter((s) => s !== 'SUPERSEDED');

export const QUOTATION_STATUS_TONES: Record<QuotationStatus, EnquiryTone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'teal',
  SENT: 'accent',
  UNDER_NEGOTIATION: 'violet',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning',
  CANCELLED: 'neutral',
  SUPERSEDED: 'neutral',
};

/** Status groups offered in the list filter (comma-separated, as the list API accepts). */
export const QUOTATION_STATUS_GROUPS = [
  { value: 'DRAFT,PENDING_APPROVAL,APPROVED', label: 'Not yet sent (all stages)' },
  { value: 'SENT,UNDER_NEGOTIATION', label: 'With the customer' },
];

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  NONE: 'No discount',
  PERCENT: 'Percent (%)',
  AMOUNT: 'Amount',
};

export const QUOTATION_DOCUMENT_KIND_LABELS: Record<QuotationDocumentKind, string> = {
  QUOTATION_PDF: 'Quotation PDF (generated)',
  QUOTATION_CUSTOMER_DOCUMENT: 'Customer Document',
  QUOTATION_ATTACHMENT: 'Supporting Attachment',
};

/**
 * Client copy of the API's lifecycle (apps/api quotation-rules.ts). Used only
 * to offer sensible actions; the API enforces the real rules and permissions.
 */
export const QUOTATION_TRANSITIONS: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  DRAFT: ['PENDING_APPROVAL', 'SENT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  UNDER_NEGOTIATION: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
};

/** A new revision may be cut from a current revision in these states. */
export const REVISABLE_STATUSES: QuotationStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'UNDER_NEGOTIATION', 'REJECTED', 'EXPIRED'];

export interface StatusAction {
  target: QuotationStatus;
  label: string;
  title: string;
  /** Permission the API checks for this step. */
  permission: string;
  remarksRequired: boolean;
  tone: 'primary' | 'danger';
  message: string;
}

/**
 * The status buttons offered for a current revision, filtered by the lifecycle,
 * the approval switch and the user's permissions.
 */
export function statusActions(from: QuotationStatus, approvalRequired: boolean, permissions: string[]): StatusAction[] {
  const can = (p: string) => permissions.includes(p);
  const allowed = QUOTATION_TRANSITIONS[from] ?? [];
  const actions: StatusAction[] = [];
  for (const target of allowed) {
    switch (target) {
      case 'PENDING_APPROVAL':
        if (approvalRequired) {
          actions.push({ target, label: 'Submit for approval', title: 'Submit for approval?', permission: 'quotation.submit', remarksRequired: false, tone: 'primary', message: 'The draft goes to an approver. It cannot be edited while it waits; an approver can approve it or send it back with remarks.' });
        }
        break;
      case 'APPROVED':
        actions.push({ target, label: 'Approve', title: 'Approve quotation?', permission: 'quotation.approve', remarksRequired: false, tone: 'primary', message: 'Approving allows the quotation to be marked as sent to the customer.' });
        break;
      case 'DRAFT':
        actions.push({ target, label: 'Send back for changes', title: 'Send back for changes?', permission: 'quotation.approve', remarksRequired: true, tone: 'primary', message: 'The quotation returns to Draft so it can be edited. Say what needs to change.' });
        break;
      case 'SENT':
        if (!approvalRequired || from === 'APPROVED') {
          actions.push({ target, label: 'Mark as Sent', title: 'Mark as sent?', permission: 'quotation.send', remarksRequired: false, tone: 'primary', message: 'Records that you have given this quotation to the customer (by email, in person or by courier). The system does not send anything itself. The revision is frozen from now on and its PDF is stored.' });
        }
        break;
      case 'UNDER_NEGOTIATION':
        actions.push({ target, label: 'Under negotiation', title: 'Mark as under negotiation?', permission: 'quotation.send', remarksRequired: false, tone: 'primary', message: 'Records that the customer is negotiating. Price or item changes need a new revision.' });
        break;
      case 'ACCEPTED':
        actions.push({ target, label: 'Accepted', title: 'Record acceptance?', permission: 'quotation.send', remarksRequired: false, tone: 'primary', message: 'Records that the customer accepted this exact revision. Acceptance is final: no further revisions can be made.' });
        break;
      case 'REJECTED':
        actions.push({ target, label: 'Rejected', title: 'Record rejection?', permission: 'quotation.send', remarksRequired: true, tone: 'danger', message: 'Records that the customer rejected this revision. A new revision can still be made later.' });
        break;
      case 'EXPIRED':
        actions.push({ target, label: 'Expired', title: 'Mark as expired?', permission: 'quotation.send', remarksRequired: false, tone: 'primary', message: 'Records that the validity ran out without a decision. A new revision can still be made.' });
        break;
      case 'CANCELLED':
        actions.push({ target, label: 'Cancel quotation', title: 'Cancel quotation?', permission: 'quotation.cancel', remarksRequired: true, tone: 'danger', message: 'Cancelling is final: the quotation stays on record but can no longer change or be revised.' });
        break;
      default:
        break;
    }
  }
  return actions.filter((a) => can(a.permission));
}

/** True when a validity date (YYYY-MM-DD...) is before today. */
export const isPastDate = (value: string | null | undefined) => Boolean(value && value.slice(0, 10) < todayIso());

/** Groups the integer part Indian-style: 1234567 -> 12,34,567. */
function groupDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last}`;
}

/**
 * Formats a decimal string from the API without floating point:
 * "125000" -> "1,25,000.00". Non-numeric input is returned unchanged.
 */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const [, sign, int, frac = ''] = match;
  return `${sign ?? ''}${groupDigits(int.replace(/^0+(?=\d)/, ''))}.${(frac + '00').slice(0, 2)}`;
}

/** "125000" + "INR" -> "INR 1,25,000.00". */
export function formatMoney(value: string | number | null | undefined, currency: string): string {
  const amount = formatAmount(value);
  return amount ? `${currency} ${amount}` : '';
}

/** "18.00" -> "18", "12.50" -> "12.5". */
export function formatRate(value: string | number): string {
  const text = String(value);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** Field names in revision comparisons. */
export const COMPARE_FIELD_LABELS: Record<string, string> = {
  quantity: 'Quantity',
  unit: 'Unit',
  unitPrice: 'Unit price',
  discountType: 'Discount type',
  discountValue: 'Discount value',
  discountAmount: 'Discount amount',
  taxLabel: 'Tax label',
  taxRate: 'Tax rate (%)',
  taxAmount: 'Tax amount',
  lineTotal: 'Line total',
  description: 'Description',
  remarks: 'Remarks',
  quotationDate: 'Quotation date',
  validUntil: 'Valid until',
  subtotal: 'Subtotal',
  itemDiscountTotal: 'Item discounts',
  additionalDiscount: 'Additional discount',
  taxTotal: 'Tax total',
  otherCharges: 'Other charges',
  grandTotal: 'Grand total',
  termsAndConditions: 'Terms and conditions',
  paymentTerms: 'Payment terms',
  deliveryTerms: 'Delivery terms',
  warrantyTerms: 'Warranty terms',
  notes: 'Notes',
  internalRemarks: 'Internal remarks',
};
