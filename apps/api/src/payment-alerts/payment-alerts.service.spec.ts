import { Prisma } from '@prisma/client';
import { businessToday } from '../common/utils/business-date';
import { addDays } from './payment-alert.rules';
import { PaymentAlertsService } from './payment-alerts.service';

const NOW = new Date('2026-06-10T06:00:00.000Z');
const TODAY = businessToday(NOW);

/** Invoice rows shaped like the Prisma select in PaymentAlertsService.openAlerts. */
function invoice(id: string, overrides: Partial<{ dueOffset: number | null; grandTotal: string; received: string; state: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' }>) {
  const { dueOffset = -2, grandTotal = '100.00', received = '60.00', state = 'PARTIALLY_PAID' } = overrides;
  return {
    id,
    invoiceNumber: `KI/INV/${id}`,
    dueDate: dueOffset === null ? null : addDays(TODAY, dueOffset),
    grandTotal: new Prisma.Decimal(grandTotal),
    amountReceived: new Prisma.Decimal(received),
    paymentState: state,
    customer: { id: `c-${id}`, name: `Customer ${id}` },
  };
}

function build(rows: unknown[], createManyCounts: number[]) {
  const createMany = jest.fn();
  for (const count of createManyCounts) createMany.mockResolvedValueOnce({ count });
  const prisma = {
    finalInvoice: { findMany: jest.fn().mockResolvedValue(rows) },
    paymentReminder: { createMany },
  };
  return { service: new PaymentAlertsService(prisma as never), prisma, createMany };
}

describe('PaymentAlertsService', () => {
  it('lists the overdue balance of a partly paid invoice, with its remaining amount', async () => {
    const { service } = build([invoice('A', { dueOffset: -2, grandTotal: '100.00', received: '60.00' })], []);
    const { alerts, summary } = await service.openAlerts(NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      finalInvoiceId: 'A',
      customerName: 'Customer A',
      outstanding: '40.00',
      amountReceived: '60.00',
      grandTotal: '100.00',
      daysRemaining: -2,
      stage: 'OVERDUE',
    });
    expect(summary).toEqual({ overdue: 1, dueToday: 0, dueSoon: 0, totalOutstanding: '40.00' });
  });

  it('drops an invoice once its balance is cleared, even if the row was still returned', async () => {
    const { service } = build([invoice('B', { dueOffset: -5, grandTotal: '100.00', received: '100.00', state: 'PAID' })], []);
    const { alerts } = await service.openAlerts(NOW);
    expect(alerts).toEqual([]);
  });

  it('reports due-soon and due-today invoices with the correct counts', async () => {
    const { service } = build(
      [invoice('C', { dueOffset: 0, received: '0', state: 'UNPAID' }), invoice('D', { dueOffset: 3, received: '0', state: 'UNPAID' })],
      [],
    );
    const { summary } = await service.openAlerts(NOW);
    expect(summary).toEqual({ overdue: 0, dueToday: 1, dueSoon: 1, totalOutstanding: '200.00' });
  });

  it('records each alert stage with skipDuplicates, so repeated sweeps add nothing new', async () => {
    const rows = [invoice('E', { dueOffset: -1 })];
    // First sweep writes one reminder; the second finds it already recorded.
    const { service, createMany } = build(rows, [1, 0]);

    const first = await service.sweep(NOW);
    const second = await service.sweep(NOW);

    expect(first).toEqual({ evaluated: 1, recorded: 1 });
    expect(second).toEqual({ evaluated: 1, recorded: 0 });
    for (const call of createMany.mock.calls) {
      expect(call[0].skipDuplicates).toBe(true);
    }
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      finalInvoiceId: 'E',
      stage: 'OVERDUE',
      daysRemaining: -1,
    });
  });

  it('writes nothing when no invoice has an open alert', async () => {
    const { service, createMany } = build([], []);
    expect(await service.sweep(NOW)).toEqual({ evaluated: 0, recorded: 0 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('a stage changed by a new due date is recorded as a new reminder, not a duplicate', async () => {
    const { service, createMany } = build([invoice('F', { dueOffset: 2 })], [1]);
    await service.sweep(NOW);
    expect(createMany.mock.calls[0][0].data[0].stage).toBe('DUE_SOON');
  });
});
