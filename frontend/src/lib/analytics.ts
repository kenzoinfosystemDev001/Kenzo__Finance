/**
 * Module 10 - Reports & Analytics: shared types, constants and formatting.
 *
 * Response shapes mirror apps/api/src/analytics/analytics.service.ts. Money is
 * always a decimal string grouped per currency; it is displayed as returned
 * and never added across currencies.
 */
import { formatMoney } from './quotation-labels';

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'previousMonth', label: 'Previous month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'thisYear', label: 'This year' },
  { value: 'all', label: 'All dates' },
  { value: 'custom', label: 'Custom range' },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]['value'];
export const DEFAULT_PRESET: RangePreset = 'thisMonth';

/** Section reports (the overview and insights live on /reports itself). */
export const SECTION_REPORTS = ['sales', 'customers', 'vendors', 'products', 'enquiries', 'quotations', 'proforma', 'invoices', 'payments', 'deliveries'] as const;
export type SectionReport = (typeof SECTION_REPORTS)[number];
export type ReportKey = SectionReport | 'overview' | 'insights';

export const REPORT_TITLES: Record<ReportKey, string> = {
  overview: 'Executive Overview',
  insights: 'Executive Summary',
  sales: 'Sales',
  customers: 'Customers',
  vendors: 'Vendors',
  products: 'Products',
  enquiries: 'Enquiries',
  quotations: 'Quotations',
  proforma: 'Proforma Invoices',
  invoices: 'Final Invoices',
  payments: 'Payments',
  deliveries: 'Deliveries',
};

/** Same map as REPORT_PERMISSION in analytics.controller.ts (the API enforces it too). */
export const REPORT_PERMISSIONS: Record<ReportKey, string[]> = {
  overview: ['analytics.dashboard'],
  insights: ['analytics.dashboard'],
  sales: ['analytics.invoices', 'analytics.financial'],
  customers: ['analytics.customers'],
  vendors: ['analytics.vendors'],
  products: ['analytics.products'],
  enquiries: ['analytics.enquiries'],
  quotations: ['analytics.quotations'],
  proforma: ['analytics.proforma'],
  invoices: ['analytics.invoices', 'analytics.financial'],
  payments: ['analytics.payments', 'analytics.financial'],
  deliveries: ['analytics.deliveries'],
};

export const canViewReport = (report: ReportKey, permissions: string[]) => REPORT_PERMISSIONS[report].every((p) => permissions.includes(p));

/** Which optional filters each API report actually uses (analytics.service.ts). */
export const REPORT_FILTERS: Record<ReportKey, Array<'customerId' | 'productId' | 'assignedToId' | 'buckets'>> = {
  overview: ['customerId'],
  insights: ['customerId'],
  sales: ['customerId', 'productId'],
  customers: [],
  vendors: [],
  products: ['productId'],
  enquiries: ['customerId', 'assignedToId'],
  quotations: ['customerId'],
  proforma: ['customerId'],
  invoices: ['customerId', 'productId', 'buckets'],
  payments: ['customerId'],
  deliveries: ['customerId'],
};

export interface AnalyticsFilters {
  preset: RangePreset;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  productId?: string;
  assignedToId?: string;
  buckets?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKETS = /^\d{1,4}(,\d{1,4})*$/;

type RawParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads the shared filters from the URL, dropping anything malformed. */
export function parseFilters(params: RawParams): AnalyticsFilters {
  const preset = one(params.preset);
  const valid = RANGE_PRESETS.some((p) => p.value === preset) ? (preset as RangePreset) : DEFAULT_PRESET;
  const date = (v?: string) => (v && DATE.test(v) ? v : undefined);
  const uuid = (v?: string) => (v && UUID.test(v) ? v : undefined);
  const buckets = one(params.buckets)?.replace(/\s+/g, '');
  return {
    preset: valid,
    dateFrom: valid === 'custom' ? date(one(params.dateFrom)) : undefined,
    dateTo: valid === 'custom' ? date(one(params.dateTo)) : undefined,
    customerId: uuid(one(params.customerId)),
    productId: uuid(one(params.productId)),
    assignedToId: uuid(one(params.assignedToId)),
    buckets: buckets && BUCKETS.test(buckets) ? buckets : undefined,
  };
}

/**
 * Query params for one report: only those AnalyticsQueryDto declares
 * (the API rejects unknown ones) and only those the report uses.
 */
export function reportParams(report: ReportKey, f: AnalyticsFilters): Record<string, string | undefined> {
  const used = REPORT_FILTERS[report];
  return {
    preset: f.preset,
    dateFrom: f.preset === 'custom' ? f.dateFrom : undefined,
    dateTo: f.preset === 'custom' ? f.dateTo : undefined,
    customerId: used.includes('customerId') ? f.customerId : undefined,
    productId: used.includes('productId') ? f.productId : undefined,
    assignedToId: used.includes('assignedToId') ? f.assignedToId : undefined,
    buckets: used.includes('buckets') ? f.buckets : undefined,
  };
}

/** URL search string for links inside /reports (keeps all shared filters). */
export function filterSearch(f: AnalyticsFilters): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === 'preset' && v === DEFAULT_PRESET)) s.set(k, v);
  const out = s.toString();
  return out ? `?${out}` : '';
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats an API decimal string with the currency code. The string is passed
 * to Intl.NumberFormat as-is (exact decimal formatting, no float arithmetic);
 * an unknown currency code falls back to plain digit grouping.
 */
