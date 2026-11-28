import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Company, CustomerListItem, PaginatedResponse, Product, VendorListItem, VendorSummary } from '@/lib/types';
import { SectionCard } from '@/components/ui';
import { FavouriteBadge } from '@/components/favourite-customer';
import {
  IconBox,
  IconChart,
  IconFile,
  IconHandshake,
  IconInbox,
  IconQuote,
  IconTruck,
  IconUsers,
  IconWallet,
} from '@/components/icons';
import { formatMoney } from '@/lib/quotation-labels';
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

/** One row of GET /customers/rankings (issued and sent final invoices only, per currency). */
interface CustomerRankingRow {
  customer: { id: string; name: string; customerCode: string; status: string };
  currency: string | null;
  orders: number;
  invoicedAmount: string;
  lastInvoiceDate: string | null;
  favourite: boolean;
}

interface CustomerRankingsResponse {
  items: CustomerRankingRow[];
  favouritesAvailable: boolean;
}

/** Rankings fetch result: `unavailable` is the API's 409 while the favourites column is not yet in the database. */
type RankingsResult = { data: CustomerRankingsResponse } | { unavailable: true } | null;

function fetchRankings(view: 'top' | 'favourite'): Promise<RankingsResult> {
  return apiFetch<CustomerRankingsResponse>(`/customers/rankings?view=${view}&sortBy=invoiced&sortDir=desc&pageSize=5`).then(
    (data) => ({ data }),
    (error: unknown) => (error instanceof ApiError && error.status === 409 ? { unavailable: true as const } : null),
  );
}

const QUICK_LINKS = [
  { label: 'Vendors', href: '/vendors', permission: 'vendor.read', icon: IconHandshake },
  { label: 'Products', href: '/products', permission: 'product.read', icon: IconBox },
  { label: 'Customers', href: '/customers', permission: 'customer.read', icon: IconUsers },
  { label: 'Enquiries', href: '/enquiries', permission: 'enquiry.read', icon: IconInbox },
  { label: 'Quotations', href: '/quotations', permission: 'quotation.read', icon: IconQuote },
  { label: 'Invoices', href: '/final-invoices', permission: 'invoice.read', icon: IconFile },
  { label: 'Payments', href: '/payments', permission: 'payment.read', icon: IconWallet },
  { label: 'Deliveries', href: '/deliveries', permission: 'delivery.read', icon: IconTruck },
  { label: 'Reports', href: '/reports', permission: 'analytics.dashboard', icon: IconChart },
] as const;

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', { timeZone: BUSINESS_TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });

/** A section that failed to load shows a plain message rather than breaking the page. */
function SectionError({ what }: { what: string }) {
  return (
    <p role="alert" className="px-4 py-8 text-center text-sm text-danger">
      {what} could not be loaded. Refresh the page to try again.
    </p>
  );
}

function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-ink-muted">{children}</p>;
}

function ViewAll({ href, label = 'View all' }: { href: string; label?: string }) {
  return (
    <Link href={href} className="link-pill text-sm">
      {label}
    </Link>
  );
}

