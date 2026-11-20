import type { EnquiryDocumentKind, EnquiryPriority, EnquiryStatus, FollowUpMethod, FollowUpOutcome } from './types';

/** Display labels and lifecycle rules for Enquiry Management. */

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  FOLLOW_UP_PENDING: 'Follow-up Pending',
  REQUIREMENT_CLARIFICATION: 'Requirement Clarification',
  READY_FOR_QUOTATION: 'Ready for Quotation',
  CONVERTED: 'Converted to Quotation',
  ON_HOLD: 'On Hold',
  LOST: 'Lost',
  CLOSED: 'Closed',
};

export const ENQUIRY_STATUSES = Object.keys(ENQUIRY_STATUS_LABELS) as EnquiryStatus[];

/** Status groups behind the summary cards (comma-separated, as the list API accepts). */
export const ENQUIRY_STATUS_GROUPS = [
  { value: 'ASSIGNED,IN_PROGRESS,REQUIREMENT_CLARIFICATION', label: 'In progress (all stages)' },
  { value: 'LOST,CLOSED', label: 'Lost or closed' },
];

export const ENQUIRY_PRIORITY_LABELS: Record<EnquiryPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ENQUIRY_PRIORITIES = Object.keys(ENQUIRY_PRIORITY_LABELS) as EnquiryPriority[];

export const FOLLOW_UP_METHOD_LABELS: Record<FollowUpMethod, string> = {
  PHONE: 'Phone Call',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  MEETING: 'Meeting',
  OTHER: 'Other',
};

export const FOLLOW_UP_OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  INTERESTED: 'Interested',
  CLARIFICATION_NEEDED: 'Clarification Needed',
  AWAITING_RESPONSE: 'Awaiting Response',
  NEGOTIATION_REQUIRED: 'Negotiation Required',
  READY_FOR_QUOTATION: 'Ready for Quotation',
  NOT_INTERESTED: 'Not Interested',
  OTHER: 'Other',
};

export const ENQUIRY_DOCUMENT_KIND_LABELS: Record<EnquiryDocumentKind, string> = {
  ENQUIRY_REQUIREMENT: 'Customer Requirement Document',
  ENQUIRY_TECH_SPEC: 'Technical Specification',
  ENQUIRY_REFERENCE_IMAGE: 'Reference Images',
  ENQUIRY_EXISTING_QUOTATION: 'Existing Quotation',
  ENQUIRY_OTHER: 'Supporting Document',
};

export type EnquiryTone = 'accent' | 'violet' | 'sky' | 'warning' | 'teal' | 'success' | 'neutral' | 'danger';

export const ENQUIRY_STATUS_TONES: Record<EnquiryStatus, EnquiryTone> = {
  NEW: 'accent',
  ASSIGNED: 'violet',
  IN_PROGRESS: 'sky',
  FOLLOW_UP_PENDING: 'warning',
  REQUIREMENT_CLARIFICATION: 'violet',
  READY_FOR_QUOTATION: 'teal',
  CONVERTED: 'success',
  ON_HOLD: 'neutral',
  LOST: 'danger',
  CLOSED: 'neutral',
};

export const ENQUIRY_PRIORITY_TONES: Record<EnquiryPriority, EnquiryTone> = {
  LOW: 'neutral',
  NORMAL: 'sky',
  HIGH: 'warning',
  URGENT: 'danger',
};

/**
 * Client copy of the API's allowed transitions (apps/api enquiry-rules.ts).
 * Used only to offer sensible choices; the API enforces the real rules.
 * CONVERTED is reached only through Quotation Management.
 */
const ACTIVE_EXITS: EnquiryStatus[] = ['ON_HOLD', 'LOST', 'CLOSED'];

export const ENQUIRY_STATUS_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ['ASSIGNED', 'IN_PROGRESS', ...ACTIVE_EXITS],
  ASSIGNED: ['IN_PROGRESS', ...ACTIVE_EXITS],
  IN_PROGRESS: ['FOLLOW_UP_PENDING', 'REQUIREMENT_CLARIFICATION', 'READY_FOR_QUOTATION', ...ACTIVE_EXITS],
  FOLLOW_UP_PENDING: ['IN_PROGRESS', 'REQUIREMENT_CLARIFICATION', 'READY_FOR_QUOTATION', ...ACTIVE_EXITS],
  REQUIREMENT_CLARIFICATION: ['IN_PROGRESS', 'FOLLOW_UP_PENDING', 'READY_FOR_QUOTATION', ...ACTIVE_EXITS],
  READY_FOR_QUOTATION: ['IN_PROGRESS', 'REQUIREMENT_CLARIFICATION', ...ACTIVE_EXITS],
  ON_HOLD: ['IN_PROGRESS', 'LOST', 'CLOSED'],
  LOST: ['IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
  CONVERTED: [],
};

/** Changes that must say why (mirrors the API). */
export function statusReasonRequired(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return to === 'ON_HOLD' || to === 'LOST' || to === 'CLOSED' || from === 'LOST' || from === 'CLOSED';
}

/** Details, items and assignment can change only while the enquiry is open. */
export const LOCKED_ENQUIRY_STATUSES: EnquiryStatus[] = ['CONVERTED', 'LOST', 'CLOSED'];
export const isEnquiryLocked = (status: EnquiryStatus) => LOCKED_ENQUIRY_STATUSES.includes(status);

/**
 * Today as YYYY-MM-DD in the business time zone, matching the API's
 * businessToday(). The UTC date was yesterday's between 00:00 and 05:30 IST.
 */
const todayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const todayIso = () => todayFormatter.format(new Date());

/** A planned follow-up before today on an enquiry that is still open. */
export function isFollowUpOverdue(nextFollowUpDate: string | null, status: EnquiryStatus): boolean {
  return Boolean(nextFollowUpDate && !isEnquiryLocked(status) && nextFollowUpDate.slice(0, 10) < todayIso());
}

/** "125000.00" -> "INR 1,25,000.00". */
export function formatBudget(amount: string | null, currency: string): string {
  if (amount === null || amount === '') return '';
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return `${currency} ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