export function money(value: string | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '';
  try {
    let f = formatters.get(currency);
    if (!f) {
      f = new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
      formatters.set(currency, f);
    }
    return f.format(value as unknown as number);
  } catch {
    return formatMoney(value, currency);
  }
}

export const count = (v: number | null | undefined) => (v === null || v === undefined ? '' : new Intl.NumberFormat('en-IN').format(v));
export const percent = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${v}%`);

/** "PARTIALLY_DELIVERED" -> "Partially delivered". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value.includes('_') || value === value.toUpperCase() ? value.toLowerCase().replace(/_/g, ' ') : value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03" -> "Mar 2026"; other bucket formats are shown unchanged. */
export function bucketLabel(bucket: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(bucket);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return bucket;
}

// ---------------------------------------------------------------------------
// Response shapes (analytics.service.ts)
// ---------------------------------------------------------------------------

export type Definitions = Record<string, string>;
export interface Money { currency: string; total: string; count: number }
export interface CurrencyTotal { currency: string; total: string }
export interface CustomerRef { id: string; name: string; customerCode?: string }
export interface StatusCount { status: string; count: number }
export interface Trend { bucket: string; currency: string; count: number; total: string }

export interface DeliveryQuantities { invoicedQuantity: number; dispatchedQuantity: number; deliveredQuantity: number; completionPercent: number | null }

export interface OverviewReport {
  period: string;
  counts: { vendors: number; products: number; customers: number; enquiries: number; quotations: number; proformaInvoices: number; finalInvoices: number; deliveries: number; completedDeliveries: number };
  /** null when the user lacks analytics.financial (service.ts:100). */
  financial: null | {
    quotationValue: Money[];
    proformaValue: Money[];
    invoicedValue: Money[];
    verifiedPayments: Money[];
    outstandingReceivables: CurrencyTotal[];
    delivery: DeliveryQuantities;
  };
  definitions: Definitions;
}

export interface InsightsReport {
  period: string;
  comparison: string | null;
  insights: Array<{ key: string; text: string; current: unknown; previous: unknown }>;
  message: string | null;
  definitions?: Definitions;
}

export interface SalesReport {
  period: string;
  totals: Array<Money & { average: string }>;
  monthly: Trend[];
  quarterly: Trend[];
  yearly: Trend[];
  byCustomer: Array<{ customer: CustomerRef; currency: string; count: number; total: string }>;
  byProduct: Array<{ product: { id: string; name: string; productCode: string }; currency: string; quantity: number; total: string }>;
  byModel: Array<{ model: { id: string | null; productName: string; modelName: string | null }; currency: string; quantity: number; total: string }>;
  statusDistribution: StatusCount[];
  definitions: Definitions;
}

export interface CustomersReport {
  period: string;
  counts: Record<string, number>;
  topByInvoiceValue: Array<{ customer: CustomerRef; currency: string; total: string; count: number }>;
  topByVerifiedPayments: Array<{ customer: CustomerRef; currency: string; total: string; count: number }>;
  topByOutstanding: Array<{ customer: CustomerRef; currency: string; total: string; count: number }>;
  mostEnquiries: Array<{ customer: CustomerRef; count: number }>;
  mostQuotations: Array<{ customer: CustomerRef; count: number }>;
  mostDeliveries: Array<{ customer: CustomerRef; count: number }>;
  newCustomersByMonth: Array<{ bucket: string; count: number }>;
  /** false = money lists are left empty by the API (service.ts:219-221). */
  financial: boolean;
  definitions: Definitions;
}

export interface VendorsReport {
  period: string;
  total: number;
  byStatus: StatusCount[];
  recentlyAdded: Array<{ id: string; vendorCode: string; businessName: string; status: string; createdAt: string }>;
  byBrand: Array<{ id: string; name: string; vendors: number }>;
  byProduct: Array<{ id: string; name: string; vendors: number }>;
  byModel: Array<{ id: string; name: string; productName: string; vendors: number }>;
  definitions: Definitions;
}

export interface ProductsReport {
  period: string;
  totals: { products: number; brands: number; models: number };
  byCategory: Array<{ id: string | null; name: string; count: number }>;
  modelsByProduct: Array<{ id: string; name: string; models: number }>;
  vendorAvailability: Array<{ id: string; name: string; vendors: number }>;
  mostQuoted: Array<{ id: string; name: string; quotations: number; quantity: number }>;
  mostInvoiced: Array<{ id: string; name: string; invoices: number; quantity: number; currency: string; total: string }>;
  definitions: Definitions;
}

export interface EnquiriesReport {
  period: string;
  total: number;
  byStatus: StatusCount[];
  byPriority: Array<{ priority: string; count: number }>;
  bySource: Array<{ id: string | null; name: string; count: number }>;
  employees: Array<{ id: string | null; name: string; assigned: number; followedUp: number; converted: number; pending: number; lost: number }>;
  monthly: Array<{ bucket: string; total: number; converted: number }>;
  rates: { conversionRate: number | null; lostRate: number | null; followUpCompletion: number | null };
  definitions: Definitions;
}

export interface QuotationsReport {
  period: string;
  total: number;
  revised: number;
  byStatus: StatusCount[];
  /** total is null without analytics.financial (service.ts:399-400). */
  monthly: Array<{ bucket: string; currency: string; count: number; total: string | null; accepted: number; rejected: number }>;
  byCustomer: Array<{ customer: CustomerRef; currency: string; count: number; total: string | null; accepted: number }>;
  rates: { acceptanceRate: number | null; acceptedOfAll: number | null };
  definitions: Definitions;
}

export interface ProformaReport {
  period: string;
  total: number;
  byStatus: StatusCount[];
  /** null without analytics.financial (service.ts:431-433). */
  value: Money[] | null;
  monthly: Array<{ bucket: string; currency: string; count: number; total: string | null }>;
  byCustomer: Array<{ customer: CustomerRef; currency: string; count: number; total: string | null }>;
  conversion: { issued: number; invoiced: number; rate: number | null };
  definitions: Definitions;
}

export interface InvoicesReport {
  period: string;
  byStatus: StatusCount[];
  paymentPosition: { unpaid: number; partiallyPaid: number; fullyPaid: number };
  totals: SalesReport['totals'];
  monthly: Trend[];
  byCustomer: SalesReport['byCustomer'];
  byProduct: SalesReport['byProduct'];
  overdueCount: number;
  ageing: Array<{ bucket: string; perCurrency: Money[] }>;
  outstandingInvoices: Array<{ id: string; invoiceNumber: string | null; invoiceDate: string; dueDate: string | null; currency: string; grandTotal: string; amountReceived: string; outstanding: string; bucket: string; customer: { id: string; name: string } }>;
  definitions: Definitions;
}

export interface PaymentsReport {
  period: string;
  recorded: number;
  verified: Money[];
  pendingVerification: Money[];
  rejected: Money[];
  reversed: Money[];
  receivedToday: Money[];
  receivedThisMonth: Money[];
  outstandingReceivables: CurrencyTotal[];
  daily: Trend[];
  monthly: Trend[];
  yearly: Trend[];
  byCustomer: Array<{ customer: CustomerRef; currency: string; count: number; total: string }>;
  byMethod: Trend[];
  byInvoice: Array<{ invoice: { id: string; invoiceNumber: string; grandTotal: string; amountReceived: string }; currency: string; count: number; total: string }>;
  definitions: Definitions;
}

export interface DeliveriesReport {
  period: string;
  total: number;
  byStatus: StatusCount[];
  counts: { scheduled: number; dispatched: number; inTransit: number; partial: number; completed: number; failed: number; delayed: number };
  monthly: Array<{ bucket: string; total: number; delivered: number }>;
  byCustomer: Array<{ customer: CustomerRef; total: number; delivered: number }>;
  byInvoice: Array<{ invoice: { id: string; invoiceNumber: string | null }; invoiced: number; dispatched: number; delivered: number; completionPercent: number | null }>;
  byProduct: Array<{ product: { id: string; name: string }; dispatched: number; delivered: number }>;
  byTransporter: Array<{ transporter: string; total: number; delivered: number; failed: number }>;
  delayed: Array<{ id: string; deliveryNumber: string | null; status: string; expectedDate: string | null; customer: { id: string; name: string } }>;
  quantities: DeliveryQuantities;
  definitions: Definitions;
}
