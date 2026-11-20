import { Injectable } from '@nestjs/common';
import { EnquiryStatus, FinalInvoiceStatus, InvoicePaymentState, PaymentStatus, Prisma, ProformaStatus, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { businessToday } from '../common/utils/business-date';
import { endExclusive, previousPeriod, type Period } from './analytics-range';

const D = Prisma.Decimal;
const ZERO = new D(0);
const ISSUED_FI: FinalInvoiceStatus[] = [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT];
const ISSUED_PI: ProformaStatus[] = [ProformaStatus.ISSUED, ProformaStatus.SENT];
const money = (v: Prisma.Decimal | number | string | null | undefined) => new D(v ?? 0).toFixed(2);
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
/** Percentage with one decimal, or null when the denominator is zero (never a fake 0%). */
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

type Money = { currency: string; total: string; count: number };
export interface Filters {
  period: Period;
  customerId?: string;
  productId?: string;
  assignedToId?: string;
}

/**
 * Module 10 - Reports & Analytics. Read-only aggregation over the business
 * tables (no reporting copy). Every figure states its source and date basis
 * in `definitions`; money is always grouped per currency, never summed across
 * currencies; quotation, PI, invoice and collected values are separate
 * figures and never added together.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // SQL building blocks
  // -------------------------------------------------------------------------

  /** `col BETWEEN from AND to` for a date column (inclusive), or TRUE for "all". */
  private dateIn(column: Prisma.Sql, f: Filters) {
    return f.period.from ? Prisma.sql`${column} >= ${f.period.from}::date AND ${column} <= ${f.period.to}::date` : Prisma.sql`${column} <= ${f.period.to}::date`;
  }

  /** Same for timestamp columns. */
  private timeIn(column: Prisma.Sql, f: Filters) {
    return f.period.from ? Prisma.sql`${column} >= ${f.period.from} AND ${column} < ${endExclusive(f.period)}` : Prisma.sql`${column} < ${endExclusive(f.period)}`;
  }

  private customer(column: Prisma.Sql, f: Filters) {
    return f.customerId ? Prisma.sql`${column} = ${f.customerId}::uuid` : Prisma.sql`TRUE`;
  }

  private dateFilter(f: Filters) {
    return f.period.from ? { gte: f.period.from, lte: f.period.to } : { lte: f.period.to };
  }

  private timeFilter(f: Filters) {
    return f.period.from ? { gte: f.period.from, lt: endExclusive(f.period) } : { lt: endExclusive(f.period) };
  }

  private perCurrency(rows: Array<{ currency: string; total: Prisma.Decimal | null; count: bigint | number }>): Money[] {
    return rows.map((r) => ({ currency: r.currency, total: money(r.total), count: n(r.count) }));
  }

  /** Outstanding receivables as of the end of `asOf` (issued invoices minus payments verified by then and not reversed by then). */
  private async outstandingAsOf(asOf: Date, customerId?: string) {
    const end = new Date(asOf.getTime() + 86_400_000);
    const cust = customerId ? Prisma.sql`AND fi."customerId" = ${customerId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; invoiced: Prisma.Decimal | null; received: Prisma.Decimal | null }>>`
      SELECT fi.currency,
             SUM(fi."grandTotal") AS invoiced,
             SUM(COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a."paymentId"
                           WHERE a."finalInvoiceId" = fi.id AND p."verifiedAt" < ${end}
                             AND (p."reversedAt" IS NULL OR p."reversedAt" >= ${end})), 0)) AS received
      FROM final_invoices fi
      WHERE fi."issuedAt" < ${end} AND (fi."cancelledAt" IS NULL OR fi."cancelledAt" >= ${end}) ${cust}
      GROUP BY fi.currency`;
    return rows.map((r) => ({ currency: r.currency, total: D.max(new D(r.invoiced ?? 0).minus(new D(r.received ?? 0)), ZERO).toFixed(2) }));
  }

  // -------------------------------------------------------------------------
  // Executive overview
  // -------------------------------------------------------------------------

  async overview(f: Filters, financial: boolean) {
    const period = f.period;
    const cust = f.customerId ? { customerId: f.customerId } : {};
    const [vendors, products, customers, enquiries, quotations, pis, invoices, deliveries, deliveredCount] = await Promise.all([
      this.prisma.vendor.count({ where: { archivedAt: null } }),
      this.prisma.product.count({ where: { archivedAt: null } }),
      this.prisma.customer.count(f.customerId ? { where: { id: f.customerId } } : undefined),
      this.prisma.enquiry.count({ where: { ...cust, enquiryDate: this.dateFilter(f) } }),
      this.prisma.quotation.count({ where: { ...cust, createdAt: this.timeFilter(f) } }),
      this.prisma.proformaInvoice.count({ where: { ...cust, piDate: this.dateFilter(f) } }),
      this.prisma.finalInvoice.count({ where: { ...cust, status: { in: ISSUED_FI }, invoiceDate: this.dateFilter(f) } }),
      this.prisma.delivery.count({ where: { ...cust, deliveryDate: this.dateFilter(f) } }),
      this.prisma.delivery.count({ where: { ...cust, deliveryDate: this.dateFilter(f), status: 'DELIVERED' } }),
    ]);
    const counts = { vendors, products, customers, enquiries, quotations, proformaInvoices: pis, finalInvoices: invoices, deliveries, completedDeliveries: deliveredCount };
    if (!financial) return { period: period.label, counts, financial: null, definitions: OVERVIEW_DEFINITIONS };

    const [quoteValue, piValue, invoiceValue, collected, outstanding, deliveredQty] = await Promise.all([
      // The latest revision's total of each quotation (currentTotal): revisions are never double counted.
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint }>>`
        SELECT currency, SUM("currentTotal") AS total, COUNT(*) AS count FROM quotations q
        WHERE ${this.timeIn(Prisma.sql`q."createdAt"`, f)} AND q.status <> 'CANCELLED' AND ${this.customer(Prisma.sql`q."customerId"`, f)} GROUP BY currency`,
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint }>>`
        SELECT currency, SUM("grandTotal") AS total, COUNT(*) AS count FROM proforma_invoices pi
        WHERE pi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`pi."piDate"`, f)} AND ${this.customer(Prisma.sql`pi."customerId"`, f)} GROUP BY currency`,
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint }>>`
        SELECT currency, SUM("grandTotal") AS total, COUNT(*) AS count FROM final_invoices fi
        WHERE fi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} AND ${this.customer(Prisma.sql`fi."customerId"`, f)} GROUP BY currency`,
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint }>>`
        SELECT currency, SUM(amount) AS total, COUNT(*) AS count FROM payments p
        WHERE p.status = 'VERIFIED' AND ${this.dateIn(Prisma.sql`p."paymentDate"`, f)} AND ${this.customer(Prisma.sql`p."customerId"`, f)} GROUP BY currency`,
      this.outstandingAsOf(period.to, f.customerId),
      this.deliveredQuantities(f),
    ]);
    return {
      period: period.label,
      counts,
      financial: {
        quotationValue: this.perCurrency(quoteValue),
        proformaValue: this.perCurrency(piValue),
        invoicedValue: this.perCurrency(invoiceValue),
        verifiedPayments: this.perCurrency(collected),
        outstandingReceivables: outstanding,
        delivery: deliveredQty,
      },
      definitions: OVERVIEW_DEFINITIONS,
    };
  }

  /** Invoiced vs dispatched vs confirmed-delivered quantities for invoices dated in the period. */
  private async deliveredQuantities(f: Filters) {
    const [row] = await this.prisma.$queryRaw<Array<{ invoiced: bigint | null; dispatched: bigint | null; delivered: bigint | null }>>`
      SELECT
        (SELECT COALESCE(SUM(i.quantity), 0) FROM final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId"
          WHERE fi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} AND ${this.customer(Prisma.sql`fi."customerId"`, f)}) AS invoiced,
        (SELECT COALESCE(SUM(di.quantity), 0) FROM delivery_items di JOIN deliveries d ON d.id = di."deliveryId" JOIN final_invoices fi ON fi.id = d."finalInvoiceId"
          WHERE d.status IN ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED') AND fi.status IN ('ISSUED', 'SENT')
            AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} AND ${this.customer(Prisma.sql`fi."customerId"`, f)}) AS dispatched,
        (SELECT COALESCE(SUM(di.quantity), 0) FROM delivery_items di JOIN deliveries d ON d.id = di."deliveryId" JOIN final_invoices fi ON fi.id = d."finalInvoiceId"
          WHERE d.status = 'DELIVERED' AND fi.status IN ('ISSUED', 'SENT')
            AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} AND ${this.customer(Prisma.sql`fi."customerId"`, f)}) AS delivered`;
    const invoiced = n(row?.invoiced);
    const delivered = n(row?.delivered);
    return { invoicedQuantity: invoiced, dispatchedQuantity: n(row?.dispatched), deliveredQuantity: delivered, completionPercent: pct(delivered, invoiced) };
  }

  // -------------------------------------------------------------------------
  // Sales (final invoices)
  // -------------------------------------------------------------------------

  async sales(f: Filters) {
    const where = Prisma.sql`fi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} AND ${this.customer(Prisma.sql`fi."customerId"`, f)}`;
    const product = f.productId ? Prisma.sql`AND i."productId" = ${f.productId}::uuid` : Prisma.empty;
    type Trend = { bucket: string; currency: string; count: bigint; total: Prisma.Decimal };
    const trend = (format: string) =>
      this.prisma.$queryRaw<Trend[]>`SELECT to_char(fi."invoiceDate", ${format}) AS bucket, fi.currency, COUNT(*) AS count, SUM(fi."grandTotal") AS total FROM final_invoices fi WHERE ${where} GROUP BY 1, 2 ORDER BY 1`;
    const [totals, monthly, quarterly, yearly, byCustomer, byProduct, byModel, statuses] = await Promise.all([
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint; average: Prisma.Decimal }>>`
        SELECT fi.currency, SUM(fi."grandTotal") AS total, COUNT(*) AS count, AVG(fi."grandTotal") AS average FROM final_invoices fi WHERE ${where} GROUP BY 1`,
      trend('YYYY-MM'),
      trend('YYYY-"Q"Q'),
      trend('YYYY'),
      this.prisma.$queryRaw<Array<{ id: string; name: string; customerCode: string; currency: string; count: bigint; total: Prisma.Decimal }>>`
        SELECT c.id, c.name, c."customerCode", fi.currency, COUNT(*) AS count, SUM(fi."grandTotal") AS total
        FROM final_invoices fi JOIN customers c ON c.id = fi."customerId" WHERE ${where} GROUP BY 1, 2, 3, 4 ORDER BY total DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; productCode: string; currency: string; quantity: bigint; total: Prisma.Decimal }>>`
        SELECT i."productId" AS id, MAX(i."productName") AS name, MAX(i."productCode") AS "productCode", fi.currency, SUM(i.quantity) AS quantity, SUM(i."lineTotal") AS total
        FROM final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId" WHERE ${where} ${product} GROUP BY 1, 4 ORDER BY total DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string | null; productName: string; modelName: string | null; currency: string; quantity: bigint; total: Prisma.Decimal }>>`
        SELECT i."productModelId" AS id, MAX(i."productName") AS "productName", MAX(i."modelName") AS "modelName", fi.currency, SUM(i.quantity) AS quantity, SUM(i."lineTotal") AS total
        FROM final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId" WHERE ${where} ${product} AND i."productModelId" IS NOT NULL GROUP BY 1, 4 ORDER BY total DESC LIMIT 25`,
      this.prisma.finalInvoice.groupBy({ by: ['status'], where: { invoiceDate: this.dateFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}) }, _count: { _all: true } }),
    ]);
    const t = (r: Trend) => ({ bucket: r.bucket, currency: r.currency, count: n(r.count), total: money(r.total) });
    return {
      period: f.period.label,
      totals: totals.map((r) => ({ currency: r.currency, total: money(r.total), count: n(r.count), average: money(r.average) })),
      monthly: monthly.map(t),
      quarterly: quarterly.map(t),
      yearly: yearly.map(t),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.id, name: r.name, customerCode: r.customerCode }, currency: r.currency, count: n(r.count), total: money(r.total) })),
      byProduct: byProduct.map((r) => ({ product: { id: r.id, name: r.name, productCode: r.productCode }, currency: r.currency, quantity: n(r.quantity), total: money(r.total) })),
      byModel: byModel.map((r) => ({ model: { id: r.id, productName: r.productName, modelName: r.modelName }, currency: r.currency, quantity: n(r.quantity), total: money(r.total) })),
      statusDistribution: statuses.map((s) => ({ status: s.status, count: s._count._all })),
      definitions: {
        sales: 'Final invoices in status Issued or Sent, by invoice date. Drafts, invoices awaiting approval and cancelled invoices are excluded. Quotations and proforma invoices are never counted as sales.',
        productValue: 'Sum of invoice line totals (after line discount, including line tax). Header-level other charges and additional discount are not allocated to products.',
        statusDistribution: 'All final invoices dated in the period, by current status.',
        margin: 'Profit and margin are not shown: no cost data exists in the application.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------

  async customers(f: Filters, financial: boolean) {
    const inPeriodDate = (col: string) => this.dateIn(Prisma.raw(col), f);
    const [[counts], topInvoiced, topPaid, topOutstanding, mostEnquiries, mostQuotations, deliveries, monthlyNew] = await Promise.all([
      this.prisma.$queryRaw<Array<Record<string, bigint>>>`
        SELECT
          (SELECT COUNT(*) FROM customers) AS total,
          (SELECT COUNT(*) FROM customers WHERE status = 'ACTIVE') AS "statusActive",
          (SELECT COUNT(*) FROM customers c WHERE ${this.timeIn(Prisma.sql`c."createdAt"`, f)}) AS "newCustomers",
          (SELECT COUNT(DISTINCT e."customerId") FROM enquiries e WHERE ${inPeriodDate('e."enquiryDate"')}) AS "withEnquiries",
          (SELECT COUNT(DISTINCT q."customerId") FROM quotations q WHERE ${this.timeIn(Prisma.sql`q."createdAt"`, f)}) AS "withQuotations",
          (SELECT COUNT(DISTINCT fi."customerId") FROM final_invoices fi WHERE fi.status IN ('ISSUED', 'SENT') AND ${inPeriodDate('fi."invoiceDate"')}) AS "withInvoices",
          (SELECT COUNT(DISTINCT fi."customerId") FROM final_invoices fi WHERE fi.status IN ('ISSUED', 'SENT') AND fi."paymentState" <> 'PAID') AS "withOutstanding",
          (SELECT COUNT(*) FROM customers c WHERE
              EXISTS (SELECT 1 FROM enquiries e WHERE e."customerId" = c.id AND ${inPeriodDate('e."enquiryDate"')})
           OR EXISTS (SELECT 1 FROM quotations q WHERE q."customerId" = c.id AND ${this.timeIn(Prisma.sql`q."createdAt"`, f)})
           OR EXISTS (SELECT 1 FROM final_invoices fi WHERE fi."customerId" = c.id AND fi.status IN ('ISSUED', 'SENT') AND ${inPeriodDate('fi."invoiceDate"')})
           OR EXISTS (SELECT 1 FROM payments p WHERE p."customerId" = c.id AND p.status = 'VERIFIED' AND ${inPeriodDate('p."paymentDate"')})) AS "activeInPeriod"`,
      financial ? this.topCustomers(Prisma.sql`SELECT fi."customerId" AS id, fi.currency, SUM(fi."grandTotal") AS total, COUNT(*) AS count FROM final_invoices fi WHERE fi.status IN ('ISSUED', 'SENT') AND ${inPeriodDate('fi."invoiceDate"')} GROUP BY 1, 2`) : [],
      financial ? this.topCustomers(Prisma.sql`SELECT p."customerId" AS id, p.currency, SUM(p.amount) AS total, COUNT(*) AS count FROM payments p WHERE p.status = 'VERIFIED' AND ${inPeriodDate('p."paymentDate"')} GROUP BY 1, 2`) : [],
      financial ? this.topCustomers(Prisma.sql`SELECT fi."customerId" AS id, fi.currency, SUM(fi."grandTotal" - fi."amountReceived") AS total, COUNT(*) AS count FROM final_invoices fi WHERE fi.status IN ('ISSUED', 'SENT') AND fi."paymentState" <> 'PAID' GROUP BY 1, 2`) : [],
      this.topCounts(Prisma.sql`SELECT e."customerId" AS id, COUNT(*) AS count FROM enquiries e WHERE ${inPeriodDate('e."enquiryDate"')} GROUP BY 1`),
      this.topCounts(Prisma.sql`SELECT q."customerId" AS id, COUNT(*) AS count FROM quotations q WHERE ${this.timeIn(Prisma.sql`q."createdAt"`, f)} GROUP BY 1`),
      this.topCounts(Prisma.sql`SELECT d."customerId" AS id, COUNT(*) AS count FROM deliveries d WHERE ${inPeriodDate('d."deliveryDate"')} GROUP BY 1`),
      this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
        SELECT to_char(c."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS bucket, COUNT(*) AS count FROM customers c WHERE ${this.timeIn(Prisma.sql`c."createdAt"`, f)} GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      period: f.period.label,
      counts: Object.fromEntries(Object.entries(counts ?? {}).map(([k, v]) => [k, n(v)])),
      topByInvoiceValue: topInvoiced,
      topByVerifiedPayments: topPaid,
      topByOutstanding: topOutstanding,
      mostEnquiries,
      mostQuotations,
      mostDeliveries: deliveries,
      newCustomersByMonth: monthlyNew.map((r) => ({ bucket: r.bucket, count: n(r.count) })),
      financial,
      definitions: {
        statusActive: 'Customers whose record status is Active (set in Customer Management).',
        activeInPeriod: 'Customers with at least one enquiry, quotation, issued invoice or verified payment in the period. This is an activity count, not a customer classification.',
        newCustomers: 'Customer records created in the period.',
        withOutstanding: 'Customers with at least one issued invoice that is not fully paid (current position, not period-bound).',
      },
    };
  }

  private async topCustomers(inner: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; customerCode: string; currency: string; total: Prisma.Decimal; count: bigint }>>`
      SELECT c.id, c.name, c."customerCode", t.currency, t.total, t.count FROM (${inner}) t JOIN customers c ON c.id = t.id ORDER BY t.total DESC LIMIT 10`;
    return rows.map((r) => ({ customer: { id: r.id, name: r.name, customerCode: r.customerCode }, currency: r.currency, total: money(r.total), count: n(r.count) }));
  }

  private async topCounts(inner: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; customerCode: string; count: bigint }>>`
      SELECT c.id, c.name, c."customerCode", t.count FROM (${inner}) t JOIN customers c ON c.id = t.id ORDER BY t.count DESC LIMIT 10`;
    return rows.map((r) => ({ customer: { id: r.id, name: r.name, customerCode: r.customerCode }, count: n(r.count) }));
  }

  // -------------------------------------------------------------------------
  // Vendors and products (catalogue / relationships only)
  // -------------------------------------------------------------------------

  async vendors(f: Filters) {
    const [byStatus, recent, byBrand, byProduct, byModel, total] = await Promise.all([
      this.prisma.vendor.groupBy({ by: ['status'], where: { archivedAt: null }, _count: { _all: true } }),
      this.prisma.vendor.findMany({ where: { archivedAt: null, createdAt: this.timeFilter(f) }, select: { id: true, vendorCode: true, businessName: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.$queryRaw<Array<{ id: string; name: string; count: bigint }>>`SELECT co.id, co.name, COUNT(DISTINCT vc."vendorId") AS count FROM vendor_companies vc JOIN companies co ON co.id = vc."companyId" GROUP BY 1, 2 ORDER BY count DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; count: bigint }>>`SELECT p.id, p.name, COUNT(DISTINCT vp."vendorId") AS count FROM vendor_products vp JOIN products p ON p.id = vp."productId" GROUP BY 1, 2 ORDER BY count DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; productName: string; count: bigint }>>`
        SELECT m.id, m."modelName" AS name, p.name AS "productName", COUNT(DISTINCT vp."vendorId") AS count
        FROM vendor_product_models vpm JOIN vendor_products vp ON vp.id = vpm."vendorProductId" JOIN product_models m ON m.id = vpm."productModelId" JOIN products p ON p.id = m."productId"
        GROUP BY 1, 2, 3 ORDER BY count DESC LIMIT 25`,
      this.prisma.vendor.count({ where: { archivedAt: null } }),
    ]);
    return {
      period: f.period.label,
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      recentlyAdded: recent,
      byBrand: byBrand.map((r) => ({ id: r.id, name: r.name, vendors: n(r.count) })),
      byProduct: byProduct.map((r) => ({ id: r.id, name: r.name, vendors: n(r.count) })),
      byModel: byModel.map((r) => ({ id: r.id, name: r.name, productName: r.productName, vendors: n(r.count) })),
      definitions: {
        scope: 'Vendor master and vendor-brand/product/model relationships only. There are no purchase, procurement or vendor-spend records in the application, so none are reported.',
        recentlyAdded: 'Vendors created in the period (latest 20).',
      },
    };
  }

  async products(f: Filters) {
    const product = f.productId ? Prisma.sql`AND i."productId" = ${f.productId}::uuid` : Prisma.empty;
    const [totals, byCategory, modelsByProduct, availability, quoted, invoiced] = await Promise.all([
      Promise.all([this.prisma.product.count({ where: { archivedAt: null } }), this.prisma.company.count({ where: { archivedAt: null } }), this.prisma.productModel.count()]),
      this.prisma.$queryRaw<Array<{ id: string | null; name: string | null; count: bigint }>>`SELECT pc.id, pc.name, COUNT(*) AS count FROM products p LEFT JOIN product_categories pc ON pc.id = p."categoryId" WHERE p."archivedAt" IS NULL GROUP BY 1, 2 ORDER BY count DESC`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; count: bigint }>>`SELECT p.id, p.name, COUNT(m.id) AS count FROM products p LEFT JOIN product_models m ON m."productId" = p.id WHERE p."archivedAt" IS NULL GROUP BY 1, 2 ORDER BY count DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; count: bigint }>>`SELECT p.id, p.name, COUNT(DISTINCT vp."vendorId") AS count FROM products p LEFT JOIN vendor_products vp ON vp."productId" = p.id WHERE p."archivedAt" IS NULL GROUP BY 1, 2 ORDER BY count ASC, p.name LIMIT 50`,
      // Counted once per quotation, from its CURRENT revision (revisions are not separate quotations).
      this.prisma.$queryRaw<Array<{ id: string; name: string; quotations: bigint; quantity: bigint }>>`
        SELECT i."productId" AS id, MAX(i."productName") AS name, COUNT(DISTINCT q.id) AS quotations, SUM(i.quantity) AS quantity
        FROM quotations q JOIN quotation_revisions r ON r."quotationId" = q.id AND r."revisionNumber" = q."currentRevisionNumber"
        JOIN quotation_items i ON i."revisionId" = r.id
        WHERE ${this.timeIn(Prisma.sql`q."createdAt"`, f)} ${product} GROUP BY 1 ORDER BY quotations DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; invoices: bigint; quantity: bigint; currency: string; total: Prisma.Decimal }>>`
        SELECT i."productId" AS id, MAX(i."productName") AS name, COUNT(DISTINCT fi.id) AS invoices, SUM(i.quantity) AS quantity, fi.currency, SUM(i."lineTotal") AS total
        FROM final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId"
        WHERE fi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, f)} ${product} GROUP BY 1, 5 ORDER BY invoices DESC LIMIT 25`,
    ]);
    return {
      period: f.period.label,
      totals: { products: totals[0], brands: totals[1], models: totals[2] },
      byCategory: byCategory.map((r) => ({ id: r.id, name: r.name ?? 'Uncategorised', count: n(r.count) })),
      modelsByProduct: modelsByProduct.map((r) => ({ id: r.id, name: r.name, models: n(r.count) })),
      vendorAvailability: availability.map((r) => ({ id: r.id, name: r.name, vendors: n(r.count) })),
      mostQuoted: quoted.map((r) => ({ id: r.id, name: r.name, quotations: n(r.quotations), quantity: n(r.quantity) })),
      mostInvoiced: invoiced.map((r) => ({ id: r.id, name: r.name, invoices: n(r.invoices), quantity: n(r.quantity), currency: r.currency, total: money(r.total) })),
      definitions: {
        scope: 'Product Management is a catalogue: no stock, warehouse or procurement figures are reported.',
        mostQuoted: 'Quotations created in the period whose current revision includes the product (each quotation counted once). Being quoted is not a sale.',
        mostInvoiced: 'Issued/sent final invoices dated in the period that include the product; value = sum of line totals.',
        vendorAvailability: 'Number of vendors mapped to each product (fewest first).',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Enquiries
  // -------------------------------------------------------------------------

  async enquiries(f: Filters) {
    const where: Prisma.EnquiryWhereInput = { enquiryDate: this.dateFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}), ...(f.assignedToId ? { assignedToId: f.assignedToId } : {}) };
    const cond = Prisma.sql`${this.dateIn(Prisma.sql`e."enquiryDate"`, f)} AND ${this.customer(Prisma.sql`e."customerId"`, f)} ${f.assignedToId ? Prisma.sql`AND e."assignedToId" = ${f.assignedToId}::uuid` : Prisma.empty}`;
    const [byStatus, byPriority, bySource, employees, [followUp], monthly] = await Promise.all([
      this.prisma.enquiry.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.enquiry.groupBy({ by: ['priority'], where, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ id: string | null; name: string | null; count: bigint }>>`SELECT s.id, s.name, COUNT(*) AS count FROM enquiries e LEFT JOIN enquiry_sources s ON s.id = e."sourceId" WHERE ${cond} GROUP BY 1, 2 ORDER BY count DESC`,
      this.prisma.$queryRaw<Array<{ id: string | null; name: string | null; assigned: bigint; followedUp: bigint; converted: bigint; pending: bigint; lost: bigint }>>`
        SELECT u.id, u."fullName" AS name, COUNT(*) AS assigned,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM enquiry_follow_ups fu WHERE fu."enquiryId" = e.id)) AS "followedUp",
               COUNT(*) FILTER (WHERE e.status = 'CONVERTED') AS converted,
               COUNT(*) FILTER (WHERE e.status NOT IN ('CONVERTED', 'LOST', 'CLOSED')) AS pending,
               COUNT(*) FILTER (WHERE e.status = 'LOST') AS lost
        FROM enquiries e LEFT JOIN users u ON u.id = e."assignedToId" WHERE ${cond} GROUP BY 1, 2 ORDER BY assigned DESC`,
      this.prisma.$queryRaw<Array<{ total: bigint; withFollowUp: bigint }>>`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM enquiry_follow_ups fu WHERE fu."enquiryId" = e.id)) AS "withFollowUp" FROM enquiries e WHERE ${cond}`,
      this.prisma.$queryRaw<Array<{ bucket: string; total: bigint; converted: bigint }>>`
        SELECT to_char(e."enquiryDate", 'YYYY-MM') AS bucket, COUNT(*) AS total, COUNT(*) FILTER (WHERE e.status = 'CONVERTED') AS converted FROM enquiries e WHERE ${cond} GROUP BY 1 ORDER BY 1`,
    ]);
    const count = (s: EnquiryStatus) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const total = byStatus.reduce((sum, x) => sum + x._count._all, 0);
    return {
      period: f.period.label,
      total,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      byPriority: byPriority.map((s) => ({ priority: s.priority, count: s._count._all })),
      bySource: bySource.map((r) => ({ id: r.id, name: r.name ?? 'No source', count: n(r.count) })),
      employees: employees.map((r) => ({ id: r.id, name: r.name ?? 'Unassigned', assigned: n(r.assigned), followedUp: n(r.followedUp), converted: n(r.converted), pending: n(r.pending), lost: n(r.lost) })),
      monthly: monthly.map((r) => ({ bucket: r.bucket, total: n(r.total), converted: n(r.converted) })),
      rates: {
        conversionRate: pct(count(EnquiryStatus.CONVERTED), total),
        lostRate: pct(count(EnquiryStatus.LOST), total),
        followUpCompletion: pct(n(followUp?.withFollowUp), n(followUp?.total)),
      },
      definitions: {
        basis: 'Enquiries with an enquiry date in the period, by their current status.',
        conversionRate: 'Converted to a quotation ÷ all enquiries dated in the period (current status). Recent enquiries may still convert later.',
        lostRate: 'Lost ÷ all enquiries dated in the period.',
        followUpCompletion: 'Enquiries with at least one recorded follow-up ÷ all enquiries dated in the period.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Quotations
  // -------------------------------------------------------------------------

  async quotations(f: Filters, financial: boolean) {
    const where: Prisma.QuotationWhereInput = { createdAt: this.timeFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}) };
    const cond = Prisma.sql`${this.timeIn(Prisma.sql`q."createdAt"`, f)} AND ${this.customer(Prisma.sql`q."customerId"`, f)}`;
    const [byStatus, revised, monthly, byCustomer] = await Promise.all([
      this.prisma.quotation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.quotation.count({ where: { ...where, currentRevisionNumber: { gt: 1 } } }),
      this.prisma.$queryRaw<Array<{ bucket: string; currency: string; count: bigint; total: Prisma.Decimal; accepted: bigint; rejected: bigint }>>`
        SELECT to_char(q."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS bucket, q.currency, COUNT(*) AS count, SUM(q."currentTotal") AS total,
               COUNT(*) FILTER (WHERE q.status = 'ACCEPTED') AS accepted, COUNT(*) FILTER (WHERE q.status = 'REJECTED') AS rejected
        FROM quotations q WHERE ${cond} GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; customerCode: string; currency: string; count: bigint; total: Prisma.Decimal; accepted: bigint }>>`
        SELECT c.id, c.name, c."customerCode", q.currency, COUNT(*) AS count, SUM(q."currentTotal") AS total, COUNT(*) FILTER (WHERE q.status = 'ACCEPTED') AS accepted
        FROM quotations q JOIN customers c ON c.id = q."customerId" WHERE ${cond} GROUP BY 1, 2, 3, 4 ORDER BY count DESC LIMIT 25`,
    ]);
    const count = (s: QuotationStatus) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const total = byStatus.reduce((sum, x) => sum + x._count._all, 0);
    const decided = count(QuotationStatus.ACCEPTED) + count(QuotationStatus.REJECTED) + count(QuotationStatus.EXPIRED);
    return {
      period: f.period.label,
      total,
      revised,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      monthly: monthly.map((r) => ({ bucket: r.bucket, currency: r.currency, count: n(r.count), total: financial ? money(r.total) : null, accepted: n(r.accepted), rejected: n(r.rejected) })),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.id, name: r.name, customerCode: r.customerCode }, currency: r.currency, count: n(r.count), total: financial ? money(r.total) : null, accepted: n(r.accepted) })),
      rates: { acceptanceRate: pct(count(QuotationStatus.ACCEPTED), decided), acceptedOfAll: pct(count(QuotationStatus.ACCEPTED), total) },
      definitions: {
        basis: 'Quotations created in the period, each counted once by its current status. Revisions are not separate quotations; value = the current (latest) revision total.',
        revised: 'Quotations that have more than one revision.',
        acceptanceRate: 'Accepted ÷ (accepted + rejected + expired): quotations with a customer outcome.',
        acceptedOfAll: 'Accepted ÷ all quotations created in the period (open ones may still be decided).',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Proforma invoices
  // -------------------------------------------------------------------------

  async proforma(f: Filters, financial: boolean) {
    const where: Prisma.ProformaInvoiceWhereInput = { piDate: this.dateFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}) };
    const cond = Prisma.sql`${this.dateIn(Prisma.sql`pi."piDate"`, f)} AND ${this.customer(Prisma.sql`pi."customerId"`, f)}`;
    const [byStatus, value, monthly, byCustomer, converted] = await Promise.all([
      this.prisma.proformaInvoice.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal; count: bigint }>>`SELECT pi.currency, SUM(pi."grandTotal") AS total, COUNT(*) AS count FROM proforma_invoices pi WHERE ${cond} AND pi.status IN ('ISSUED', 'SENT') GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: string; currency: string; count: bigint; total: Prisma.Decimal }>>`SELECT to_char(pi."piDate", 'YYYY-MM') AS bucket, pi.currency, COUNT(*) AS count, SUM(pi."grandTotal") AS total FROM proforma_invoices pi WHERE ${cond} AND pi.status IN ('ISSUED', 'SENT') GROUP BY 1, 2 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; customerCode: string; currency: string; count: bigint; total: Prisma.Decimal }>>`
        SELECT c.id, c.name, c."customerCode", pi.currency, COUNT(*) AS count, SUM(pi."grandTotal") AS total FROM proforma_invoices pi JOIN customers c ON c.id = pi."customerId" WHERE ${cond} AND pi.status IN ('ISSUED', 'SENT') GROUP BY 1, 2, 3, 4 ORDER BY total DESC LIMIT 25`,
      this.prisma.proformaInvoice.count({ where: { ...where, status: { in: ISSUED_PI }, finalInvoices: { some: { status: { in: ISSUED_FI } } } } }),
    ]);
    const issued = byStatus.filter((s) => ISSUED_PI.includes(s.status)).reduce((sum, s) => sum + s._count._all, 0);
    return {
      period: f.period.label,
      total: byStatus.reduce((sum, x) => sum + x._count._all, 0),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      value: financial ? this.perCurrency(value) : null,
      monthly: monthly.map((r) => ({ bucket: r.bucket, currency: r.currency, count: n(r.count), total: financial ? money(r.total) : null })),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.id, name: r.name, customerCode: r.customerCode }, currency: r.currency, count: n(r.count), total: financial ? money(r.total) : null })),
      conversion: { issued, invoiced: converted, rate: pct(converted, issued) },
      definitions: {
        basis: 'Proforma invoices dated in the period; value counts only Issued/Sent PIs. PI value is not revenue and is never added to invoice value.',
        conversion: 'Issued/sent PIs dated in the period that have an issued final invoice ÷ issued/sent PIs dated in the period.',
        expired: 'Proforma invoices have no Expired status in this application.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Final invoices (incl. ageing)
  // -------------------------------------------------------------------------

  async invoices(f: Filters, buckets: number[] = [30, 60, 90]) {
    const where: Prisma.FinalInvoiceWhereInput = { invoiceDate: this.dateFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}) };
    const [byStatus, byPayment, sales, ageingRows] = await Promise.all([
      this.prisma.finalInvoice.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.finalInvoice.groupBy({ by: ['paymentState'], where: { ...where, status: { in: ISSUED_FI } }, _count: { _all: true } }),
      this.sales(f),
      this.prisma.finalInvoice.findMany({
        where: { status: { in: ISSUED_FI }, paymentState: { not: InvoicePaymentState.PAID }, ...(f.customerId ? { customerId: f.customerId } : {}) },
        select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true, grandTotal: true, amountReceived: true, customer: { select: { id: true, name: true } } },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
      }),
    ]);
    const today = businessToday();
    const edges = [...new Set(buckets)].filter((b) => b > 0).sort((a, b) => a - b);
    const labels = ['Not yet due', ...edges.map((e, i) => `${i === 0 ? 1 : edges[i - 1] + 1}–${e} days`), `Above ${edges[edges.length - 1] ?? 0} days`, 'No due date'];
    const ageing = new Map<string, Map<string, { count: number; total: Prisma.Decimal }>>();
    const rows = ageingRows.map((inv) => {
      const outstanding = D.max(inv.grandTotal.minus(inv.amountReceived), ZERO);
      let bucket: string;
      if (!inv.dueDate) bucket = 'No due date';
      else {
        const daysOverdue = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86_400_000);
        if (daysOverdue <= 0) bucket = 'Not yet due';
        else {
          const idx = edges.findIndex((e) => daysOverdue <= e);
          bucket = idx === -1 ? labels[edges.length + 1] : labels[idx + 1];
        }
      }
      const perCurrency = ageing.get(bucket) ?? new Map();
      const cell = perCurrency.get(inv.currency) ?? { count: 0, total: ZERO };
      perCurrency.set(inv.currency, { count: cell.count + 1, total: cell.total.plus(outstanding) });
      ageing.set(bucket, perCurrency);
      return { ...inv, outstanding: outstanding.toFixed(2), bucket };
    });
    const payCount = (s: InvoicePaymentState) => byPayment.find((x) => x.paymentState === s)?._count._all ?? 0;
    return {
      period: f.period.label,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      paymentPosition: { unpaid: payCount(InvoicePaymentState.UNPAID), partiallyPaid: payCount(InvoicePaymentState.PARTIALLY_PAID), fullyPaid: payCount(InvoicePaymentState.PAID) },
      totals: sales.totals,
      monthly: sales.monthly,
      byCustomer: sales.byCustomer,
      byProduct: sales.byProduct,
      overdueCount: rows.filter((r) => r.bucket !== 'Not yet due' && r.bucket !== 'No due date').length,
      ageing: labels.map((label) => ({ bucket: label, perCurrency: [...(ageing.get(label)?.entries() ?? [])].map(([currency, v]) => ({ currency, count: v.count, total: v.total.toFixed(2) })) })),
      outstandingInvoices: rows,
      definitions: {
        basis: 'Status and payment counts: final invoices dated in the period. Ageing and outstanding: every issued invoice not fully paid, as of today (not period-bound).',
        ageing: `Days past the invoice due date, on the outstanding balance (total − verified payments). Fully paid invoices are excluded; invoices without a due date are listed separately (no due date is ever assumed). Buckets: ${labels.join(', ')}.`,
        cancelled: 'Cancelled invoices are shown in the status distribution only and never in values or ageing.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  async payments(f: Filters) {
    const cond = Prisma.sql`${this.dateIn(Prisma.sql`p."paymentDate"`, f)} AND ${this.customer(Prisma.sql`p."customerId"`, f)}`;
    const verified = Prisma.sql`p.status = 'VERIFIED' AND ${cond}`;
    type Row = { bucket: string; currency: string; count: bigint; total: Prisma.Decimal };
    const trend = (format: string) => this.prisma.$queryRaw<Row[]>`SELECT to_char(p."paymentDate", ${format}) AS bucket, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${verified} GROUP BY 1, 2 ORDER BY 1`;
    const today = businessToday();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const [byStatus, daily, monthly, yearly, byCustomer, byMethod, byInvoice, todayRows, monthRows, outstanding] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: PaymentStatus; currency: string; count: bigint; total: Prisma.Decimal }>>`SELECT p.status, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${cond} GROUP BY 1, 2`,
      trend('YYYY-MM-DD'),
      trend('YYYY-MM'),
      trend('YYYY'),
      this.prisma.$queryRaw<Array<Row & { name: string; customerCode: string }>>`SELECT c.id AS bucket, c.name, c."customerCode", p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p JOIN customers c ON c.id = p."customerId" WHERE ${verified} GROUP BY 1, 2, 3, 4 ORDER BY total DESC LIMIT 25`,
      this.prisma.$queryRaw<Row[]>`SELECT p.method AS bucket, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${verified} GROUP BY 1, 2 ORDER BY total DESC`,
      this.prisma.$queryRaw<Array<Row & { invoiceNumber: string; grandTotal: Prisma.Decimal; amountReceived: Prisma.Decimal }>>`
        SELECT fi.id AS bucket, fi."invoiceNumber", fi."grandTotal", fi."amountReceived", p.currency, COUNT(*) AS count, SUM(a.amount) AS total
        FROM payment_allocations a JOIN payments p ON p.id = a."paymentId" JOIN final_invoices fi ON fi.id = a."finalInvoiceId"
        WHERE ${verified} GROUP BY 1, 2, 3, 4, 5 ORDER BY 2 LIMIT 200`,
      this.prisma.payment.groupBy({ by: ['currency'], where: { status: PaymentStatus.VERIFIED, paymentDate: today, ...(f.customerId ? { customerId: f.customerId } : {}) }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['currency'], where: { status: PaymentStatus.VERIFIED, paymentDate: { gte: monthStart, lte: today }, ...(f.customerId ? { customerId: f.customerId } : {}) }, _sum: { amount: true }, _count: { _all: true } }),
      this.outstandingAsOf(today, f.customerId),
    ]);
    const t = (r: Row) => ({ bucket: r.bucket, currency: r.currency, count: n(r.count), total: money(r.total) });
    const status = (s: PaymentStatus) => byStatus.filter((r) => r.status === s).map((r) => ({ currency: r.currency, count: n(r.count), total: money(r.total) }));
    const g = (rows: Array<{ currency: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }>) => rows.map((r) => ({ currency: r.currency, count: r._count._all, total: money(r._sum.amount) }));
    return {
      period: f.period.label,
      recorded: byStatus.reduce((sum, r) => sum + n(r.count), 0),
      verified: status(PaymentStatus.VERIFIED),
      pendingVerification: status(PaymentStatus.PENDING_VERIFICATION),
      rejected: status(PaymentStatus.REJECTED),
      reversed: status(PaymentStatus.REVERSED),
      receivedToday: g(todayRows),
      receivedThisMonth: g(monthRows),
      outstandingReceivables: outstanding,
      daily: daily.map(t),
      monthly: monthly.map(t),
      yearly: yearly.map(t),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.bucket, name: r.name, customerCode: r.customerCode }, currency: r.currency, count: n(r.count), total: money(r.total) })),
      byMethod: byMethod.map(t),
      byInvoice: byInvoice.map((r) => ({ invoice: { id: r.bucket, invoiceNumber: r.invoiceNumber, grandTotal: money(r.grandTotal), amountReceived: money(r.amountReceived) }, currency: r.currency, count: n(r.count), total: money(r.total) })),
      definitions: {
        received: 'Only VERIFIED payments count as received, by payment date. Pending, rejected and reversed payments are listed separately and never counted.',
        outstandingReceivables: 'Issued invoices minus verified payments, as of today (not period-bound).',
        todayAndMonth: 'Verified payments dated today / this calendar month (business time zone), regardless of the selected period.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Deliveries
  // -------------------------------------------------------------------------

  async deliveries(f: Filters) {
    const cond = Prisma.sql`${this.dateIn(Prisma.sql`d."deliveryDate"`, f)} AND ${this.customer(Prisma.sql`d."customerId"`, f)}`;
    const today = businessToday();
    const [byStatus, monthly, byCustomer, byInvoice, byProduct, byTransporter, delayed, quantities] = await Promise.all([
      this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`SELECT d.status, COUNT(*) AS count FROM deliveries d WHERE ${cond} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: string; total: bigint; delivered: bigint }>>`SELECT to_char(d."deliveryDate", 'YYYY-MM') AS bucket, COUNT(*) AS total, COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered FROM deliveries d WHERE ${cond} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; total: bigint; delivered: bigint }>>`SELECT c.id, c.name, COUNT(*) AS total, COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered FROM deliveries d JOIN customers c ON c.id = d."customerId" WHERE ${cond} GROUP BY 1, 2 ORDER BY total DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ id: string; invoiceNumber: string | null; invoiced: bigint; dispatched: bigint; delivered: bigint }>>`
        SELECT fi.id, fi."invoiceNumber",
               (SELECT COALESCE(SUM(i.quantity), 0) FROM final_invoice_items i WHERE i."finalInvoiceId" = fi.id) AS invoiced,
               COALESCE(SUM(di.quantity) FILTER (WHERE d.status IN ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED')), 0) AS dispatched,
               COALESCE(SUM(di.quantity) FILTER (WHERE d.status = 'DELIVERED'), 0) AS delivered
        FROM deliveries d JOIN final_invoices fi ON fi.id = d."finalInvoiceId" JOIN delivery_items di ON di."deliveryId" = d.id
        WHERE ${cond} GROUP BY 1, 2 ORDER BY 2 LIMIT 200`,
      this.prisma.$queryRaw<Array<{ id: string; name: string; dispatched: bigint; delivered: bigint }>>`
        SELECT fii."productId" AS id, MAX(fii."productName") AS name,
               COALESCE(SUM(di.quantity) FILTER (WHERE d.status IN ('DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED')), 0) AS dispatched,
               COALESCE(SUM(di.quantity) FILTER (WHERE d.status = 'DELIVERED'), 0) AS delivered
        FROM delivery_items di JOIN deliveries d ON d.id = di."deliveryId" JOIN final_invoice_items fii ON fii.id = di."finalInvoiceItemId"
        WHERE ${cond} GROUP BY 1 ORDER BY dispatched DESC LIMIT 25`,
      this.prisma.$queryRaw<Array<{ name: string | null; total: bigint; delivered: bigint; failed: bigint }>>`
        SELECT COALESCE(NULLIF(TRIM(COALESCE(d."courierCompany", d."transporterName")), ''), 'Not recorded') AS name, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered, COUNT(*) FILTER (WHERE d.status = 'DELIVERY_FAILED') AS failed
        FROM deliveries d WHERE ${cond} AND d.status <> 'DRAFT' GROUP BY 1 ORDER BY total DESC LIMIT 25`,
      this.prisma.delivery.findMany({
        where: { expectedDate: { lt: today }, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'DRAFT'] }, ...(f.customerId ? { customerId: f.customerId } : {}) },
        select: { id: true, deliveryNumber: true, status: true, expectedDate: true, customer: { select: { id: true, name: true } } },
        orderBy: { expectedDate: 'asc' },
        take: 100,
      }),
      this.deliveredQuantities(f),
    ]);
    const count = (s: string) => n(byStatus.find((r) => r.status === s)?.count);
    return {
      period: f.period.label,
      total: byStatus.reduce((sum, r) => sum + n(r.count), 0),
      byStatus: byStatus.map((r) => ({ status: r.status, count: n(r.count) })),
      counts: {
        scheduled: count('SCHEDULED') + count('READY_FOR_DISPATCH'),
        dispatched: count('DISPATCHED'),
        inTransit: count('IN_TRANSIT'),
        partial: count('PARTIALLY_DELIVERED'),
        completed: count('DELIVERED'),
        failed: count('DELIVERY_FAILED'),
        delayed: delayed.length,
      },
      monthly: monthly.map((r) => ({ bucket: r.bucket, total: n(r.total), delivered: n(r.delivered) })),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.id, name: r.name }, total: n(r.total), delivered: n(r.delivered) })),
      byInvoice: byInvoice.map((r) => ({ invoice: { id: r.id, invoiceNumber: r.invoiceNumber }, invoiced: n(r.invoiced), dispatched: n(r.dispatched), delivered: n(r.delivered), completionPercent: pct(n(r.delivered), n(r.invoiced)) })),
      byProduct: byProduct.map((r) => ({ product: { id: r.id, name: r.name }, dispatched: n(r.dispatched), delivered: n(r.delivered) })),
      byTransporter: byTransporter.map((r) => ({ transporter: r.name, total: n(r.total), delivered: n(r.delivered), failed: n(r.failed) })),
      delayed,
      quantities,
      definitions: {
        basis: 'Deliveries with a delivery date in the period, by current status.',
        dispatched: 'Quantities on deliveries that left (dispatched, in transit, partially delivered or delivered).',
        delivered: 'Quantities on deliveries confirmed DELIVERED with proof of delivery. Failed, returned and cancelled deliveries never count as completed.',
        delayed: 'Expected date passed and not yet delivered, cancelled or returned (current position).',
        completion: 'Confirmed delivered quantity ÷ invoiced quantity of issued invoices dated in the period.',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Executive insights: current vs previous period, all verifiable
  // -------------------------------------------------------------------------

  async insights(f: Filters, financial: boolean) {
    const prev = previousPeriod(f.period);
    if (!prev) return { period: f.period.label, comparison: null, insights: [], message: 'Choose a bounded period to compare with the previous one.' };
    const pf: Filters = { ...f, period: prev };
    const sumPer = async (sql: Prisma.Sql) => (await this.prisma.$queryRaw<Array<{ currency: string; total: Prisma.Decimal }>>(sql)).map((r) => ({ currency: r.currency, total: new D(r.total ?? 0) }));
    const invoiceSql = (x: Filters) => Prisma.sql`SELECT currency, SUM("grandTotal") AS total FROM final_invoices fi WHERE fi.status IN ('ISSUED', 'SENT') AND ${this.dateIn(Prisma.sql`fi."invoiceDate"`, x)} AND ${this.customer(Prisma.sql`fi."customerId"`, x)} GROUP BY 1`;
    const paidSql = (x: Filters) => Prisma.sql`SELECT currency, SUM(amount) AS total FROM payments p WHERE p.status = 'VERIFIED' AND ${this.dateIn(Prisma.sql`p."paymentDate"`, x)} AND ${this.customer(Prisma.sql`p."customerId"`, x)} GROUP BY 1`;
    const [invNow, invPrev, paidNow, paidPrev, outNow, outPrev, newNow, newPrev, enqNow, enqPrev, pendingQuotes, overdue, delayed] = await Promise.all([
      financial ? sumPer(invoiceSql(f)) : [],
      financial ? sumPer(invoiceSql(pf)) : [],
      financial ? sumPer(paidSql(f)) : [],
      financial ? sumPer(paidSql(pf)) : [],
      financial ? this.outstandingAsOf(f.period.to, f.customerId) : [],
      financial ? this.outstandingAsOf(prev.to, f.customerId) : [],
      this.prisma.customer.count({ where: { createdAt: this.timeFilter(f) } }),
      this.prisma.customer.count({ where: { createdAt: this.timeFilter(pf) } }),
      this.enquiryConversion(f),
      this.enquiryConversion(pf),
      this.prisma.quotation.count({ where: { status: { in: [QuotationStatus.DRAFT, QuotationStatus.PENDING_APPROVAL, QuotationStatus.APPROVED, QuotationStatus.SENT, QuotationStatus.UNDER_NEGOTIATION] }, ...(f.customerId ? { customerId: f.customerId } : {}) } }),
      this.prisma.finalInvoice.count({ where: { status: { in: ISSUED_FI }, paymentState: { not: InvoicePaymentState.PAID }, dueDate: { lt: businessToday() }, ...(f.customerId ? { customerId: f.customerId } : {}) } }),
      this.prisma.delivery.count({ where: { expectedDate: { lt: businessToday() }, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'DRAFT'] }, ...(f.customerId ? { customerId: f.customerId } : {}) } }),
    ]);
    const insights: Array<{ key: string; text: string; current: unknown; previous: unknown }> = [];
    const compareMoney = (key: string, noun: string, now: Array<{ currency: string; total: Prisma.Decimal | string }>, before: Array<{ currency: string; total: Prisma.Decimal | string }>) => {
      const currencies = [...new Set([...now.map((x) => x.currency), ...before.map((x) => x.currency)])];
      for (const currency of currencies) {
        const a = new D(now.find((x) => x.currency === currency)?.total ?? 0);
        const b = new D(before.find((x) => x.currency === currency)?.total ?? 0);
        if (a.isZero() && b.isZero()) continue;
        const change = b.isZero() ? null : a.minus(b).dividedBy(b).times(100).toDecimalPlaces(1).toNumber();
        const direction = a.greaterThan(b) ? 'increased' : a.lessThan(b) ? 'decreased' : 'did not change';
        insights.push({
          key: `${key}:${currency}`,
          text: `${noun} ${direction}${change !== null && direction !== 'did not change' ? ` by ${Math.abs(change)}%` : ''}: ${currency} ${a.toFixed(2)} vs ${b.toFixed(2)} in the previous period.`,
          current: a.toFixed(2),
          previous: b.toFixed(2),
        });
      }
    };
    if (financial) {
      compareMoney('invoiced', 'Issued invoice value', invNow, invPrev);
      compareMoney('collected', 'Verified collections', paidNow, paidPrev);
      compareMoney('outstanding', 'Outstanding receivables (at period end)', outNow, outPrev);
    }
    insights.push({ key: 'newCustomers', text: `${newNow} new customer(s) in this period vs ${newPrev} in the previous period.`, current: newNow, previous: newPrev });
    if (enqNow.total || enqPrev.total) {
      insights.push({
        key: 'enquiryConversion',
        text: `Enquiry conversion: ${enqNow.rate === null ? 'no enquiries' : `${enqNow.rate}% of ${enqNow.total}`} vs ${enqPrev.rate === null ? 'no enquiries' : `${enqPrev.rate}% of ${enqPrev.total}`} in the previous period.`,
        current: enqNow,
        previous: enqPrev,
      });
    }
    insights.push({ key: 'pendingQuotations', text: `${pendingQuotes} quotation(s) are open (draft, awaiting approval, sent or under negotiation).`, current: pendingQuotes, previous: null });
    if (financial) insights.push({ key: 'overdueInvoices', text: `${overdue} issued invoice(s) are past their due date and not fully paid.`, current: overdue, previous: null });
    insights.push({ key: 'delayedDeliveries', text: `${delayed} delivery(ies) are past their expected date and not yet delivered.`, current: delayed, previous: null });
    return {
      period: f.period.label,
      comparison: prev.label,
      insights,
      message: insights.length ? null : 'Not enough data in these periods for a comparison.',
      definitions: { method: 'Each statement compares the selected period with the immediately preceding period of the same length, using the same definitions as the detailed reports. Nothing is predicted.' },
    };
  }

  private async enquiryConversion(f: Filters) {
    const where: Prisma.EnquiryWhereInput = { enquiryDate: this.dateFilter(f), ...(f.customerId ? { customerId: f.customerId } : {}) };
    const [total, converted] = await Promise.all([this.prisma.enquiry.count({ where }), this.prisma.enquiry.count({ where: { ...where, status: EnquiryStatus.CONVERTED } })]);
    return { total, converted, rate: pct(converted, total) };
  }
}

const OVERVIEW_DEFINITIONS = {
  counts: 'Vendors, products and customers: current master records (archived excluded). Enquiries: enquiry date in the period. Quotations: created in the period. Proforma invoices: PI date in the period. Final invoices: issued/sent, invoice date in the period. Deliveries: delivery date in the period; completed = confirmed Delivered.',
  quotationValue: 'Current-revision totals of quotations created in the period (cancelled excluded). Pipeline only - not revenue.',
  proformaValue: 'Issued/sent proforma invoices dated in the period. Not revenue.',
  invoicedValue: 'Issued/sent final invoices dated in the period. This is the invoiced sales figure.',
  verifiedPayments: 'Verified payments dated in the period. Pending, rejected and reversed payments are excluded.',
  outstandingReceivables: 'Issued invoices minus verified payments, as of the end of the period.',
  separation: 'Quotation, proforma, invoice and collected values describe different stages of the same business and must never be added together.',
};
