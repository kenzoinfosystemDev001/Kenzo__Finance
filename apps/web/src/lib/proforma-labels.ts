import type { EnquiryTone } from './enquiry-labels';
import type { ProformaStatus } from './types';

/** Labels and lifecycle rules for proforma invoices (mirror of the API's proforma-rules.ts). */

export const PROFORMA_STATUS_LABELS: Record<ProformaStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  ISSUED: 'Issued',
  SENT: 'Sent',
  CANCELLED: 'Cancelled',
};

export const PROFORMA_STATUSES = Object.keys(PROFORMA_STATUS_LABELS) as ProformaStatus[];

export const PROFORMA_STATUS_TONES: Record<ProformaStatus, EnquiryTone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'teal',
  ISSUED: 'accent',
  SENT: 'success',
  CANCELLED: 'danger',
};

export const PROFORMA_STATUS_GROUPS = [
  { value: 'DRAFT,PENDING_APPROVAL,APPROVED', label: 'Not yet issued' },
  { value: 'ISSUED,SENT', label: 'Issued (live)' },
];

export const PROFORMA_DOCUMENT_KIND_LABELS: Record<string, string> = {
  PROFORMA_PDF: 'Proforma invoice PDF',
  PROFORMA_ATTACHMENT: 'Supporting document',
};

export interface ProformaStatusAction {
  target: ProformaStatus;
  label: string;
  title: string;
  message: string;
  tone: 'primary' | 'danger';
  remarksRequired: boolean;
}

/** Lifecycle buttons the current user may use from `from`. The API re-checks everything. */
export function proformaStatusActions(from: ProformaStatus, approvalRequired: boolean, permissions: string[]): ProformaStatusAction[] {
  const can = (p: string) => permissions.includes(p);
  const actions: ProformaStatusAction[] = [];
  const issue: ProformaStatusAction = {
    target: 'ISSUED',
    label: 'Issue PI',
    title: 'Issue this proforma invoice?',
    message: 'Issuing freezes the document: customer details, bank details and terms are fixed and the PDF is stored. To correct an issued PI you must cancel it and raise a replacement.',
    tone: 'primary',
    remarksRequired: false,
  };
  if (from === 'DRAFT') {
    if (approvalRequired && can('proforma.submit')) {
      actions.push({ target: 'PENDING_APPROVAL', label: 'Submit for approval', title: 'Submit for approval?', message: 'An approver must approve the PI before it can be issued. It can no longer be edited while pending.', tone: 'primary', remarksRequired: false });
    }
    if (!approvalRequired && can('proforma.issue')) actions.push(issue);
  }
  if (from === 'PENDING_APPROVAL' && can('proforma.approve')) {
    actions.push({ target: 'APPROVED', label: 'Approve', title: 'Approve this proforma invoice?', message: 'Once approved it can be issued to the customer.', tone: 'primary', remarksRequired: false });
    actions.push({ target: 'DRAFT', label: 'Send back', title: 'Send back for changes?', message: 'The PI returns to Draft so it can be corrected. Say what needs to change.', tone: 'danger', remarksRequired: true });
  }
  if (from === 'APPROVED' && can('proforma.issue')) actions.push(issue);
  if (from === 'ISSUED' && can('proforma.issue')) {
    actions.push({ target: 'SENT', label: 'Mark as sent', title: 'Record as sent to the customer?', message: 'This records that the PI was given to the customer. The application does not email anything.', tone: 'primary', remarksRequired: false });
  }
  if (from !== 'CANCELLED' && can('proforma.cancel')) {
    actions.push({
      target: 'CANCELLED',
      label: 'Cancel PI',
      title: 'Cancel this proforma invoice?',
      message: 'The PI is kept for the record and marked cancelled. A replacement PI can then be raised from the same accepted quotation.',
      tone: 'danger',
      remarksRequired: true,
    });
  }
  return actions;
}
