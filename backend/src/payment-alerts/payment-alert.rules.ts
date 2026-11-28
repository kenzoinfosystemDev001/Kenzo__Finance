import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Payment due alert rules. Pure functions: no database, no clock. The caller
 * passes today's business date, so every rule is testable and recalculates
 * whenever the due date, the amount received or the payment state changes.
 */

/** An alert starts this many days before the due date. */
export const DUE_SOON_WINDOW_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PaymentAlertStage = 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE';

export interface PaymentAlertState {
  stage: PaymentAlertStage;
  /** Days until the due date. Zero on the due date; negative once overdue. */
  daysRemaining: number;
}

/** Whole days from `today` to `dueDate`. Both are UTC-midnight business dates. */
export function daysBetween(today: Date, dueDate: Date): number {
  return Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
}

/**
 * The alert state of one invoice, or null when no alert applies.
 *
 * - No due date, nothing outstanding, or fully paid: no alert. A verified
 *   payment that clears the balance therefore stops every reminder.
 * - More than five days before the due date: no alert yet.
 * - One to five days before: due soon. Zero days: due today.
 * - Any time after the due date: overdue, until the balance is paid.
 */
export function classifyPaymentAlert(input: {
  dueDate: Date | null;
  today: Date;
  outstanding: Prisma.Decimal;
  paymentState: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
}): PaymentAlertState | null {
  if (!input.dueDate) return null;
  if (input.paymentState === 'PAID') return null;
  if (input.outstanding.lte(0)) return null;

  const days = daysBetween(input.today, input.dueDate);
  if (days < 0) return { stage: 'OVERDUE', daysRemaining: days };
  if (days === 0) return { stage: 'DUE_TODAY', daysRemaining: 0 };
  if (days <= DUE_SOON_WINDOW_DAYS) return { stage: 'DUE_SOON', daysRemaining: days };
  return null;
}

/** While an invoice stays overdue, the reminder repeats every this many days. */
export const OVERDUE_REPEAT_DAYS = 3;

/**
 * Which reminder cycle an alert belongs to. Due-soon and due-today are sent
 * once (cycle 0). Overdue repeats: days 1-3 overdue are cycle 0, days 4-6
 * cycle 1, and so on, so a new reminder starts every OVERDUE_REPEAT_DAYS.
 */
export function reminderCycle(state: PaymentAlertState): number {
  if (state.stage !== 'OVERDUE') return 0;
  const daysOverdue = -state.daysRemaining;
  return Math.max(0, Math.floor((daysOverdue - 1) / OVERDUE_REPEAT_DAYS));
}

/** Adds whole days to a UTC-midnight date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Rules for an admin changing the due date of an issued invoice.
 *
 * The invoice must be issued (not a draft, not cancelled), the new date cannot
 * fall before the invoice date, and clearing the date is allowed (it stops the
 * alerts for that invoice).
 */
export function assertDueDateChangeAllowed(input: {
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ISSUED' | 'SENT' | 'CANCELLED';
  invoiceDate: Date;
  dueDate: Date | null;
}): void {
  if (input.status !== 'ISSUED' && input.status !== 'SENT') {
    throw new BadRequestException(
      'Payment due dates can be changed on issued invoices. Drafts are edited on the invoice form.',
    );
  }
  if (input.dueDate && input.dueDate.getTime() < input.invoiceDate.getTime()) {
    throw new BadRequestException('The due date cannot be before the invoice date.');
  }
}
