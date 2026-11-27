import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Company, PaginatedResponse, Product, VendorListItem, VendorSummary } from '@/lib/types';
import { SectionCard } from '@/components/ui';
import { PaymentAlertTable } from '@/components/payment-alert-rows';
import { getPaymentAlerts } from '@/lib/payment-alerts';
import { RangeFilter } from './range-filter';
import { SalesTrendChart, type SalesTrendRow } from './sales-trend';
import { DASHBOARD_RANGES, parseRange, type DashboardRange } from './dashboard-range';

export const metadata: Metadata = { title: 'Dashboard' };

interface SalesResponse {
  totals: Array<{ currency: string; total: string; count: number; average: string }>;
  monthly: SalesTrendRow[];
}

interface TopSellersResponse {
  period: { label: string };
  byValue: Array<{ productId: string; name: string; productCode: string; currency: string; quantity: number; saleAmount: string }>;
}

/** A section that failed to load shows a plain message rather than breaking the page. */
function SectionError({ what }: { what: string }) {
  return (
    <p role="alert" className="px-4 py-8 text-center text-sm text-danger">
      {what} could not be loaded. Refresh the page to try again.
    </p>
  );
}

function KpiCard({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  href: string;
  tone: 'accent' | 'success' | 'warning' | 'info';
}) {
  const bar = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    info: 'bg-highlight',
  }[tone];
  return (
    <Link href={href} className="card relative overflow-hidden p-5 transition-colors hover:border-border-strong">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${bar}`} />
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </Link>
  );
}

/**
 * Business overview. Every figure comes from the database through the existing
 * APIs. Date-based figures follow the range selected in the URL; the vendor,
 * brand and product counts and the payment alerts describe the current state.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rangeParam } = await searchParams;
  const range: DashboardRange = parseRange(rangeParam);
  const rangeLabel = DASHBOARD_RANGES.find((r) => r.preset === range)?.label ?? 'Last 30 days';

  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const canSeeSales = permissions.includes('analytics.invoices') && permissions.includes('analytics.financial');
  const canSeeTopSellers = permissions.includes('analytics.products') && permissions.includes('analytics.invoices');

  const [summary, companies, products, recent, paymentAlerts, sales, topSellers] = await Promise.all([
    permissions.includes('vendor.read') ? apiFetch<VendorSummary>('/vendors/summary').catch(() => null) : Promise.resolve(null),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=1').catch(() => null),
    apiFetch<PaginatedResponse<Product>>('/products?pageSize=1').catch(() => null),
    apiFetch<PaginatedResponse<VendorListItem>>('/vendors?pageSize=5&sortBy=createdAt&sortDir=desc').catch(() => null),
    permissions.includes('invoice.read') ? getPaymentAlerts().catch(() => null) : Promise.resolve(null),
    canSeeSales ? apiFetch<SalesResponse>(`/analytics/sales?preset=${range}`).catch(() => null) : Promise.resolve(null),
    canSeeTopSellers
      ? apiFetch<TopSellersResponse>(`/sales/top-sellers?preset=${range}`).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Sales are reported per currency. The headline and chart use the first currency returned.
  const primary = sales?.totals[0] ?? null;
  const chartCurrency = primary?.currency ?? null;

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Business Overview</h1>
          <p className="mt-2 text-base text-ink-muted">Here&apos;s what&apos;s happening with your business today.</p>
        </div>
        <RangeFilter current={range} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active vendors"
          value={String(summary?.vendors.active ?? 0)}
          note={summary ? `${summary.vendors.inactive} inactive` : undefined}
          href="/vendors?status=ACTIVE"
          tone="accent"
        />
        <KpiCard label="Brands" value={String(companies?.meta.totalItems ?? 0)} href="/companies" tone="info" />
        <KpiCard label="Products" value={String(products?.meta.totalItems ?? 0)} href="/products" tone="success" />
        {canSeeSales ? (
          <KpiCard
            label={`Invoiced sales · ${rangeLabel}`}
            value={primary ? `${primary.currency} ${Number(primary.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            note={primary ? `${primary.count} final invoice${primary.count === 1 ? '' : 's'}` : sales ? 'No invoices in this period' : undefined}
            href="/final-invoices"
            tone="warning"
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <SectionCard
            title="Recently added vendors"
            padded={false}
            actions={
              <Link href="/vendors" className="text-sm text-accent hover:underline">
                View all
              </Link>
            }
          >
            {!recent ? (
              <SectionError what="Recent vendors" />
            ) : recent.items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-base text-ink-muted">No vendors yet.</p>
                {permissions.includes('vendor.create') && (
                  <Link href="/vendors/new" className="btn-primary mt-4">
                    Add the first vendor
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Vendor</th>
                      <th scope="col">Location</th>
                      <th scope="col" className="text-right">Products</th>
                      <th scope="col">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.items.map((vendor) => (
                      <tr key={vendor.id}>
                        <td className="whitespace-nowrap font-mono text-sm text-ink-muted">{vendor.vendorCode}</td>
                        <td>
                          <Link href={`/vendors/${vendor.id}`} className="font-medium text-accent hover:underline">
                            {vendor.businessName}
                          </Link>
                        </td>
                        <td>{[vendor.city, vendor.state].filter(Boolean).join(', ') || '-'}</td>
                        <td className="text-right tabular-nums">{vendor._count.products}</td>
                        <td className="whitespace-nowrap">
                          {new Date(vendor.createdAt).toLocaleDateString('en-IN', {
                            timeZone: BUSINESS_TIME_ZONE,
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {canSeeSales && (
          <div className="xl:col-span-3">
            <SectionCard title="Sales analytics" description={`Invoiced sales by month · ${rangeLabel}`}>
              {!sales ? (
                <SectionError what="Sales analytics" />
              ) : (
                <SalesTrendChart rows={sales.monthly} currency={chartCurrency} />
              )}
            </SectionCard>
          </div>
        )}
      </div>

      {paymentAlerts && (
        <div className="mt-4">
          <SectionCard
            title="Payment due alerts"
            description="Current position, not limited to the selected range."
            padded={false}
            actions={
              <Link href="/final-invoices?pastDueOnly=true" className="text-sm text-accent hover:underline">
                View overdue
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4 lg:grid-cols-4">
              <Link href="/final-invoices?pastDueOnly=true" className="rounded-lg border border-danger/30 bg-danger-subtle p-3 hover:border-danger/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-danger">Overdue</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-danger">{paymentAlerts.summary.overdue}</p>
              </Link>
              <Link href="/final-invoices" className="rounded-lg border border-border bg-info-subtle p-3 hover:border-border-strong">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Due today</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{paymentAlerts.summary.dueToday}</p>
              </Link>
              <Link href="/final-invoices" className="rounded-lg border border-border bg-lavender-hover/40 p-3 hover:border-border-strong">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Due in 5 days</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{paymentAlerts.summary.dueSoon}</p>
              </Link>
              <Link href="/final-invoices" className="rounded-lg border border-border bg-surface-muted p-3 hover:border-border-strong">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Still outstanding</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{paymentAlerts.summary.totalOutstanding}</p>
              </Link>
            </div>
            {paymentAlerts.alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No payment is due within five days and nothing is overdue.</p>
            ) : (
              <PaymentAlertTable alerts={paymentAlerts.alerts.slice(0, 10)} />
            )}
          </SectionCard>
        </div>
      )}

      {canSeeTopSellers && (
        <div className="mt-4">
          <SectionCard
            title="Top-selling products"
            description={topSellers ? `${topSellers.period.label} · from final invoices` : rangeLabel}
            padded={false}
            actions={
              <Link href="/sales-history" className="text-sm text-accent hover:underline">
                View details
              </Link>
            }
          >
            {!topSellers ? (
              <SectionError what="Top-selling products" />
            ) : topSellers.byValue.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No product sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col" className="w-12">#</th>
                      <th scope="col">Product</th>
                      <th scope="col" className="text-right">Quantity sold</th>
                      <th scope="col" className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSellers.byValue.slice(0, 5).map((row, index) => (
                      <tr key={`${row.productId}-${row.currency}`}>
                        <td className="tabular-nums text-ink-subtle">{index + 1}</td>
                        <td>
                          <span className="font-medium text-ink">{row.name}</span>{' '}
                          <span className="font-mono text-xs text-ink-subtle">{row.productCode}</span>
                        </td>
                        <td className="text-right tabular-nums">{row.quantity}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {row.currency} {row.saleAmount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}
