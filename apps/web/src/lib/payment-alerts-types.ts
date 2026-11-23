/**
 * Payment due alert types and presentation rules. Shared by server and client
 * code, so no server-only imports here.
 */

export type PaymentAlertStage = 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE';

export interface PaymentAlertItem {
  finalInvoiceId: string;
  invoiceNumber: string | null;
  currency: string;
  customerId: string;
  customerName: string;
  outstanding: string;
  amountReceived: string;
  grandTotal: string;
  /** YYYY-MM-DD */
  dueDate: string;
  /** Negative once overdue. */
  daysRemaining: number;
  stage: PaymentAlertStage;
}

export interface PaymentAlertSummary {
  overdue: number;
  dueToday: number;
  dueSoon: number;
  totalOutstanding: string;
}

export interface PaymentAlertsResponse {
  alerts: PaymentAlertItem[];
  summary: PaymentAlertSummary;
}

export const EMPTY_PAYMENT_ALERTS: PaymentAlertsResponse = {
  alerts: [],
  summary: { overdue: 0, dueToday: 0, dueSoon: 0, totalOutstanding: '0.00' },
};

/** Words and colour for each stage, so overdue reads as urgent at a glance. */
export function describeAlert(alert: Pick<PaymentAlertItem, 'stage' | 'daysRemaining'>): { label: string; tone: 'danger' | 'warning' | 'accent' } {
  if (alert.stage === 'OVERDUE') {
    const days = Math.abs(alert.daysRemaining);
    return { label: `Overdue by ${days} day${days === 1 ? '' : 's'}`, tone: 'danger' };
  }
  if (alert.stage === 'DUE_TODAY') return { label: 'Due today', tone: 'warning' };
  const days = alert.daysRemaining;
  return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'accent' };
}

export const ALERT_TONE_CLASSES: Record<'danger' | 'warning' | 'accent', string> = {
  danger: 'border-danger/30 bg-danger-subtle text-danger',
  warning: 'border-warning/30 bg-warning-subtle text-warning',
  accent: 'border-accent/25 bg-accent-subtle text-accent',
};
