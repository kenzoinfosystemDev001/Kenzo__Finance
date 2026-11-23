import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerCategory, CustomerListItem, CustomerSummary, PaginatedResponse } from '@/lib/types';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { formatDate, formatPhone } from '@/lib/vendor-labels';
import { EmptyState, ErrorState, Pagination, StatCard, VendorStatusBadge } from '@/components/ui';
import { IconArrowDown, IconArrowUp, IconCheck, IconPause, IconPlus, IconSort, IconStar, IconUser, IconUsers, IconWarehouse } from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { CustomerToolbar } from './customer-toolbar';
import { CustomerRowActions } from './customer-row-actions';
import { CustomerRankingsView, CustomerViewTabs } from './customer-rankings-view';

export const metadata: Metadata = { title: 'Customer Management' };

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<'view' | 'search' | 'customerType' | 'categoryId' | 'industry' | 'status' | 'country' | 'state' | 'createdFrom' | 'createdTo' | 'sortBy' | 'sortDir' | 'page' | 'pageSize', string | undefined>;

const LIST_SORT_FIELDS = ['customerCode', 'name', 'customerType', 'status', 'createdAt', 'updatedAt'];

async function AllCustomersPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  // Only fields the API accepts; a stale or edited URL must not break the list.
  const sortBy = params.sortBy && LIST_SORT_FIELDS.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const filters = {
    search: params.search,
    customerType: params.customerType === 'BUSINESS' || params.customerType === 'INDIVIDUAL' ? params.customerType : undefined,
    categoryId: params.categoryId && UUID.test(params.categoryId) ? params.categoryId : undefined,
    industry: params.industry,
    status: params.status === 'ACTIVE' || params.status === 'INACTIVE' ? params.status : undefined,
    country: params.country,
    state: params.state,
    createdFrom: params.createdFrom && DATE.test(params.createdFrom) ? params.createdFrom : undefined,
    createdTo: params.createdTo && DATE.test(params.createdTo) ? params.createdTo : undefined,
  };

  let data: PaginatedResponse<CustomerListItem>;
  let summary: CustomerSummary | null;
  let categories: CustomerCategory[];
  try {
    [data, summary, categories] = await Promise.all([
      apiFetch<PaginatedResponse<CustomerListItem>>(`/customers${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<CustomerSummary>('/customers/summary').catch(() => null),
      apiFetch<CustomerCategory[]>('/customers/categories').catch(() => [] as CustomerCategory[]),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <CustomerHeader canCreate={false} canManageCategories={false} />
        <ErrorState title="Could not load customers" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('customer.export') && data.meta.totalItems > 0 ? `/customers/export${queryString({ ...filters, sortBy, sortDir })}` : null;
  const sortHref = (field: string) =>
    `/customers${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;
  const SortHeader = ({ field, label }: { field: string; label: string }) => {
    const active = sortBy === field;
    return (
      <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={sortHref(field)} scroll={false} className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-accent')}>
          {label}
          {active ? (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconSort size={12} className="opacity-40" />}
        </Link>
      </th>
    );
  };
  const firstRow = (data.meta.page - 1) * data.meta.pageSize;

  return (
    <div className="space-y-5">
      <CustomerHeader canCreate={can('customer.create')} canManageCategories={can('customer.read')} />

      {summary && (
        <section aria-label="Customer summary" className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Total Customers" value={summary.total} icon={<IconUsers size={22} />} iconClassName="bg-accent" />
          <StatCard label="Active Customers" value={summary.active} icon={<IconCheck size={22} />} iconClassName="bg-success" href="/customers?status=ACTIVE" />
          <StatCard label="Inactive Customers" value={summary.inactive} icon={<IconPause size={22} />} iconClassName="bg-danger" href="/customers?status=INACTIVE" />
          <StatCard label="Individual" value={summary.individual} icon={<IconUser size={22} />} iconClassName="bg-accent-hover" href="/customers?customerType=INDIVIDUAL" />
          <StatCard label="Business" value={summary.business} icon={<IconWarehouse size={22} />} iconClassName="bg-accent" href="/customers?customerType=BUSINESS" />
          <StatCard label="New This Month" value={summary.newThisMonth} icon={<IconStar size={22} />} iconClassName="bg-warning" />
        </section>
      )}

      <CustomerToolbar categories={categories} exportHref={exportHref} />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No customers match these filters' : 'No customers yet'}
            description={hasFilters ? 'Try another name, phone, email or city, or clear the filters.' : 'Add your first customer with its contacts and addresses.'}
            action={
              hasFilters ? (
                <Link href="/customers" className="btn-secondary">Clear filters</Link>
              ) : (
                can('customer.create') && <Link href="/customers/new" className="btn-primary"><IconPlus size={16} /> Add Customer</Link>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-10">#</th>
                    <SortHeader field="customerCode" label="Customer ID" />
                    <SortHeader field="name" label="Customer Name" />
                    <SortHeader field="customerType" label="Type" />
                    <th scope="col">Primary Contact</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Email</th>
                    <th scope="col">City</th>
                    <th scope="col">Country</th>
                    <SortHeader field="status" label="Status" />
                    <SortHeader field="createdAt" label="Created Date" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((customer, index) => {
                    const contact = customer.contacts[0];
                    const address = customer.addresses[0];
                    const dash = <span className="text-ink-subtle">&mdash;</span>;
                    return (
                      <tr key={customer.id}>
                        <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                        <td className="whitespace-nowrap font-mono text-sm text-ink-muted">{customer.customerCode}</td>
                        <td className="min-w-[180px]">
                          <Link href={`/customers/${customer.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{customer.name}</Link>
                          {customer.category && <p className="text-xs text-ink-subtle">{customer.category.name}</p>}
                        </td>
                        <td>{CUSTOMER_TYPE_LABELS[customer.customerType]}</td>
                        <td className="whitespace-nowrap">{contact?.name ?? dash}</td>
                        <td className="whitespace-nowrap tabular-nums">{contact?.phone ? formatPhone(contact.phone) : dash}</td>
                        <td className="max-w-[220px] truncate">{contact?.email ?? dash}</td>
                        <td>{address?.city ?? dash}</td>
                        <td>{address?.country ?? dash}</td>
                        <td><VendorStatusBadge status={customer.status} /></td>
                        <td className="whitespace-nowrap">{formatDate(customer.createdAt)}</td>
                        <td><CustomerRowActions customer={{ id: customer.id, name: customer.name, status: customer.status }} permissions={permissions} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/customers"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="customers"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CustomerHeader({ canCreate, canManageCategories }: { canCreate: boolean; canManageCategories: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent"><IconUsers size={26} /></span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Customer Management</h1>
          <p className="text-base text-ink-muted">Manage customers, contacts, business details and relationships.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canManageCategories && <Link href="/customers/categories" className="btn-secondary h-11 px-4">Categories</Link>}
        {canCreate && <Link href="/customers/new" className="btn-primary h-11 px-5 text-base"><IconPlus size={18} /> Add Customer</Link>}
      </div>
    </div>
  );
}

/** Customer Management: the All list, or the Top and Favourite rankings. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Partial<Params>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  if (params.view === "top" || params.view === "favourite") {
    return (
      <CustomerRankingsView
        view={params.view}
        params={params}
        canManage={permissions.includes("settings.manage")}
        canCreate={permissions.includes("customer.create")}
      />
    );
  }
  return (
    <>
      <CustomerViewTabs active="all" />
      {await AllCustomersPage({ searchParams: Promise.resolve(params) })}
    </>
  );
}
