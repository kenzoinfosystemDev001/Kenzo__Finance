import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { escapeLike, moneyString } from '../customers/customer-rankings';
import { previousPeriod, type Period } from '../analytics/analytics-range';

/**
 * Product sales analytics and history.
 *
 * Every figure comes from line items of ISSUED or SENT final invoices. A
 * cancelled invoice, and an invoice replaced by a revision, is no longer
 * ISSUED or SENT, so its lines drop out of every figure at once: a revision
 * is never counted next to the invoice it replaced. Quotations and proforma
 * invoices never contribute.
 */

export const SALES_VIEWS = ['latest', 'oldest', 'product', 'customer'] as const;
export type SalesView = (typeof SALES_VIEWS)[number];

export interface SalesScope {
  period: Period;
  productId?: string;
  customerId?: string;
  search?: string;
}

const MAX_EXPORT_ROWS = 5000;

const LINES = Prisma.sql`final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId" JOIN customers c ON c.id = fi."customerId"`;

/** One WHERE clause shared by every query, so the history, totals and exports always agree. */
export function salesWhere(scope: SalesScope): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`fi.status IN ('ISSUED', 'SENT')`,
    Prisma.sql`fi."invoiceDate" <= ${scope.period.to}`,
  ];
  if (scope.period.from) parts.push(Prisma.sql`fi."invoiceDate" >= ${scope.period.from}`);
  if (scope.productId) parts.push(Prisma.sql`i."productId" = ${scope.productId}::uuid`);
  if (scope.customerId) parts.push(Prisma.sql`fi."customerId" = ${scope.customerId}::uuid`);
  if (scope.search) {
    const like = `%${escapeLike(scope.search)}%`;
    parts.push(
      Prisma.sql`(i."productName" ILIKE ${like} OR COALESCE(i."modelName", '') ILIKE ${like} OR i."productCode" ILIKE ${like} OR c.name ILIKE ${like} OR COALESCE(fi."invoiceNumber", '') ILIKE ${like})`,
    );
  }
  return Prisma.join(parts, ' AND ');
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Line-level history, newest or oldest first. */
  async lines(scope: SalesScope, direction: 'asc' | 'desc', page: number, pageSize: number) {
    const dir = Prisma.raw(direction === 'asc' ? 'ASC' : 'DESC');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown> & { total: bigint }>>`
      SELECT i.id, i."productId", i."productName", i."modelName", i."productCode", i."brandName", i.unit,
             i.quantity, i."lineTotal", fi.id AS "finalInvoiceId", fi."invoiceNumber", fi."invoiceDate", fi.currency,
             c.id AS "customerId", c.name AS "customerName", c."customerCode", COUNT(*) OVER () AS total
      FROM ${LINES}
      WHERE ${salesWhere(scope)}
      ORDER BY fi."invoiceDate" ${dir}, fi."invoiceNumber" ${dir} NULLS LAST, i."sortOrder" ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return {
      total: rows.length ? Number(rows[0].total) : 0,
      items: rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName,
        modelName: r.modelName,
        productCode: r.productCode,
        brandName: r.brandName,
        unit: r.unit,
        customer: { id: r.customerId, name: r.customerName, customerCode: r.customerCode },
        finalInvoiceId: r.finalInvoiceId,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: new Date(r.invoiceDate as Date).toISOString().slice(0, 10),
        currency: r.currency,
        quantity: Number(r.quantity),
        saleAmount: moneyString(r.lineTotal as Prisma.Decimal),
      })),
    };
  }

  /** Product-wise or customer-wise totals for the scope, one row per currency. */
  async grouped(scope: SalesScope, by: 'product' | 'customer', page: number, pageSize: number) {
    const rows =
      by === 'product'
        ? await this.prisma.$queryRaw<Array<Record<string, unknown> & { total: bigint }>>`
            SELECT i."productId" AS id, MAX(i."productName") AS name, MAX(i."productCode") AS code, MAX(i."modelName") AS model,
                   fi.currency, SUM(i.quantity) AS units, SUM(i."lineTotal") AS value,
                   COUNT(DISTINCT fi.id) AS orders, COUNT(DISTINCT fi."customerId") AS customers, COUNT(*) OVER () AS total
            FROM ${LINES}
            WHERE ${salesWhere(scope)}
            GROUP BY i."productId", fi.currency
            ORDER BY value DESC, name ASC
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
        : await this.prisma.$queryRaw<Array<Record<string, unknown> & { total: bigint }>>`
            SELECT c.id AS id, MAX(c.name) AS name, MAX(c."customerCode") AS code, NULL::text AS model,
                   fi.currency, SUM(i.quantity) AS units, SUM(i."lineTotal") AS value,
                   COUNT(DISTINCT fi.id) AS orders, COUNT(DISTINCT i."productId") AS customers, COUNT(*) OVER () AS total
            FROM ${LINES}
            WHERE ${salesWhere(scope)}
            GROUP BY c.id, fi.currency
            ORDER BY value DESC, name ASC
            LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return {
      total: rows.length ? Number(rows[0].total) : 0,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        model: r.model ?? null,
        currency: r.currency,
        quantity: Number(r.units),
        saleAmount: moneyString(r.value as Prisma.Decimal),
        orders: Number(r.orders),
        // For product rows this is the number of customers; for customer rows, the number of distinct products.
        ...(by === 'product' ? { customers: Number(r.customers) } : { distinctProducts: Number(r.customers) }),
      })),
    };
  }

  /** Totals for the whole scope, one entry per currency. */
  async totals(scope: SalesScope) {
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; units: bigint; value: Prisma.Decimal; orders: bigint }>>`
      SELECT fi.currency, COALESCE(SUM(i.quantity), 0) AS units, COALESCE(SUM(i."lineTotal"), 0) AS value, COUNT(DISTINCT fi.id) AS orders
      FROM ${LINES}
      WHERE ${salesWhere(scope)}
      GROUP BY fi.currency
      ORDER BY fi.currency`;
    return rows.map((r) => ({
      currency: r.currency,
      quantity: Number(r.units),
      saleAmount: moneyString(r.value),
      orders: Number(r.orders),
    }));
  }

  /** Top products within a scope, ranked three ways: by quantity, by value, by number of orders. */
  async topSellers(scope: SalesScope, limit = 10) {
    const [byQuantity, byValue, byOrders] = await Promise.all([
      this.productRanking(scope, 'units', limit),
      this.productRanking(scope, 'value', limit),
      this.productRanking(scope, 'orders', limit),
    ]);
    return { byQuantity, byValue, byOrders };
  }

  private async productRanking(scope: SalesScope, column: 'units' | 'value' | 'orders', limit: number) {
    const order = Prisma.raw(column === 'units' ? 'units' : column === 'value' ? 'value' : 'orders');
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; code: string; currency: string; units: bigint; value: Prisma.Decimal; orders: bigint }>>`
      SELECT i."productId" AS id, MAX(i."productName") AS name, MAX(i."productCode") AS code, fi.currency,
             SUM(i.quantity) AS units, SUM(i."lineTotal") AS value, COUNT(DISTINCT fi.id) AS orders
      FROM ${LINES}
      WHERE ${salesWhere(scope)}
      GROUP BY i."productId", fi.currency
      ORDER BY ${order} DESC, name ASC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      productId: r.id,
      name: r.name,
      productCode: r.code,
      currency: r.currency,
      quantity: Number(r.units),
      saleAmount: moneyString(r.value),
      orders: Number(r.orders),
    }));
  }

  /** Sales per calendar month for the last `months` months ending at `to`, in the business time zone. */
  async monthly(to: Date, months: number, filters: { productId?: string; customerId?: string; search?: string }) {
    const start = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1));
    const scope: SalesScope = { period: { preset: 'custom', from: start, to, label: '' }, ...filters };
    const rows = await this.prisma.$queryRaw<Array<{ month: string; currency: string; units: bigint; value: Prisma.Decimal; orders: bigint }>>`
      SELECT to_char(fi."invoiceDate", 'YYYY-MM') AS month, fi.currency,
             COALESCE(SUM(i.quantity), 0) AS units, COALESCE(SUM(i."lineTotal"), 0) AS value, COUNT(DISTINCT fi.id) AS orders
      FROM ${LINES}
      WHERE ${salesWhere(scope)}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC`;
    return rows.map((r) => ({
      month: r.month,
      currency: r.currency,
      quantity: Number(r.units),
      saleAmount: moneyString(r.value),
      orders: Number(r.orders),
    }));
  }

  /**
   * Product-wise comparison of the period with the period before it. Rows are
   * matched by product and currency. Periods with no previous equivalent (for
   * example "all time") compare with nothing.
   */
  async comparison(period: Period, filters: { productId?: string; customerId?: string; search?: string }) {
    const previous = previousPeriod(period);
    const [current, earlier] = await Promise.all([
      this.productRanking({ period, ...filters }, 'value', 200),
      previous ? this.productRanking({ period: previous, ...filters }, 'value', 200) : Promise.resolve([]),
    ]);
    const key = (r: { productId: string; currency: string }) => `${r.productId}|${r.currency}`;
    const earlierByKey = new Map(earlier.map((r) => [key(r), r]));
    const seen = new Set<string>();
    const rows = current.map((r) => {
      seen.add(key(r));
      const before = earlierByKey.get(key(r));
      return {
        productId: r.productId,
        name: r.name,
        productCode: r.productCode,
        currency: r.currency,
        current: { quantity: r.quantity, saleAmount: r.saleAmount, orders: r.orders },
        previous: before ? { quantity: before.quantity, saleAmount: before.saleAmount, orders: before.orders } : null,
        quantityChange: before ? r.quantity - before.quantity : null,
      };
    });
    for (const r of earlier) {
      if (seen.has(key(r))) continue;
      rows.push({
        productId: r.productId,
        name: r.name,
        productCode: r.productCode,
        currency: r.currency,
        current: { quantity: 0, saleAmount: '0.00', orders: 0 },
        previous: { quantity: r.quantity, saleAmount: r.saleAmount, orders: r.orders },
        quantityChange: -r.quantity,
      });
    }
    return { previousPeriodLabel: previous?.label ?? null, rows };
  }

  /** Export rows: line history up to a fixed cap, so a very large export cannot exhaust memory. */
  async exportLines(scope: SalesScope) {
    const { items, total } = await this.lines(scope, 'desc', 1, MAX_EXPORT_ROWS);
    return { items, total, truncated: total > MAX_EXPORT_ROWS };
  }
}
