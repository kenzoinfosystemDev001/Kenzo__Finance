import type { EnquiryTone } from './enquiry-labels';
import type { FinalInvoiceItem, FinalInvoiceStatus, ProformaItem } from './types';

/** Labels and lifecycle rules for final invoices (mirror of the API's final-invoice-rules.ts). */

export const FINAL_INVOICE_STATUS_LABELS: Record<FinalInvoiceStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  ISSUED: 'Issued',
  SENT: 'Sent',
  CANCELLED: 'Cancelled',
};

export const FINAL_INVOICE_STATUSES = Object.keys(FINAL_INVOICE_STATUS_LABELS) as FinalInvoiceStatus[];

export const FINAL_INVOICE_STATUS_TONES: Record<FinalInvoiceStatus, EnquiryTone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'teal',
  ISSUED: 'accent',
  SENT: 'success',
  CANCELLED: 'danger',
};

export const FINAL_INVOICE_STATUS_GROUPS = [
  { value: 'DRAFT,PENDING_APPROVAL,APPROVED', label: 'Not yet issued' },
  { value: 'ISSUED,SENT', label: 'Issued (live)' },
];

export const FINAL_INVOICE_DOCUMENT_KIND_LABELS: Record<string, string> = {
  FINAL_INVOICE_PDF: 'Invoice PDF',
  FINAL_INVOICE_ATTACHMENT: 'Supporting document',
};

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];


export interface FinalInvoiceStatusAction {
  target: FinalInvoiceStatus;
  label: string;
  title: string;
  message: string;
  tone: 'primary' | 'danger';
  remarksRequired: boolean;
}

/** Lifecycle buttons the current user may use from `from`. The API re-checks everything. */
export function finalInvoiceStatusActions(from: FinalInvoiceStatus, approvalRequired: boolean, permissions: string[]): FinalInvoiceStatusAction[] {
  const can = (p: string) => permissions.includes(p);
  const actions: FinalInvoiceStatusAction[] = [];
  const issue: FinalInvoiceStatusAction = {
    target: 'ISSUED',
    label: 'Issue invoice',
    title: 'Issue this invoice?',
    message:
      'Issuing allocates the next invoice number and freezes the invoice: customer details, bank details and terms are fixed and the PDF is stored. An issued invoice is never edited; it can only be cancelled.',
    tone: 'primary',
    remarksRequired: false,
  };
  if (from === 'DRAFT') {
    if (approvalRequired && can('invoice.submit')) {
      actions.push({ target: 'PENDING_APPROVAL', label: 'Submit for approval', title: 'Submit for approval?', message: 'An approver must approve the invoice before it can be issued. It can no longer be edited while pending.', tone: 'primary', remarksRequired: false });
    }
    if (!approvalRequired && can('invoice.issue')) actions.push(issue);
  }
  if (from === 'PENDING_APPROVAL' && can('invoice.approve')) {
    actions.push({ target: 'APPROVED', label: 'Approve', title: 'Approve this invoice?', message: 'Once approved it can be issued.', tone: 'primary', remarksRequired: false });
    actions.push({ target: 'DRAFT', label: 'Send back', title: 'Send back for changes?', message: 'The invoice returns to Draft so it can be corrected. Say what needs to change.', tone: 'danger', remarksRequired: true });
  }
  if (from === 'APPROVED' && can('invoice.issue')) actions.push(issue);
  if (from === 'ISSUED' && can('invoice.issue')) {
    actions.push({ target: 'SENT', label: 'Mark as sent', title: 'Record as sent to the customer?', message: 'This records that the invoice was given to the customer. The application does not email anything.', tone: 'primary', remarksRequired: false });
  }
  if (from !== 'CANCELLED' && can('invoice.cancel')) {
    actions.push({
      target: 'CANCELLED',
      label: 'Cancel invoice',
      title: 'Cancel this invoice?',
      message: 'The invoice is kept for the record and marked cancelled; an issued number is never reused. A replacement invoice can then be raised from the same proforma invoice.',
      tone: 'danger',
      remarksRequired: true,
    });
  }
  return actions;
}

/** Invoice lines in the shape the shared read-only ProformaLines table expects. */
export function asLineItems(items: FinalInvoiceItem[]): ProformaItem[] {
  return items.map(({ proformaInvoiceItemId, ...item }) => ({ ...item, quotationItemId: proformaInvoiceItemId }));
}
