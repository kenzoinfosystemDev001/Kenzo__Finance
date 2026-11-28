import type { PaymentAlertStage } from './payment-alert.rules';

export interface ReminderEmailInput {
  stage: PaymentAlertStage;
  customerName: string;
  contactName: string | null;
  invoiceNumber: string;
  currency: string;
  outstanding: string;
  grandTotal: string;
  dueDate: string; // YYYY-MM-DD
  daysRemaining: number;
}

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const formatAmount = (currency: string, amount: string) => {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

/** Plain-text payment reminder. Only facts from the invoice; no invented terms. */
export function paymentReminderEmail(input: ReminderEmailInput): { subject: string; text: string } {
  const due = formatDate(input.dueDate);
  const outstanding = formatAmount(input.currency, input.outstanding);
  const total = formatAmount(input.currency, input.grandTotal);

  let subject: string;
  let opening: string;
  switch (input.stage) {
    case 'DUE_SOON': {
      const days = input.daysRemaining === 1 ? '1 day' : `${input.daysRemaining} days`;
      subject = `Payment reminder: invoice ${input.invoiceNumber} is due on ${due}`;
      opening = `This is a friendly reminder that payment for invoice ${input.invoiceNumber} is due in ${days}, on ${due}.`;
      break;
    }
    case 'DUE_TODAY':
      subject = `Payment due today: invoice ${input.invoiceNumber}`;
      opening = `Payment for invoice ${input.invoiceNumber} is due today, ${due}.`;
      break;
    case 'OVERDUE': {
      const overdue = -input.daysRemaining;
      const days = overdue === 1 ? '1 day' : `${overdue} days`;
      subject = `Overdue payment: invoice ${input.invoiceNumber}`;
      opening = `Payment for invoice ${input.invoiceNumber} was due on ${due} and is now ${days} overdue.`;
      break;
    }
  }

  const text = [
    `Dear ${input.contactName?.trim() || input.customerName},`,
    '',
    opening,
    '',
    `Invoice number: ${input.invoiceNumber}`,
    `Invoice total: ${total}`,
    `Amount outstanding: ${outstanding}`,
    `Due date: ${due}`,
    '',
    'If you have already made this payment, please ignore this message; it can take a short while for a payment to be verified.',
    '',
    'Regards,',
    'Accounts, Kenzo Infosystems',
  ].join('\n');

  return { subject, text };
}
