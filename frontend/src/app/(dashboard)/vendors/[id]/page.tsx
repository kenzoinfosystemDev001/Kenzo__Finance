import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  ActivityEntry,
  PaginatedResponse,
  ProductCategory,
  VendorDetail,
} from '@/lib/types';
import {
  activityLabel,
  ADDRESS_TYPE_LABELS,
  CONTACT_TYPE_LABELS,
  formatAddress,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs, VendorStatusBadge } from '@/components/ui';
import {
  IconArrowRight,
  IconBox,
  IconChevronLeft,
  IconClock,
  IconFile,
  IconGlobe,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconTag,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { VendorRowActions } from '../vendor-row-actions';
import { ContactsPanel } from './contacts-panel';
import { AddressesPanel } from './addresses-panel';
import { BrandsPanel, ProductsPanel } from './mappings-panel';
import { DocumentsPanel } from './documents-panel';
import { EmptyStateClient } from '@/components/panel-shared';

const TAB_KEYS = ['overview', 'contacts', 'addresses', 'brands', 'products', 'documents', 'activity'] as const;
type TabKey = (typeof TAB_KEYS)[number];

async function loadVendor(id: string): Promise<VendorDetail> {
  try {
    return await apiFetch<VendorDetail>(`/vendors/${id}`);
  } catch (error) {
    // 400 = not a valid id; same answer as "no such vendor".
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const vendor = await apiFetch<VendorDetail>(`/vendors/${id}`);
    return { title: vendor.businessName };
  } catch {
    return { title: 'Vendor' };
  }
}

export default async function VendorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab: TabKey = TAB_KEYS.includes(query.tab as TabKey) ? (query.tab as TabKey) : 'overview';

  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);

  const vendor = await loadVendor(id);
  const archived = Boolean(vendor.archivedAt);

  const tabHref = (key: TabKey) => `/vendors/${vendor.id}${key === 'overview' ? '' : `?tab=${key}`}`;
  const primaryContact =
    vendor.contacts.find((c) => c.isPrimary && c.contactType === 'GENERAL') ?? vendor.contacts.find((c) => c.isPrimary);
  const primaryAddress = vendor.addresses.find((a) => a.isPrimary);

  return (
    <div className="space-y-5">
      <Link href="/vendors" className="link-pill-neutral text-sm">
        <IconChevronLeft size={16} /> All vendors
      </Link>

      {query.created && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">
          Vendor created. Add documents, more contacts or product details below.
        </p>
      )}
      {query.updated && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">
          Changes saved.
        </p>
      )}
      {archived && (
        <p className="rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm text-ink-muted">
          This vendor is archived. Its record and history are preserved, but it cannot be edited until it is restored.
        </p>
      )}

      {/* Profile header ------------------------------------------------------ */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white">
              {vendor.businessName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink">{vendor.businessName}</h1>
                <VendorStatusBadge status={vendor.status} archivedAt={vendor.archivedAt} />
              </div>
              <p className="mt-0.5 text-sm text-ink-muted">
                <span className="font-mono">{vendor.vendorCode}</span>
                {vendor.category && <> &middot; {vendor.category.name}</>}
                {vendor.legalName && <> &middot; {vendor.legalName}</>}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-muted">
                {(vendor.phone ?? primaryContact?.phone) && (
                  <li className="inline-flex items-center gap-1.5"><IconPhone size={14} /> {formatPhone(vendor.phone ?? primaryContact?.phone)}</li>
                )}
                {(vendor.email ?? primaryContact?.email) && (
                  <li className="inline-flex items-center gap-1.5"><IconMail size={14} /> {vendor.email ?? primaryContact?.email}</li>
                )}
                {vendor.website && (
                  <li className="inline-flex items-center gap-1.5"><IconGlobe size={14} /> {vendor.website}</li>
                )}
                {primaryAddress?.city && (
                  <li className="inline-flex items-center gap-1.5"><IconMapPin size={14} /> {[primaryAddress.city, primaryAddress.state].filter(Boolean).join(', ')}</li>
                )}
              </ul>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can('vendor.update') && !archived && (
              <Link href={`/vendors/${vendor.id}/edit`} className="btn-primary">
                <IconPencil size={16} /> Edit Vendor
              </Link>
            )}
            <VendorRowActions
              vendor={{ id: vendor.id, businessName: vendor.businessName, status: vendor.status, archivedAt: vendor.archivedAt }}
              permissions={permissions}
              compact={false}
              afterDelete="list"
            />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          {[
            { label: 'Contacts', value: vendor.contacts.length, icon: <IconUsers size={16} />, tab: 'contacts' as const },
            { label: 'Brands', value: vendor.companies.length, icon: <IconTag size={16} />, tab: 'brands' as const },
            { label: 'Products', value: vendor.products.length, icon: <IconBox size={16} />, tab: 'products' as const },
            { label: 'Documents', value: vendor.documents.length, icon: <IconFile size={16} />, tab: 'documents' as const },
          ].map((item) => (
            <Link key={item.label} href={tabHref(item.tab)} scroll={false} className="rounded-lg bg-accent-subtle/50 px-3 py-2 transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-subtle">{item.icon}{item.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-ink">{item.value}</dd>
            </Link>
          ))}
        </dl>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: tabHref('overview') },
          { key: 'contacts', label: 'Contacts', href: tabHref('contacts'), count: vendor.contacts.length },
          { key: 'addresses', label: 'Addresses', href: tabHref('addresses'), count: vendor.addresses.length },
          { key: 'brands', label: 'Brands', href: tabHref('brands'), count: vendor.companies.length },
          { key: 'products', label: 'Products & Models', href: tabHref('products'), count: vendor.products.length },
          { key: 'documents', label: 'Documents', href: tabHref('documents'), count: vendor.documents.length },
          { key: 'activity', label: 'Activity History', href: tabHref('activity') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card p-5 xl:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-ink">Vendor information</h2>
            <DefinitionList
              items={[
                { label: 'Vendor code', value: <span className="font-mono">{vendor.vendorCode}</span> },
                { label: 'Vendor type', value: vendor.category?.name },
                { label: 'Registered legal name', value: vendor.legalName },
                { label: 'Registration number', value: vendor.registrationNumber },
                { label: 'GSTIN', value: vendor.gstin && <span className="font-mono">{vendor.gstin}</span> },
                { label: 'PAN', value: vendor.pan && <span className="font-mono">{vendor.pan}</span> },
                { label: 'Company phone', value: formatPhone(vendor.phone) },
                { label: 'Alternate phone', value: formatPhone(vendor.alternatePhone) },
                { label: 'Company email', value: vendor.email },
                { label: 'Alternate email', value: vendor.alternateEmail },
                { label: 'Website', value: vendor.website },
                { label: 'Status', value: <VendorStatusBadge status={vendor.status} archivedAt={vendor.archivedAt} /> },
              ]}
            />
            {vendor.notes && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Description</p>
                <p className="mt-1 whitespace-pre-line text-base text-ink">{vendor.notes}</p>
              </div>
            )}
          </section>

          <div className="space-y-5">
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><IconUser size={16} className="text-accent" /> Primary contact</h2>
              {primaryContact ? (
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-ink">{primaryContact.name}</p>
                  <p className="text-ink-muted">
                    {[primaryContact.designation, CONTACT_TYPE_LABELS[primaryContact.contactType]].filter(Boolean).join(' · ')}
                  </p>
                  {primaryContact.phone && <p className="text-ink">{formatPhone(primaryContact.phone)}</p>}
                  {primaryContact.email && <p className="text-ink">{primaryContact.email}</p>}
                </div>
              ) : (
                <p className="text-sm text-ink-subtle">No contact person recorded.</p>
              )}
              <Link href={tabHref('contacts')} scroll={false} className="link-pill mt-3 text-sm font-medium">
                All contacts <IconArrowRight size={14} />
              </Link>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><IconMapPin size={16} className="text-accent" /> Primary address</h2>
              {primaryAddress ? (
                <address className="text-sm not-italic leading-relaxed text-ink">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    {ADDRESS_TYPE_LABELS[primaryAddress.addressType]}
                  </span>
                  {formatAddress(primaryAddress).map((line) => <span key={line} className="block">{line}</span>)}
                </address>
              ) : (
                <p className="text-sm text-ink-subtle">No address recorded.</p>
              )}
              <Link href={tabHref('addresses')} scroll={false} className="link-pill mt-3 text-sm font-medium">
                All addresses <IconArrowRight size={14} />
              </Link>
            </section>

            <section className="card p-5 text-sm">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink"><IconClock size={16} className="text-accent" /> Record</h2>
              <p className="text-ink-muted">Created {formatDateTime(vendor.createdAt)}{vendor.createdBy && ` by ${vendor.createdBy.fullName}`}</p>
              <p className="text-ink-muted">Last updated {formatDateTime(vendor.updatedAt)}{vendor.updatedBy && ` by ${vendor.updatedBy.fullName}`}</p>
            </section>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <ContactsPanel vendorId={vendor.id} contacts={vendor.contacts} canManage={can('vendor.manage_contacts') && !archived} />
      )}

      {tab === 'addresses' && (
        <AddressesPanel vendorId={vendor.id} addresses={vendor.addresses} canManage={can('vendor.manage_addresses') && !archived} />
      )}

      {tab === 'brands' && (
        <BrandsPanel
          vendorId={vendor.id}
          mappings={vendor.companies}
          products={vendor.products}
          canManage={can('vendor.manage_brands') && !archived}
          canCreateBrand={can('company.create')}
        />
      )}

      {tab === 'products' && (
        <ProductsPanel
          vendorId={vendor.id}
          mappings={vendor.products}
          brandIds={vendor.companies.map((c) => c.companyId)}
          canManage={can('vendor.manage_products') && !archived}
          canManageBrands={can('vendor.manage_brands')}
          canCreateProduct={can('product.create')}
          productCategories={
            can('product.create') && !archived
              ? await apiFetch<ProductCategory[]>('/products/categories').catch(() => [])
              : []
          }
        />
      )}

      {tab === 'documents' && (
        <DocumentsPanel
          vendorId={vendor.id}
          documents={vendor.documents}
          canManage={can('vendor.manage_documents') && !archived}
          canDownload={can('document.download')}
        />
      )}

      {tab === 'activity' && <ActivityTab vendorId={vendor.id} page={query.page} />}
    </div>
  );
}

async function ActivityTab({ vendorId, page }: { vendorId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(
      `/vendors/${vendorId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`,
    );
  } catch (error) {
    return (
      <ErrorState
        title="Could not load activity"
        message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'}
      />
    );
  }

  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Activity history</h2>
        <p className="text-sm text-ink-muted">Recorded from the audit log &mdash; every change to this vendor and its contacts, addresses, mappings and documents.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this vendor will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle" title={formatDateTime(entry.createdAt)}>
                      {formatDate(entry.createdAt)} &middot; {new Date(entry.createdAt).toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/vendors/${vendorId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
