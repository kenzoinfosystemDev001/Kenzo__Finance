import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerListItem, PaginatedResponse, VendorListItem } from '@/lib/types';
import { Badge, EmptyState, ErrorState, Pagination, PageHeader, SectionCard } from '@/components/ui';
import { CustomerRowActions } from '../customers/customer-row-actions';
import { VendorRowActions } from '../vendors/vendor-row-actions';
import { FavouriteBadge } from '@/components/favourite-customer';
import { formatMoney } from '@/lib/quotation-labels';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { MODULE_DIRECTORY } from './admin-directory';

export const metadata: Metadata = { title: 'Admin Console' };

const SECTIONS = [
  { key: 'modules', label: 'All modules' },
  { key: 'customers', label: 'Manage customers' },
  { key: 'vendors', label: 'Manage vendors' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];
const PAGE_SIZES = [10, 25, 50];

interface CustomerRankingRow {
  customer: { id: string; name: string; customerCode: string; status: string };
  currency: string | null;
  orders: number;
  invoicedAmount: string;
  favourite: boolean;
}

interface CustomerRankingsResponse {
  items: CustomerRankingRow[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
}

/**
 * Admin Console: one place to reach every module, and to manage customer and
 * vendor records in the same shared tables the modules use. Administrators
 * only. Nothing here copies data: the lists come from the same APIs, and the
 * actions are the modules' own.
 */
/** Create actions read as "add"; everything else is navigation. */
const moduleLinkClass = (label: string) =>
  /^(Add|New|Record|Import|Create)/.test(label) ? 'link-pill-create' : 'link-pill';

export default async function AdminConsolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const isAdmin = (user?.roles ?? []).includes('SUPER_ADMIN') || permissions.includes('settings.manage');

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Admin Console" />
        <EmptyState title="Administrators only" description="The Admin Console is available to administrators. Ask one if you need access." />
      </div>
    );
  }

  const section: Section = SECTIONS.some((s) => s.key === p.s) ? (p.s as Section) : 'modules';
  const pageSize = PAGE_SIZES.includes(Number(p.pageSize)) ? Number(p.pageSize) : 10;
  const page = Math.max(1, Number.parseInt(p.page ?? '1', 10) || 1);
  const q = p.q?.trim() || undefined;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Admin Console"
      />

      <nav aria-label="Admin sections" className="flex max-w-full flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={s.key === 'modules' ? '/admin' : `/admin?s=${s.key}`}
            aria-current={section === s.key ? 'page' : undefined}
            className="tab-link font-semibold"
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {section === 'modules' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {MODULE_DIRECTORY.map((module) => ({
            ...module,
            links: module.links.filter((link) => !link.permission || permissions.includes(link.permission)),
          }))
            .filter((module) => module.links.length > 0)
            .map((module) => (
            <SectionCard key={module.title} title={module.title}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {module.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className={`${moduleLinkClass(link.label)} group flex w-full justify-between px-3 py-2 text-base`}
                    >
                      <span className="min-w-0 truncate">{link.label}</span>
                      <span aria-hidden className="opacity-40 transition-opacity group-hover:opacity-100">&rarr;</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}

      {section === 'customers' && (
        <CustomersSection page={page} pageSize={pageSize} q={q} permissions={permissions} />
      )}

      {section === 'vendors' && (
        <VendorsSection page={page} pageSize={pageSize} q={q} permissions={permissions} />
      )}
    </div>
  );
}

async function CustomersSection({ page, pageSize, q, permissions }: { page: number; pageSize: number; q?: string; permissions: string[] }) {
  let data: CustomerRankingsResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<CustomerRankingsResponse>(`/customers/rankings${queryString({ view: 'all', search: q, page, pageSize })}`);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.messages[0] : 'Customers could not be loaded.';
  }
  const canCreate = permissions.includes('customer.create');
  return (
    <SectionCard
      title="Customers"
      description="Deletion is refused while a customer has invoices or other records."
      padded={false}
      actions={canCreate ? <Link href="/customers/new" className="btn-primary">Add customer</Link> : undefined}
    >
      <form method="get" role="search" className="flex flex-wrap items-end gap-2 border-b border-border p-4">
        <input type="hidden" name="s" value="customers" />
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          Search
          <input name="q" defaultValue={q ?? ''} className="field-input h-9" />
        </label>
        <button type="submit" className="btn-secondary h-9">Search</button>
      </form>
      {error ? (
        <div className="p-4"><ErrorState title="Customers unavailable" message={error} /></div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No customers found" description={q ? 'Try a different search.' : 'Customers you add appear here.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col" className="text-right">Orders</th>
                  <th scope="col" className="text-right">Invoiced</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={`${row.customer.id}-${row.currency ?? 'none'}`}>
                    <td>
                      <Link href={`/customers/${row.customer.id}`} className="link-pill font-medium">{row.customer.name}</Link>
                      <span className="ml-2 font-mono text-xs text-ink-subtle">{row.customer.customerCode}</span>
                      {row.favourite && <FavouriteBadge />}
                      {row.customer.status !== 'ACTIVE' && <span className="ml-2"><Badge>Inactive</Badge></span>}
                    </td>
                    <td className="text-right tabular-nums">{row.orders || '—'}</td>
                    <td className="text-right tabular-nums">{row.currency ? formatMoney(row.invoicedAmount, row.currency) : '—'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/customers/${row.customer.id}/edit`} className="link-pill-neutral text-sm">Edit</Link>
                        <CustomerRowActions
                          customer={{ id: row.customer.id, name: row.customer.name, status: row.customer.status as CustomerListItem['status'] }}
                          permissions={permissions}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border p-3">
            <Pagination
              meta={data.meta}
              basePath="/admin"
              params={{ s: 'customers', q, pageSize: String(pageSize) }}
              noun="customers"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </div>
        </>
      )}
    </SectionCard>
  );
}

async function VendorsSection({ page, pageSize, q, permissions }: { page: number; pageSize: number; q?: string; permissions: string[] }) {
  let data: PaginatedResponse<VendorListItem> | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<PaginatedResponse<VendorListItem>>(`/vendors${queryString({ search: q, page, pageSize })}`);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.messages[0] : 'Vendors could not be loaded.';
  }
  const canCreate = permissions.includes('vendor.create');
  return (
    <SectionCard
      title="Vendors"
      description="Deletion is refused while a vendor is in use."
      padded={false}
      actions={canCreate ? <Link href="/vendors/new" className="btn-primary">Add vendor</Link> : undefined}
    >
      <form method="get" role="search" className="flex flex-wrap items-end gap-2 border-b border-border p-4">
        <input type="hidden" name="s" value="vendors" />
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          Search
          <input name="q" defaultValue={q ?? ''} className="field-input h-9" />
        </label>
        <button type="submit" className="btn-secondary h-9">Search</button>
      </form>
      {error ? (
        <div className="p-4"><ErrorState title="Vendors unavailable" message={error} /></div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No vendors found" description={q ? 'Try a different search.' : 'Vendors you add appear here.'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Location</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((vendor) => (
                  <tr key={vendor.id}>
                    <td className="font-mono text-sm text-ink-muted">{vendor.vendorCode}</td>
                    <td>
                      <Link href={`/vendors/${vendor.id}`} className="link-pill font-medium">{vendor.businessName}</Link>
                    </td>
                    <td>{[vendor.city, vendor.state].filter(Boolean).join(', ') || '—'}</td>
                    <td>{vendor.status === 'ACTIVE' ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/vendors/${vendor.id}/edit`} className="link-pill-neutral text-sm">Edit</Link>
                        <VendorRowActions vendor={vendor} permissions={permissions} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border p-3">
            <Pagination
              meta={data.meta}
              basePath="/admin"
              params={{ s: 'vendors', q, pageSize: String(pageSize) }}
              noun="vendors"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </div>
        </>
      )}
    </SectionCard>
  );
}
