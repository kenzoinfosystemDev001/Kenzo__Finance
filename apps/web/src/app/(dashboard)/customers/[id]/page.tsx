import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, CustomerAddress, CustomerDetail, PaginatedResponse } from '@/lib/types';
import { CUSTOMER_ADDRESS_TYPE_LABELS, CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { activityLabel, formatAddress, formatDate, formatDateTime, formatPhone } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs, VendorStatusBadge } from '@/components/ui';
import { EmptyStateClient } from '@/components/panel-shared';
import { IconChevronLeft, IconPencil, IconUser, IconWarehouse } from '@/components/icons';
import { CustomerRowActions } from '../customer-row-actions';
import { CustomerAddressesPanel, CustomerContactsPanel, CustomerDocumentsPanel, CustomerProductsPanel } from './customer-panels';

const TABS = ['overview', 'contacts', 'addresses', 'products', 'documents', 'activity', 'transactions'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const customer = await apiFetch<CustomerDetail>(`/customers/${id}`).catch(() => null);
  return { title: customer?.name ?? 'Customer' };
}

function AddressBlock({ title, address }: { title: string; address?: CustomerAddress }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</p>
      {address ? (
        <address className="mt-1 text-sm not-italic leading-relaxed text-ink">
          {formatAddress(address).map((line) => <span key={line} className="block">{line}</span>)}
        </address>
      ) : (
        <p className="mt-1 text-sm text-ink-subtle">Not provided</p>
      )}
    </div>
  );
}

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (p: string) => permissions.includes(p);

  let customer: CustomerDetail;
  try {
    customer = await apiFetch<CustomerDetail>(`/customers/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'overview';
  const href = (t: Tab) => `/customers/${customer.id}${t === 'overview' ? '' : `?tab=${t}`}`;
  const primary = customer.contacts.find((c) => c.isPrimary);
  const defaultOf = (type: CustomerAddress['addressType']) =>
    customer.addresses.find((a) => a.addressType === type && a.isDefault) ?? customer.addresses.find((a) => a.addressType === type);
  const business = customer.customerType === 'BUSINESS';

  return (
    <div className="space-y-5">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-accent"><IconChevronLeft size={16} /> All customers</Link>
      {query.created && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Customer created. Add documents, more contacts or products of interest below.</p>}
      {query.updated && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Changes saved.</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              {business ? <IconWarehouse size={28} /> : <IconUser size={28} />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink">{customer.name}</h1>
                <span className="chip font-mono">{customer.customerCode}</span>
                <VendorStatusBadge status={customer.status} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {CUSTOMER_TYPE_LABELS[customer.customerType]}
                {customer.category && <> &middot; {customer.category.name}</>}
                {customer.industry && <> &middot; {customer.industry}</>}
              </p>
              {primary && (
                <p className="mt-2 text-sm text-ink-muted">
                  {primary.name}
                  {primary.phone && <> &middot; {formatPhone(primary.phone)}</>}
                  {primary.email && <> &middot; {primary.email}</>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can('customer.update') && <Link href={`/customers/${customer.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit</Link>}
            <CustomerRowActions customer={{ id: customer.id, name: customer.name, status: customer.status }} permissions={permissions} compact={false} afterDelete="list" />
          </div>
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: href('overview') },
          { key: 'contacts', label: 'Contacts', href: href('contacts'), count: customer.contacts.length },
          { key: 'addresses', label: 'Addresses', href: href('addresses'), count: customer.addresses.length },
          { key: 'products', label: 'Products of Interest', href: href('products'), count: customer.interests.length },
          { key: 'documents', label: 'Documents', href: href('documents'), count: customer.documents.length },
          { key: 'activity', label: 'Activity History', href: href('activity') },
          { key: 'transactions', label: 'Business Transactions', href: href('transactions') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Customer information</h2>
            <DefinitionList
              items={[
                { label: 'Customer ID', value: <span className="font-mono">{customer.customerCode}</span> },
                { label: 'Customer type', value: CUSTOMER_TYPE_LABELS[customer.customerType] },
                { label: 'Category', value: customer.category?.name },
                { label: 'Industry', value: customer.industry },
                { label: 'Website', value: customer.website },
                { label: 'Status', value: <VendorStatusBadge status={customer.status} /> },
              ]}
            />
            {customer.description && <p className="mt-4 whitespace-pre-line border-t border-border pt-3 text-sm text-ink">{customer.description}</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Contact &amp; tax details</h2>
            <DefinitionList
              items={[
                { label: 'Primary contact', value: primary && `${primary.name}${primary.designation ? `, ${primary.designation}` : ''}` },
                { label: 'Phone', value: formatPhone(primary?.phone) },
                { label: 'Email', value: primary?.email },
                { label: 'Tax country', value: customer.taxCountry },
                { label: 'GSTIN', value: customer.gstin && <span className="font-mono">{customer.gstin}</span> },
                { label: 'PAN', value: customer.pan && <span className="font-mono">{customer.pan}</span> },
                ...(business ? [{ label: 'CIN', value: customer.cin && <span className="font-mono">{customer.cin}</span> }] : []),
                { label: 'Tax registration no.', value: customer.taxRegistrationNumber },
              ]}
            />
            {customer.otherRegistration && <p className="mt-4 border-t border-border pt-3 text-sm text-ink-muted">{customer.otherRegistration}</p>}
          </section>
          <div className="space-y-5">
            <section className="card space-y-4 p-5">
              <h2 className="text-lg font-semibold text-ink">Addresses</h2>
              <AddressBlock title={CUSTOMER_ADDRESS_TYPE_LABELS.BILLING} address={defaultOf('BILLING')} />
              <AddressBlock title={CUSTOMER_ADDRESS_TYPE_LABELS.SHIPPING} address={defaultOf('SHIPPING')} />
            </section>
            {business && (customer.companySize || customer.businessType || customer.annualTurnoverRange || customer.employeeCount) && (
              <section className="card p-5 text-sm">
                <h2 className="mb-3 text-base font-semibold text-ink">Business profile</h2>
                {customer.businessType && <p className="text-ink-muted">Business type: <span className="text-ink">{customer.businessType}</span></p>}
                {customer.companySize && <p className="text-ink-muted">Company size: <span className="text-ink">{customer.companySize} employees</span></p>}
                {customer.employeeCount !== null && <p className="text-ink-muted">Employees: <span className="text-ink">{customer.employeeCount}</span></p>}
                {customer.annualTurnoverRange && <p className="text-ink-muted">Turnover: <span className="text-ink">{customer.annualTurnoverRange}</span></p>}
              </section>
            )}
            <section className="card p-5 text-sm">
              <h2 className="mb-3 text-base font-semibold text-ink">Record</h2>
              <p className="text-ink-muted">Created {formatDateTime(customer.createdAt)}{customer.createdBy && ` by ${customer.createdBy.fullName}`}</p>
              <p className="text-ink-muted">Last updated {formatDateTime(customer.updatedAt)}{customer.updatedBy && ` by ${customer.updatedBy.fullName}`}</p>
            </section>
          </div>
        </div>
      )}

      {tab === 'contacts' && <CustomerContactsPanel customer={customer} canManage={can('customer.manage_contacts')} />}
      {tab === 'addresses' && <CustomerAddressesPanel customer={customer} canManage={can('customer.manage_addresses')} />}
      {tab === 'products' && <CustomerProductsPanel customer={customer} canManage={can('customer.manage_products') && can('product.read')} canViewProducts={can('product.read')} />}
      {tab === 'documents' && (
        <CustomerDocumentsPanel customer={customer} canUpload={can('customer.upload_documents')} canRemove={can('customer.delete_documents')} canDownload={can('document.download')} />
      )}
      {tab === 'activity' && <ActivityTab customerId={customer.id} page={query.page} />}
      {tab === 'transactions' && (
        <section className="card p-6">
          <h2 className="text-lg font-semibold text-ink">Business transactions</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Enquiries, quotations, proforma invoices, payments and deliveries for this customer will appear here, linked by
            customer ID {customer.customerCode}. Those modules are not built yet, so there is nothing to show.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {['Enquiries', 'Quotations', 'Proforma Invoices', 'Payments', 'Deliveries'].map((label) => (
              <li key={label} className="rounded-xl border border-dashed border-border-strong px-4 py-3">
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="text-xs text-ink-subtle">Module not yet available</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

async function ActivityTab({ customerId, page }: { customerId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/customers/${customerId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Activity history</h2>
        <p className="text-sm text-ink-muted">From the audit log &mdash; the customer, its contacts, addresses, products of interest and documents.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this customer will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDate(entry.createdAt)} &middot; {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/customers/${customerId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
