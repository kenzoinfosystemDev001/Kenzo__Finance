import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, PageHeader, SectionCard } from '@/components/ui';

export const metadata: Metadata = { title: 'Sales history' };

const PRESETS = [
  ['all', 'All time'],
  ['thisMonth', 'This month'],
  ['previousMonth', 'Last month'],
  ['custom', 'Custom range'],
] as const;
const VIEWS = [
  ['latest', 'Latest sales'],
  ['oldest', 'Oldest sales'],
  ['product', 'Product-wise'],
  ['customer', 'Customer-wise'],
] as const;
const PAGE_SIZES = [25, 50, 100];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Totals {
  currency: string;
  quantity: number;
  saleAmount: string;
  orders: number;
}

interface HistoryResponse {
  period: { label: string };
  view: 'latest' | 'oldest' | 'product' | 'customer';
  totals: Totals[];
  items: Array<Record<string, unknown>>;
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
}

interface TopSellers {
  period: { label: string };
  byQuantity: Row[];
  byValue: Row[];
  byOrders: Row[];
}

interface Row {
  productId: string;
  name: string;
  productCode: string;
  currency: string;
  quantity: number;
  saleAmount: string;
  orders: number;
}

interface MonthRow {
  month: string;
  currency: string;
  quantity: number;
  saleAmount: string;
  orders: number;
}

interface ComparisonRow {
  productId: string;
  name: string;
  productCode: string;
  currency: string;
  current: { quantity: number; saleAmount: string; orders: number };
  previous: { quantity: number; saleAmount: string; orders: number } | null;
  quantityChange: number | null;
}

/**
 * Sold-products history and sales analytics. Every figure comes from issued and
 * sent final invoices through the API; quotations and proforma invoices are not
 * sales and never appear here.
 */
