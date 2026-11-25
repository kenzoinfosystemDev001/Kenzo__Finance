import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { Company, PaginatedResponse, Product, VendorListItem, VendorSummary } from '@/lib/types';
import { SectionCard } from '@/components/ui';
import { PaymentAlertTable } from '@/components/payment-alert-rows';
import { getPaymentAlerts } from '@/lib/payment-alerts';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Module 1 dashboard.
 *
 * Every figure is a real count from the database. Metrics that belong to
 * later modules (quotations, receivables, deliveries) are deliberately absent
 * rather than shown as zero - a zero would read as "nothing outstanding".
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  const [summary, companies, products] = await Promise.all([
    permissions.includes('vendor.read')
      ? apiFetch<VendorSummary>('/vendors/summary').catch(() => null)
      : Promise.resolve(null),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=1').catch(() => null),
    apiFetch<PaginatedResponse<Product>>('/products?pageSize=1').catch(() => null),
  ]);

  const recent = await apiFetch<PaginatedResponse<VendorListItem>>(
    '/vendors?pageSize=5&sortBy=createdAt&sortDir=desc',
  ).catch(() => null);

  const paymentAlerts = permissions.includes('invoice.read') ? await getPaymentAlerts() : null;
  const topSellers = permissions.includes('analytics.products') && permissions.includes('analytics.invoices')
    ? await apiFetch<{ byValue: Array<{ productId: string; name: string; productCode: string; currency: string; quantity: number; saleAmount: string }> }>('/sales/top-sellers?preset=thisMonth').catch(() => null)
    : null;

  const stats = [
    {
      label: 'Active vendors',
      value: summary?.vendors.active ?? 0,
      href: '/vendors?status=ACTIVE',
      note: summary
        ? `${summary.vendors.inactive} inactive${summary.vendors.archived ? `, ${summary.vendors.archived} archived` : ''}`
        : undefined,
    },
    { label: 'Brands', value: companies?.meta.totalItems ?? 0, href: '/companies' },
    { label: 'Products', value: products?.meta.totalItems ?? 0, href: '/products' },
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Welcome</h1>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href} className="card p-4 hover:border-border-strong">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
              {stat.label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">
              {stat.value}
            </p>
            {stat.note && <p className="mt-0.5 text-sm text-ink-subtle">{stat.note}</p>}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        <SectionCard
          title="Recently added vendors"
          padded={false}
          actions={
            <Link href="/vendors" className="text-sm text-accent hover:underline">
              View all
            </Link>
          }
        >
          {!recent || recent.items.length === 0 ? (
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
                    <th scope="col" className="text-right">
                      Products
                    </th>
                    <th scope="col">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.items.map((vendor) => (
                    <tr key={vendor.id}>
                      <td className="whitespace-nowrap font-mono text-sm text-ink-muted">
                        {vendor.vendorCode}
                      </td>
                      <td>
                        <Link
                          href={`/vendors/${vendor.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {vendor.businessName}
                        </Link>
                      </td>
                      <td>
                        {[vendor.city, vendor.state].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="text-right tabular-nums">
                        {vendor._count.products}
                      </td>
                      <td className="whitespace-nowrap">
                        {new Date(vendor.createdAt).toLocaleDateString('en-IN', { timeZone: BUSINESS_TIME_ZONE,
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
      {paymentAlerts && (
        <div className="mt-4">
          <SectionCard
            title="Payment due alerts"
            padded={false}
            actions={
              <Link href="/final-invoices?pastDueOnly=true" className="text-sm text-accent hover:underline">
                View overdue
              </Link>
            }
          >
            <div className="grid grid-cols-2 gap-3 border-b border-border p-4 sm:grid-cols-4">
              <div className="rounded-lg border border-danger/30 bg-danger-subtle p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-danger">Overdue</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-danger">{paymentAlerts.summary.overdue}</p>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-warning">Due today</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-warning">{paymentAlerts.summary.dueToday}</p>
              </div>
              <div className="rounded-lg border border-accent/25 bg-accent-subtle p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-accent">Due in 5 days</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-accent">{paymentAlerts.summary.dueSoon}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Still outstanding</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{paymentAlerts.summary.totalOutstanding}</p>
              </div>
            </div>
            {paymentAlerts.alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No payment is due within five days and nothing is overdue.</p>
            ) : (
              <PaymentAlertTable alerts={paymentAlerts.alerts.slice(0, 10)} />
            )}
          </SectionCard>
        </div>
      )}
      {topSellers && (
        <div className="mt-4">
          <SectionCard
            title="Top-selling products this month"
            padded={false}
            actions={<Link href="/sales-history" className="text-sm text-accent hover:underline">Sales history</Link>}
          >
            {topSellers.byValue.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No product sales recorded this month yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {topSellers.byValue.slice(0, 5).map((r, i) => (
                  <li key={`${r.productId}-${r.currency}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate"><span className="mr-2 tabular-nums text-ink-subtle">{i + 1}.</span><span className="font-medium">{r.name}</span> <span className="font-mono text-xs text-ink-subtle">{r.productCode}</span></span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{r.quantity} units · {r.currency} {r.saleAmount}</span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}
