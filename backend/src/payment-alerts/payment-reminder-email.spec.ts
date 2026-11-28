import { paymentReminderEmail } from './payment-reminder-email';

const base = {
  customerName: 'Acme Traders',
  contactName: 'Ravi Kumar',
  invoiceNumber: 'KI/INV/0042',
  currency: 'INR',
  outstanding: '40000.00',
  grandTotal: '100000.00',
  dueDate: '2026-12-10',
};

describe('paymentReminderEmail', () => {
  it('states the days left before the due date', () => {
    const mail = paymentReminderEmail({ ...base, stage: 'DUE_SOON', daysRemaining: 5 });
    expect(mail.subject).toContain('KI/INV/0042');
    expect(mail.text).toContain('due in 5 days');
    expect(mail.text).toMatch(/Dear Ravi Kumar,/);
    expect(mail.text).toContain('40,000.00');
  });

  it('says due today on the due date', () => {
    expect(paymentReminderEmail({ ...base, stage: 'DUE_TODAY', daysRemaining: 0 }).subject).toMatch(/due today/i);
  });

  it('states how many days overdue, using singular for one day', () => {
    expect(paymentReminderEmail({ ...base, stage: 'OVERDUE', daysRemaining: -1 }).text).toContain('1 day overdue');
    expect(paymentReminderEmail({ ...base, stage: 'OVERDUE', daysRemaining: -7 }).text).toContain('7 days overdue');
  });

  it('falls back to the customer name without a contact name', () => {
    expect(paymentReminderEmail({ ...base, contactName: null, stage: 'DUE_TODAY', daysRemaining: 0 }).text).toMatch(/Dear Acme Traders,/);
  });
});