export default async function SalesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (!permissions.includes('analytics.products') || !permissions.includes('analytics.invoices')) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Sales history" />
        <EmptyState title="Not available for your account" description="Sales history needs product and invoice analytics access." />
      </div>
    );
  }

  const preset = PRESETS.some(([k]) => k === p.preset) ? (p.preset as (typeof PRESETS)[number][0]) : 'all';
  const view = VIEWS.some(([k]) => k === p.view) ? (p.view as (typeof VIEWS)[number][0]) : 'latest';
  const pageSize = PAGE_SIZES.includes(Number(p.pageSize)) ? Number(p.pageSize) : 25;
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  const scope = {
    preset,
    dateFrom: preset === 'custom' && p.dateFrom && DATE.test(p.dateFrom) ? p.dateFrom : undefined,
    dateTo: preset === 'custom' && p.dateTo && DATE.test(p.dateTo) ? p.dateTo : undefined,
    search: p.search?.trim() || undefined,
    productId: p.productId || undefined,
    customerId: p.customerId || undefined,
  };
  const historyQuery = queryString({ ...scope, view, page, pageSize });

  let history: HistoryResponse | null = null;
  let historyError: string | null = null;
  try {
    history = await apiFetch<HistoryResponse>(`/sales/history${historyQuery}`);
  } catch (cause) {
    historyError = cause instanceof ApiError ? cause.messages[0] : 'Sales history could not be loaded.';
  }

  const [topSellers, monthly, comparison] = await Promise.all([
    apiFetch<TopSellers>('/sales/top-sellers?preset=thisMonth').catch(() => null),
    apiFetch<{ months: number; rows: MonthRow[] }>('/sales/monthly?months=12').catch(() => null),
    apiFetch<{ previousPeriodLabel: string | null; rows: ComparisonRow[]; period: { label: string } }>(
      `/sales/comparison${queryString({ ...scope, preset: preset === 'all' ? 'thisMonth' : preset })}`,
    ).catch(() => null),
  ]);

  const exportLink = (format: 'xlsx' | 'pdf' | 'csv', report: string) =>
    `/sales-history/export${queryString({ ...scope, view, report, format })}`;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Sales history"
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={exportLink('xlsx', 'history')} className="btn-secondary">Excel</a>
            <a href={exportLink('pdf', 'history')} className="btn-secondary">PDF</a>
            <a href={exportLink('csv', 'history')} className="btn-secondary">CSV</a>
          </div>
        }
      />

      {/* Filters. A plain GET form, so every view is a shareable link. */}
      <form method="get" role="search" className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted lg:col-span-1">
          Period
          <select name="preset" defaultValue={preset} className="field-input h-9">
            {PRESETS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          From
          <input type="date" name="dateFrom" defaultValue={scope.dateFrom ?? ''} className="field-input h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          To
          <input type="date" name="dateTo" defaultValue={scope.dateTo ?? ''} className="field-input h-9" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          View
          <select name="view" defaultValue={view} className="field-input h-9">
            {VIEWS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted sm:col-span-2 lg:col-span-1">
          Search
          <input name="search" defaultValue={scope.search ?? ''} placeholder="Product, customer or invoice" className="field-input h-9" />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary h-9">Apply</button>
          <Link href="/sales-history" className="btn-secondary h-9">Reset</Link>
        </div>
      </form>

      {/* Totals for the selected scope */}
      {history && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {history.totals.length === 0 ? (
            <div className="card p-4 text-sm text-ink-muted sm:col-span-3">No sales in {history.period.label}.</div>
          ) : (
            history.totals.map((t) => (
              <div key={t.currency} className="card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Sales · {history.period.label} · {t.currency}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{formatMoney(t.saleAmount, t.currency)}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{t.quantity} unit{t.quantity === 1 ? '' : 's'} · {t.orders} invoice{t.orders === 1 ? '' : 's'}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* History */}
      <SectionCard title={VIEWS.find(([k]) => k === view)?.[1] ?? 'Sales'} padded={false}>
        {historyError ? (
          <div className="p-4"><ErrorState title="Sales history unavailable" message={historyError} /></div>
        ) : !history || history.items.length === 0 ? (
          <EmptyState title="No sales in this selection" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  {history.view === 'latest' || history.view === 'oldest' ? (
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Invoice</th>
                      <th scope="col" className="text-right">Quantity</th>
                      <th scope="col" className="text-right">Sale amount</th>
                      <th scope="col">Invoice date</th>
                      <th scope="col" className="text-right">Actions</th>
                    </tr>
                  ) : history.view === 'product' ? (
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Code</th>
                      <th scope="col" className="text-right">Quantity</th>
                      <th scope="col" className="text-right">Sale amount</th>
                      <th scope="col" className="text-right">Invoices</th>
                      <th scope="col" className="text-right">Customers</th>
                    </tr>
                  ) : (
                    <tr>
                      <th scope="col">Customer</th>
                      <th scope="col">Code</th>
                      <th scope="col" className="text-right">Quantity</th>
                      <th scope="col" className="text-right">Sale amount</th>
                      <th scope="col" className="text-right">Invoices</th>
                      <th scope="col" className="text-right">Products</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {history.items.map((item, index) => {
                    if (history.view === 'latest' || history.view === 'oldest') {
                      const customer = item.customer as { id: string; name: string };
                      return (
                        <tr key={`${item.id}-${index}`}>
                          <td>
                            <span className="font-medium">{String(item.productName)}</span>
                            {item.modelName ? <span className="block text-xs text-ink-subtle">{String(item.modelName)}</span> : null}
                          </td>
                          <td>
                            <Link href={`/customers/${customer.id}`} className="link-pill">{customer.name}</Link>
                          </td>
                          <td className="font-mono text-sm">
                            {item.finalInvoiceId ? (
                              <Link href={`/final-invoices/${String(item.finalInvoiceId)}`} className="link-pill">{String(item.invoiceNumber ?? '—')}</Link>
                            ) : (
                              String(item.invoiceNumber ?? '—')
                            )}
                          </td>
                          <td className="text-right tabular-nums">{Number(item.quantity)}</td>
                          <td className="text-right tabular-nums">{formatMoney(String(item.saleAmount), String(item.currency))}</td>
                          <td className="whitespace-nowrap">{formatDate(String(item.invoiceDate))}</td>
                          <td className="whitespace-nowrap text-right">
                            {item.finalInvoiceId ? (
                              <span className="inline-flex items-center gap-3 text-sm">
                                <Link href={`/final-invoices/${String(item.finalInvoiceId)}`} className="link-pill">View</Link>
                                <a href={`/final-invoices/${String(item.finalInvoiceId)}/pdf`} className="link-pill">Download PDF</a>
                              </span>
                            ) : (
                              <span className="text-ink-subtle">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                    if (history.view === 'product') {
                      return (
                        <tr key={`${item.id}-${String(item.currency)}`}>
                          <td>
                            <span className="font-medium">{String(item.name)}</span>
                            {item.model ? <span className="block text-xs text-ink-subtle">{String(item.model)}</span> : null}
                          </td>
                          <td className="font-mono text-sm">{String(item.code)}</td>
                          <td className="text-right tabular-nums">{Number(item.quantity)}</td>
                          <td className="text-right tabular-nums">{formatMoney(String(item.saleAmount), String(item.currency))}</td>
                          <td className="text-right tabular-nums">{Number(item.orders)}</td>
                          <td className="text-right tabular-nums">{Number(item.customers)}</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`${item.id}-${String(item.currency)}`}>
                        <td>
                          <Link href={`/customers/${String(item.id)}`} className="link-pill font-medium">{String(item.name)}</Link>
                        </td>
                        <td className="font-mono text-sm">{String(item.code)}</td>
                        <td className="text-right tabular-nums">{Number(item.quantity)}</td>
                        <td className="text-right tabular-nums">{formatMoney(String(item.saleAmount), String(item.currency))}</td>
                        <td className="text-right tabular-nums">{Number(item.orders)}</td>
                        <td className="text-right tabular-nums">{Number(item.distinctProducts)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border p-3">
              <Pagination
                meta={history.meta}
                basePath="/sales-history"
                params={{ preset, dateFrom: scope.dateFrom, dateTo: scope.dateTo, view, search: scope.search, pageSize: String(pageSize) }}
                noun="sales"
                extra={
                  <form method="get" className="flex items-center gap-2 text-xs text-ink-muted">
                    <input type="hidden" name="preset" value={preset} />
                    <input type="hidden" name="view" value={view} />
                    <select name="pageSize" defaultValue={String(pageSize)} className="field-input h-8 w-20" aria-label="Rows per page">
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </form>
                }
              />
            </div>
          </>
        )}
      </SectionCard>

      {/* Top sellers this month */}
      <SectionCard title={`Top-selling products · ${topSellers?.period.label ?? 'this month'}`}>
        {!topSellers ? (
          <p className="p-4 text-sm text-ink-muted">Top-selling products could not be loaded.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
            <TopList title="By quantity sold" rows={topSellers.byQuantity} metric={(r) => `${r.quantity} units`} />
            <TopList title="By sales value" rows={topSellers.byValue} metric={(r) => formatMoney(r.saleAmount, r.currency)} />
            <TopList title="By number of orders" rows={topSellers.byOrders} metric={(r) => `${r.orders} order${r.orders === 1 ? '' : 's'}`} />
          </div>
        )}
      </SectionCard>

      {/* Product-wise comparison */}
      <SectionCard
        title="Product sales compared"
        description={comparison?.previousPeriodLabel ? undefined : 'Choose a period with a previous period to compare.'}
        padded={false}
      >
        {!comparison || comparison.rows.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">No sales to compare in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col" className="text-right">Units now</th>
                  <th scope="col" className="text-right">Units before</th>
                  <th scope="col" className="text-right">Change</th>
                  <th scope="col" className="text-right">Sales now</th>
                  <th scope="col" className="text-right">Sales before</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.slice(0, 50).map((r) => (
                  <tr key={`${r.productId}-${r.currency}`}>
                    <td><span className="font-medium">{r.name}</span> <span className="font-mono text-xs text-ink-subtle">{r.productCode}</span></td>
                    <td className="text-right tabular-nums">{r.current.quantity}</td>
                    <td className="text-right tabular-nums">{r.previous ? r.previous.quantity : '—'}</td>
                    <td className="text-right tabular-nums">
                      {r.quantityChange === null ? (
                        '—'
                      ) : (
                        <span className={r.quantityChange > 0 ? 'text-success' : r.quantityChange < 0 ? 'text-danger' : 'text-ink-muted'}>
                          {r.quantityChange > 0 ? '+' : ''}{r.quantityChange}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.current.saleAmount, r.currency)}</td>
                    <td className="text-right tabular-nums">{r.previous ? formatMoney(r.previous.saleAmount, r.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Monthly summary */}
      <SectionCard
        title="Monthly sales summary"
        description="The last twelve months, by month and currency."
        padded={false}
        actions={<a href={exportLink('xlsx', 'monthly')} className="link-pill text-sm">Export</a>}
      >
        {!monthly || monthly.rows.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">No sales in the last twelve months.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Currency</th>
                  <th scope="col" className="text-right">Units</th>
                  <th scope="col" className="text-right">Sales</th>
                  <th scope="col" className="text-right">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {monthly.rows.map((r) => (
                  <tr key={`${r.month}-${r.currency}`}>
                    <td className="whitespace-nowrap">{r.month}</td>
                    <td>{r.currency}</td>
                    <td className="text-right tabular-nums">{r.quantity}</td>
                    <td className="text-right tabular-nums">{formatMoney(r.saleAmount, r.currency)}</td>
                    <td className="text-right tabular-nums">{r.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function TopList({ title, rows, metric }: { title: string; rows: Row[]; metric: (r: Row) => string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No sales this month.</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r, i) => (
            <li key={`${r.productId}-${r.currency}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-base">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                    i === 0 ? 'bg-sidebar text-white' : 'bg-surface-muted text-ink-muted'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 truncate font-medium text-ink">{r.name}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">{metric(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
