import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { Company, PaginatedResponse, Product, VendorListItem, VendorSummary } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui';

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
      <PageHeader
        title={`Welcome, ${user?.fullName.split(' ')[0] ?? 'there'}`}
        description="Vendor management is live. Sales, invoicing and delivery modules follow in later phases."
      />

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
    </>
  );
}
