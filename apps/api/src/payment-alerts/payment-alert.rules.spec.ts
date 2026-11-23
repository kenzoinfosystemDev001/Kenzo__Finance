import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, assertDueDateChangeAllowed, classifyPaymentAlert, daysBetween } from './payment-alert.rules';

const TODAY = new Date('2026-06-10T00:00:00.000Z');
const d = (offset: number) => addDays(TODAY, offset);
const owed = (amount: string) => new Prisma.Decimal(amount);

describe('classifyPaymentAlert', () => {
  it('raises nothing more than five days before the due date', () => {
    expect(classifyPaymentAlert({ dueDate: d(6), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })).toBeNull();
  });

  it('starts the due-soon alert exactly five days before', () => {
    expect(classifyPaymentAlert({ dueDate: d(5), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })).toEqual({
      stage: 'DUE_SOON',
      daysRemaining: 5,
    });
  });

  it('is due-soon for one to five days out', () => {
    for (const days of [1, 2, 3, 4]) {
      expect(classifyPaymentAlert({ dueDate: d(days), today: TODAY, outstanding: owed('1'), paymentState: 'UNPAID' })).toEqual({
        stage: 'DUE_SOON',
        daysRemaining: days,
      });
    }
  });

  it('is due-today on the due date', () => {
    expect(classifyPaymentAlert({ dueDate: d(0), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })).toEqual({
      stage: 'DUE_TODAY',
      daysRemaining: 0,
    });
  });

  it('is overdue from the day after the due date, with a negative count', () => {
    expect(classifyPaymentAlert({ dueDate: d(-1), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })).toEqual({
      stage: 'OVERDUE',
      daysRemaining: -1,
    });
    expect(classifyPaymentAlert({ dueDate: d(-90), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })?.daysRemaining).toBe(-90);
  });

  it('keeps a partly paid invoice overdue while a balance remains', () => {
    expect(classifyPaymentAlert({ dueDate: d(-3), today: TODAY, outstanding: owed('40'), paymentState: 'PARTIALLY_PAID' })).toEqual({
      stage: 'OVERDUE',
      daysRemaining: -3,
    });
  });

  it('stops every alert once the invoice is paid', () => {
    expect(classifyPaymentAlert({ dueDate: d(-30), today: TODAY, outstanding: owed('0'), paymentState: 'PAID' })).toBeNull();
    expect(classifyPaymentAlert({ dueDate: d(0), today: TODAY, outstanding: owed('0'), paymentState: 'PAID' })).toBeNull();
  });

  it('raises nothing when the balance is zero even if the state is not yet PAID', () => {
    expect(classifyPaymentAlert({ dueDate: d(-2), today: TODAY, outstanding: owed('0'), paymentState: 'PARTIALLY_PAID' })).toBeNull();
  });

  it('raises nothing without a due date', () => {
    expect(classifyPaymentAlert({ dueDate: null, today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })).toBeNull();
  });

  it('recalculates when the due date changes', () => {
    const before = classifyPaymentAlert({ dueDate: d(20), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' });
    expect(before).toBeNull();
    const after = classifyPaymentAlert({ dueDate: d(3), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' });
    expect(after).toEqual({ stage: 'DUE_SOON', daysRemaining: 3 });
    // Moving the date into the past makes it overdue on the same day.
    expect(classifyPaymentAlert({ dueDate: d(-4), today: TODAY, outstanding: owed('500'), paymentState: 'UNPAID' })?.stage).toBe('OVERDUE');
  });

  it('counts whole days across a month boundary', () => {
    expect(daysBetween(new Date('2026-01-31T00:00:00.000Z'), new Date('2026-02-05T00:00:00.000Z'))).toBe(5);
  });
});

describe('assertDueDateChangeAllowed', () => {
  const invoiceDate = new Date('2026-06-01T00:00:00.000Z');

  it('allows issued and sent invoices', () => {
    expect(() => assertDueDateChangeAllowed({ status: 'ISSUED', invoiceDate, dueDate: d(10) })).not.toThrow();
    expect(() => assertDueDateChangeAllowed({ status: 'SENT', invoiceDate, dueDate: d(10) })).not.toThrow();
  });

  it('allows clearing the due date, which stops the alerts', () => {
    expect(() => assertDueDateChangeAllowed({ status: 'ISSUED', invoiceDate, dueDate: null })).not.toThrow();
  });

  it('refuses drafts, approvals and cancelled invoices', () => {
    for (const status of ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'] as const) {
      expect(() => assertDueDateChangeAllowed({ status, invoiceDate, dueDate: d(10) })).toThrow(BadRequestException);
    }
  });

  it('refuses a due date before the invoice date', () => {
    expect(() => assertDueDateChangeAllowed({ status: 'ISSUED', invoiceDate, dueDate: new Date('2026-05-31T00:00:00.000Z') })).toThrow(
      'The due date cannot be before the invoice date.',
    );
  });
});
