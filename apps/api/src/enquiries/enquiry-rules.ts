import { businessToday } from '../common/utils/business-date';
import { EnquiryStatus } from '@prisma/client';

/**
 * Enquiry lifecycle. Only the transitions listed here are allowed through
 * the status endpoint; CONVERTED is reachable only through the guarded
 * conversion used by Quotation Management, and is final.
 */
const ACTIVE_EXITS: EnquiryStatus[] = [EnquiryStatus.ON_HOLD, EnquiryStatus.LOST, EnquiryStatus.CLOSED];

export const STATUS_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: [EnquiryStatus.ASSIGNED, EnquiryStatus.IN_PROGRESS, ...ACTIVE_EXITS],
  ASSIGNED: [EnquiryStatus.IN_PROGRESS, ...ACTIVE_EXITS],
  IN_PROGRESS: [
    EnquiryStatus.FOLLOW_UP_PENDING,
    EnquiryStatus.REQUIREMENT_CLARIFICATION,
    EnquiryStatus.READY_FOR_QUOTATION,
    ...ACTIVE_EXITS,
  ],
  FOLLOW_UP_PENDING: [
    EnquiryStatus.IN_PROGRESS,
    EnquiryStatus.REQUIREMENT_CLARIFICATION,
    EnquiryStatus.READY_FOR_QUOTATION,
    ...ACTIVE_EXITS,
  ],
  REQUIREMENT_CLARIFICATION: [
    EnquiryStatus.IN_PROGRESS,
    EnquiryStatus.FOLLOW_UP_PENDING,
    EnquiryStatus.READY_FOR_QUOTATION,
    ...ACTIVE_EXITS,
  ],
  READY_FOR_QUOTATION: [EnquiryStatus.IN_PROGRESS, EnquiryStatus.REQUIREMENT_CLARIFICATION, ...ACTIVE_EXITS],
  ON_HOLD: [EnquiryStatus.IN_PROGRESS, EnquiryStatus.LOST, EnquiryStatus.CLOSED],
  // Reopening a lost/closed enquiry is allowed, with a reason.
  LOST: [EnquiryStatus.IN_PROGRESS],
  CLOSED: [EnquiryStatus.IN_PROGRESS],
  CONVERTED: [],
};

/** Changes that must say why (kept in the status history). */
export function reasonRequired(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return (
    to === EnquiryStatus.ON_HOLD ||
    to === EnquiryStatus.LOST ||
    to === EnquiryStatus.CLOSED ||
    from === EnquiryStatus.LOST ||
    from === EnquiryStatus.CLOSED
  );
}

/** Product requirements and details can change only while the enquiry is open. */
export const LOCKED_STATUSES: EnquiryStatus[] = [EnquiryStatus.CONVERTED, EnquiryStatus.LOST, EnquiryStatus.CLOSED];

/** Statuses in which an enquiry still needs follow-up attention. */
export const OPEN_STATUSES: EnquiryStatus[] = [
  EnquiryStatus.NEW,
  EnquiryStatus.ASSIGNED,
  EnquiryStatus.IN_PROGRESS,
  EnquiryStatus.FOLLOW_UP_PENDING,
  EnquiryStatus.REQUIREMENT_CLARIFICATION,
  EnquiryStatus.READY_FOR_QUOTATION,
  EnquiryStatus.ON_HOLD,
];

/** Today at 00:00 UTC, matching @db.Date columns. */
/** Today in the business time zone (see common/utils/business-date). */
export function todayUtc(): Date {
  return businessToday();
}

export function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}
