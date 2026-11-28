import { Prisma } from '@prisma/client';
import { MAX_EMAIL_ATTEMPTS, PaymentReminderOutboxService } from './payment-reminder-outbox.service';

const NOW = new Date('2026-12-08T03:00:00.000Z');
const DUE = new Date('2026-12-10T00:00:00.000Z');

function reminderRow(overrides: Record<string, unknown> = {}, invoiceOverrides: Record<string, unknown> = {}) {
  return {
    stage: 'DUE_SOON',
    dueDate: DUE,
    daysRemaining: 2,
    emailAttempts: 1,
    finalInvoice: {
      invoiceNumber: 'KI/INV/0001',
      dueDate: DUE,
      currency: 'INR',
      grandTotal: new Prisma.Decimal('100.00'),
      amountReceived: new Prisma.Decimal('0'),
      paymentState: 'UNPAID',
      customer: { name: 'Acme', contacts: [{ name: 'Primary', email: 'primary@acme.test' }] },
      contact: null,
      ...invoiceOverrides,
    },
    ...overrides,
  };
}

function build(opts: { row?: unknown; claimed?: number; missing?: string[]; send?: jest.Mock } = {}) {
  const updateMany = jest.fn().mockImplementation(({ data }: { data: { emailStatus: string } }) =>
    Promise.resolve({ count: data.emailStatus === 'SENDING' ? opts.claimed ?? 1 : 0 }),
  );
  const prisma = {
    paymentReminder: {
      updateMany,
      findMany: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.row ?? reminderRow()),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const mailer = {
    missingSettings: jest.fn().mockReturnValue(opts.missing ?? []),
    send: opts.send ?? jest.fn().mockResolvedValue({ messageId: '<m1@smtp>', serverResponse: '250 OK', senderAddress: 'from@kenzo.test' }),
  };
  return { service: new PaymentReminderOutboxService(prisma as never, mailer as never), prisma, mailer };
}

type Built = ReturnType<typeof build>;
const lastUpdate = (prisma: Built['prisma']) => prisma.paymentReminder.update.mock.calls.at(-1)[0].data;

describe('PaymentReminderOutboxService', () => {
  it('sends to the primary contact and records the provider message id', async () => {
    const { service, prisma, mailer } = build();
    const result = await service.deliverPending(NOW);
    expect(result.sent).toBe(1);
    expect(mailer.send.mock.calls[0][0].to).toBe('primary@acme.test');
    expect(lastUpdate(prisma)).toMatchObject({ emailStatus: 'SENT', emailMessageId: '<m1@smtp>', recipientEmail: 'primary@acme.test' });
  });

  it('prefers the contact named on the invoice', async () => {
    const { service, mailer } = build({ row: reminderRow({}, { contact: { name: 'Billing', email: 'billing@acme.test' } }) });
    await service.deliverPending(NOW);
    expect(mailer.send.mock.calls[0][0].to).toBe('billing@acme.test');
  });

  it('does not send when another run claimed the reminder first', async () => {
    const { service, mailer } = build({ claimed: 0 });
    await service.deliverPending(NOW);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('skips an invoice that was paid after the reminder was recorded', async () => {
    const { service, prisma, mailer } = build({ row: reminderRow({}, { paymentState: 'PAID', amountReceived: new Prisma.Decimal('100.00') }) });
    const result = await service.deliverPending(NOW);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(lastUpdate(prisma).emailStatus).toBe('SKIPPED');
  });

  it('skips when the due date changed since the reminder was recorded', async () => {
    const { service, mailer } = build({ row: reminderRow({}, { dueDate: new Date('2026-12-20T00:00:00.000Z') }) });
    await service.deliverPending(NOW);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('skips a customer with no contact email', async () => {
    const { service, prisma } = build({ row: reminderRow({}, { customer: { name: 'Acme', contacts: [] } }) });
    await service.deliverPending(NOW);
    expect(lastUpdate(prisma)).toMatchObject({ emailStatus: 'SKIPPED', emailError: expect.stringMatching(/no contact email/) });
  });

  it('returns a failed send to PENDING for retry, then FAILED on the last attempt', async () => {
    const send = jest.fn().mockRejectedValue(new Error('The mail server is busy.'));
    const first = build({ send });
    await first.service.deliverPending(NOW);
    expect(lastUpdate(first.prisma)).toMatchObject({ emailStatus: 'PENDING', emailError: 'The mail server is busy.' });

    const last = build({ send, row: reminderRow({ emailAttempts: MAX_EMAIL_ATTEMPTS }) });
    const result = await last.service.deliverPending(NOW);
    expect(result.failed).toBe(1);
    expect(lastUpdate(last.prisma).emailStatus).toBe('FAILED');
  });

  it('leaves reminders pending without sending when SMTP is not configured', async () => {
    const { service, prisma, mailer } = build({ missing: ['SMTP_HOST'] });
    const result = await service.deliverPending(NOW);
    expect(result.notConfigured).toBe(true);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });
});