/** Customer ranking rows as a compact table. `numbered` is the top-customers ranking, which also flags favourites. */
function RankingTable({ rows, numbered }: { rows: CustomerRankingRow[]; numbered?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {numbered && <th scope="col" className="w-10">#</th>}
            <th scope="col">Customer</th>
            <th scope="col" className="text-right">Invoices</th>
            <th scope="col" className="text-right">Invoiced</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.customer.id}-${row.currency ?? 'none'}`}>
              {numbered && <td className="tabular-nums text-ink-subtle">{index + 1}</td>}
              <td>
                <Link href={`/customers/${row.customer.id}`} className="link-pill font-medium">
                  {row.customer.name}
                </Link>{' '}
                <span className="font-mono text-xs text-ink-subtle">{row.customer.customerCode}</span>
                {numbered && row.favourite && <FavouriteBadge />}
              </td>
              <td className="text-right tabular-nums">{row.orders || '—'}</td>
              <td className="whitespace-nowrap text-right tabular-nums">
                {row.currency && row.orders > 0 ? formatMoney(row.invoicedAmount, row.currency) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiCard({
  label,
  value,
  note,
  href,
  tone,
  failed,
}: {
  label: string;
  value: string;
  note?: string;
  href: string;
  tone: 'accent' | 'success' | 'warning' | 'info';
  /** The figure could not be loaded: shows a dash and an error note instead of a misleading 0. */
  failed?: boolean;
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
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{failed ? '—' : value}</p>
      {failed ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          Could not be loaded. Refresh to try again.
        </p>
      ) : (
        note && <p className="mt-1 text-sm text-ink-muted">{note}</p>
      )}
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

  const can = (permission: string) => permissions.includes(permission);
  const canSeeVendors = can('vendor.read');
  const canSeeCompanies = can('company.read');
  const canSeeProducts = can('product.read');
  const canSeeCustomers = can('customer.read');
  const quickLinks = QUICK_LINKS.filter((link) => can(link.permission));

  const [summary, companies, products, recent, paymentAlerts, sales, topSellers, recentCustomers, topCustomers, favouriteCustomers] = await Promise.all([
    canSeeVendors ? apiFetch<VendorSummary>('/vendors/summary').catch(() => null) : Promise.resolve(null),
    canSeeCompanies ? apiFetch<PaginatedResponse<Company>>('/companies?pageSize=1').catch(() => null) : Promise.resolve(null),
    canSeeProducts ? apiFetch<PaginatedResponse<Product>>('/products?pageSize=1').catch(() => null) : Promise.resolve(null),
    canSeeVendors
      ? apiFetch<PaginatedResponse<VendorListItem>>('/vendors?pageSize=5&sortBy=createdAt&sortDir=desc').catch(() => null)
      : Promise.resolve(null),
    permissions.includes('invoice.read') ? getPaymentAlerts().catch(() => null) : Promise.resolve(null),
    canSeeSales ? apiFetch<SalesResponse>(`/analytics/sales?preset=${range}`).catch(() => null) : Promise.resolve(null),
    canSeeTopSellers
      ? apiFetch<TopSellersResponse>(`/sales/top-sellers?preset=${range}`).catch(() => null)
      : Promise.resolve(null),
    canSeeCustomers
      ? apiFetch<PaginatedResponse<CustomerListItem>>('/customers?pageSize=5&sortBy=createdAt&sortDir=desc').catch(() => null)
      : Promise.resolve(null),
    canSeeCustomers ? fetchRankings('top') : Promise.resolve(null),
    canSeeCustomers ? fetchRankings('favourite') : Promise.resolve(null),
  ]);

  // Sales are reported per currency. The headline and chart use the first currency returned.
  const primary = sales?.totals[0] ?? null;
  const chartCurrency = primary?.currency ?? null;

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Business Overview</h1>
        </div>
        <RangeFilter current={range} />
      </header>

      {quickLinks.length > 0 && (
        <nav aria-label="Quick navigation" className="mb-4 flex flex-wrap gap-2">
          {quickLinks.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Icon size={16} className="text-accent" />
              {label}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeVendors && (
          <KpiCard
            label="Active vendors"
            value={summary ? String(summary.vendors.active) : '—'}
            note={summary ? `${summary.vendors.inactive} inactive` : undefined}
            failed={!summary}
            href="/vendors?status=ACTIVE"
            tone="accent"
          />
        )}
        {canSeeCompanies && (
          <KpiCard label="Brands" value={companies ? String(companies.meta.totalItems) : '—'} failed={!companies} href="/companies" tone="info" />
        )}
        {canSeeProducts && (
          <KpiCard label="Products" value={products ? String(products.meta.totalItems) : '—'} failed={!products} href="/products" tone="success" />
        )}
        {canSeeSales ? (
          <KpiCard
            label={`Invoiced sales · ${rangeLabel}`}
            value={primary ? `${primary.currency} ${Number(primary.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            note={primary ? `${primary.count} final invoice${primary.count === 1 ? '' : 's'}` : sales ? 'No invoices in this period' : undefined}
            failed={!sales}
            href="/final-invoices"
            tone="warning"
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {canSeeVendors && (
          <div className="min-w-0">
            <SectionCard
              title="Recently added vendors"
              padded={false}
              actions={
                <Link href="/vendors" className="link-pill text-sm">
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
                            <Link href={`/vendors/${vendor.id}`} className="link-pill font-medium">
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
        )}

        {canSeeSales && (
          <div className="min-w-0">
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

      {canSeeCustomers && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="min-w-0">
            <SectionCard title="Recent customers" description="Latest customers added" padded={false} actions={<ViewAll href="/customers" />}>
              {!recentCustomers ? (
                <SectionError what="Recent customers" />
              ) : recentCustomers.items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-ink-muted">No customers yet.</p>
                  {can('customer.create') && (
                    <Link href="/customers/new" className="btn-primary mt-4">
                      Add the first customer
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Customer</th>
                        <th scope="col">Location</th>
                        <th scope="col">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCustomers.items.map((customer) => {
                        const address = customer.addresses[0];
                        return (
                          <tr key={customer.id}>
                            <td>
                              <Link href={`/customers/${customer.id}`} className="link-pill font-medium">
                                {customer.name}
                              </Link>{' '}
                              <span className="font-mono text-xs text-ink-subtle">{customer.customerCode}</span>
                            </td>
                            <td>{address ? [address.city, address.state].filter(Boolean).join(', ') || address.country : '-'}</td>
                            <td className="whitespace-nowrap">{shortDate(customer.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="min-w-0">
            <SectionCard
              title="Top customers"
              description="By issued final invoices, all time"
              padded={false}
              actions={<ViewAll href="/customers?view=top" />}
            >
              {!topCustomers || 'unavailable' in topCustomers ? (
                <SectionError what="Top customers" />
              ) : topCustomers.data.items.length === 0 ? (
                <SectionEmpty>No final invoices have been issued yet.</SectionEmpty>
              ) : (
                <RankingTable rows={topCustomers.data.items} numbered />
              )}
            </SectionCard>
          </div>

          <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
            <SectionCard
              title="Favourite customers"
              description="Marked by an administrator"
              padded={false}
              actions={<ViewAll href="/customers?view=favourite" />}
            >
              {!favouriteCustomers ? (
                <SectionError what="Favourite customers" />
              ) : 'unavailable' in favouriteCustomers ? (
                <SectionEmpty>Favourite customers are not available yet. They appear here once the database update that adds them is applied.</SectionEmpty>
              ) : favouriteCustomers.data.items.length === 0 ? (
                <SectionEmpty>No favourite customers yet.</SectionEmpty>
              ) : (
                <RankingTable rows={favouriteCustomers.data.items} />
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {paymentAlerts && (
        <div className="mt-4">
          <SectionCard
            title="Payment due alerts"
            description="Current position, not limited to the selected range."
            padded={false}
            actions={
              <Link href="/final-invoices?pastDueOnly=true" className="link-pill text-sm">
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
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Outstanding in alerts</p>
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
            padded={false}
            actions={
              <Link href="/sales-history" className="link-pill text-sm">
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
