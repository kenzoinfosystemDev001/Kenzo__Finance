import { Prisma } from '@prisma/client';
import { resolvePeriod } from '../analytics/analytics-range';
import { escapeLike, isRankable, moneyString, rankingOrderBy } from '../customers/customer-rankings';
import { salesWhere, SalesService } from './sales.service';

const TODAY = new Date('2026-06-10T00:00:00.000Z');

describe('customer ranking rules', () => {
  it('orders by one of three fixed columns, with stable tie-breaks', () => {
    expect(rankingOrderBy('invoiced', 'desc')).toBe('invoiced DESC, name ASC, id ASC');
    expect(rankingOrderBy('purchases', 'asc')).toBe('units ASC, name ASC, id ASC');
    expect(rankingOrderBy('orders', 'desc')).toBe('orders DESC, name ASC, id ASC');
  });

  it('only customers with an issued invoice are ranked', () => {
    expect(isRankable(0)).toBe(false);
    expect(isRankable(1)).toBe(true);
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(escapeLike('100%_off\\x')).toBe('100\\%\\_off\\\\x');
  });

  it('formats money as fixed two-decimal text', () => {
    expect(moneyString(new Prisma.Decimal('1234.5'))).toBe('1234.50');
    expect(moneyString(null)).toBe('0.00');
  });
});

describe('sales scope', () => {
  const period = resolvePeriod('thisMonth', undefined, undefined, TODAY);

  it('counts only issued and sent invoices, never drafts, approvals or cancelled ones', () => {
    const sql = salesWhere({ period }).sql;
    expect(sql).toContain(`fi.status IN ('ISSUED', 'SENT')`);
  });

  it('bounds the invoice date by the period, inclusive', () => {
    const q = salesWhere({ period });
    expect(q.sql).toContain('fi."invoiceDate" <= ');
    expect(q.sql).toContain('fi."invoiceDate" >= ');
    expect(q.values).toContainEqual(period.to);
    expect(q.values).toContainEqual(period.from);
  });

  it('leaves the lower bound open for all-time periods', () => {
    const all = resolvePeriod('all', undefined, undefined, TODAY);
    expect(salesWhere({ period: all }).sql).not.toContain('fi."invoiceDate" >= ');
  });

  it('passes product and customer filters as parameters, not text', () => {
    const q = salesWhere({ period, productId: '11111111-1111-4111-8111-111111111111', search: "o'brien" });
    expect(q.sql).toContain('i."productId" = ');
    expect(q.sql).not.toContain('11111111');
    expect(q.values).toContain('11111111-1111-4111-8111-111111111111');
  });
});

describe('SalesService.comparison', () => {
  const current = resolvePeriod('thisMonth', undefined, undefined, TODAY);

  it('matches products across the two periods and reports the change in quantity', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'p1', name: 'P1', code: 'p1', currency: 'INR', units: 10n, value: new Prisma.Decimal('500'), orders: 2n },
        ])
        .mockResolvedValueOnce([
          { id: 'p1', name: 'P1', code: 'p1', currency: 'INR', units: 4n, value: new Prisma.Decimal('200'), orders: 1n },
          { id: 'p2', name: 'P2', code: 'p2', currency: 'INR', units: 3n, value: new Prisma.Decimal('90'), orders: 1n },
        ]),
    };
    const service = new SalesService(prisma as never);
    const result = await service.comparison(current, {});

    const p1 = result.rows.find((r) => r.productId === 'p1')!;
    expect(p1.quantityChange).toBe(6);
    expect(p1.previous?.quantity).toBe(4);
    // A product sold only last period shows as a fall to zero, not as missing.
    const p2 = result.rows.find((r) => r.productId === 'p2')!;
    expect(p2.current.quantity).toBe(0);
    expect(p2.quantityChange).toBe(-3);
    expect(result.previousPeriodLabel).toBeTruthy();
  });

  it('compares with nothing for an all-time period', async () => {
    const all = resolvePeriod('all', undefined, undefined, TODAY);
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'p1', name: 'P1', code: 'p1', currency: 'INR', units: 2n, value: new Prisma.Decimal('50'), orders: 1n }]) };
    const service = new SalesService(prisma as never);
    const result = await service.comparison(all, {});
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.previousPeriodLabel).toBeNull();
    expect(result.rows[0].previous).toBeNull();
    expect(result.rows[0].quantityChange).toBeNull();
    expect(result.rows[0].current.quantity).toBe(2);
  });
});
