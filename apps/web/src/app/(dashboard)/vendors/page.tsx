import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  Company,
  PaginatedResponse,
  Product,
  VendorListItem,
  VendorSummary,
} from '@/lib/types';
import { formatDate, formatPhone } from '@/lib/vendor-labels';
import {
  EmptyState,
  ErrorState,
  Pagination,
  StatCard,
  VendorStatusBadge,
} from '@/components/ui';
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconBox,
  IconCheck,
  IconHandshake,
  IconPause,
  IconPlus,
  IconScan,
  IconSort,
  IconTag,
  IconUsers,
} from '@/components/icons';
import { PageSizeSelect, VendorToolbar } from './vendor-toolbar';
import { VendorRowActions } from './vendor-row-actions';

export const metadata: Metadata = { title: 'Vendor Management' };

interface SearchParams {
  search?: string;
  status?: string;
  companyId?: string;
  productId?: string;
  includeArchived?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
  pageSize?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f-]{36}$/i;

export default async function VendorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy ?? 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const companyId = params.companyId && UUID.test(params.companyId) ? params.companyId : undefined;
  const productId = params.productId && UUID.test(params.productId) ? params.productId : undefined;

  const filters = {
    search: params.search,
    status: params.status === 'ACTIVE' || params.status === 'INACTIVE' ? params.status : undefined,
    companyId,
    productId,
    includeArchived: params.includeArchived === 'true' ? 'true' : undefined,
  };

  const listQuery = queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize });

  let data: PaginatedResponse<VendorListItem>;
  let summary: VendorSummary | null;
  let brand: Company | null;
  let product: Product | null;

  try {
    [data, summary, brand, product] = await Promise.all([
      apiFetch<PaginatedResponse<VendorListItem>>(`/vendors${listQuery}`),
      apiFetch<VendorSummary>('/vendors/summary').catch(() => null),
      companyId ? apiFetch<Company>(`/companies/${companyId}`).catch(() => null) : Promise.resolve(null),
      productId ? apiFetch<Product>(`/products/${productId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <VendorHeader canCreate={false} />
        <ErrorState
          title="Could not load vendors"
          message={apiError?.messages[0] ?? 'The server could not be reached.'}
          correlationId={apiError?.body.correlationId}
        />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('vendor.export') && data.meta.totalItems > 0
    ? `/vendors/export${queryString({ ...filters, sortBy, sortDir })}`
    : null;

  const linkParams: Record<string, string | undefined> = {
    ...filters,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    pageSize: params.pageSize,
  };

  const sortHref = (field: string) => {
    const nextDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    return `/vendors${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: nextDir })}`;
  };

  const SortHeader = ({ field, label, align }: { field: string; label: string; align?: 'right' }) => {
    const active = sortBy === field;
    return (
      <th scope="col" className={clsx(align === 'right' && 'text-right')} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <Link href={sortHref(field)} scroll={false} className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-accent')}>
          {label}
          {active ? (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />) : <IconSort size={12} className="opacity-40" />}
        </Link>
      </th>
    );
  };

  const firstRowNumber = (data.meta.page - 1) * data.meta.pageSize;

  return (
    <div className="space-y-5">
      <VendorHeader canCreate={can('vendor.create')} canOcr={can('vendor.create') && can('ocr.submit')} />

      {summary && (
        <section aria-label="Vendor summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Vendors"
            value={summary.vendors.total}
            icon={<IconUsers size={22} />}
            iconClassName="bg-accent"
          />
          <StatCard
            label="Active Vendors"
            value={summary.vendors.active}
            icon={<IconCheck size={22} />}
            iconClassName="bg-success"
            href="/vendors?status=ACTIVE"
          />
          <StatCard
            label="Inactive Vendors"
            value={summary.vendors.inactive}
            icon={<IconPause size={22} />}
            iconClassName="bg-danger"
            href="/vendors?status=INACTIVE"
          />
          <StatCard
            label="Total Brands"
            value={summary.brandsCovered}
            icon={<IconTag size={22} />}
            iconClassName="bg-violet-600"
          />
          <StatCard
            label="Product Mappings"
            value={summary.productMappings.total}
            icon={<IconBox size={22} />}
            iconClassName="bg-orange-500"
          />
        </section>
      )}

      <VendorToolbar
        selectedBrand={brand ? { id: brand.id, label: brand.name } : null}
        selectedProduct={product ? { id: product.id, label: product.name, detail: product.modelNumber } : null}
        exportHref={exportHref}
      />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No vendors match these filters' : 'No vendors yet'}
            description={
              hasFilters
                ? 'Try another name, phone, brand, product or model number, or clear the filters.'
                : 'Add your first vendor manually, or import one from a visiting card or document.'
            }
            action={
              hasFilters ? (
                <Link href="/vendors" className="btn-secondary">
                  Clear filters
                </Link>
              ) : (
                can('vendor.create') && (
                  <Link href="/vendors/new" className="btn-primary">
                    <IconPlus size={16} />
                    Add Vendor
                  </Link>
                )
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
                    <SortHeader field="vendorCode" label="Vendor ID" />
                    <SortHeader field="businessName" label="Vendor Name" />
                    <SortHeader field="contactPerson" label="Primary Contact" />
                    <SortHeader field="phone" label="Phone" />
                    <SortHeader field="email" label="Email" />
                    <SortHeader field="brandCount" label="Brands" />
                    <SortHeader field="productCount" label="Products" align="right" />
                    <SortHeader field="status" label="Status" />
                    <SortHeader field="createdAt" label="Created Date" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((vendor, index) => {
                    const primary = vendor.contacts[0];
                    const phone = vendor.phone ?? primary?.phone;
                    const email = vendor.email ?? primary?.email;
                    const shownBrands = vendor.companies.slice(0, 2);
                    const moreBrands = vendor._count.companies - shownBrands.length;

                    return (
                      <tr key={vendor.id}>
                        <td className="tabular-nums text-ink-subtle">{firstRowNumber + index + 1}</td>
                        <td className="whitespace-nowrap font-mono text-sm text-ink-muted">{vendor.vendorCode}</td>
                        <td className="min-w-[180px]">
                          <Link href={`/vendors/${vendor.id}`} className="font-semibold text-ink hover:text-accent hover:underline">
                            {vendor.businessName}
                          </Link>
                          {vendor.category && <p className="text-xs text-ink-subtle">{vendor.category.name}</p>}
                        </td>
                        <td className="whitespace-nowrap">
                          {primary?.name ?? vendor.contactPerson ?? <span className="text-ink-subtle">&mdash;</span>}
                          {primary?.designation && <p className="text-xs text-ink-subtle">{primary.designation}</p>}
                        </td>
                        <td className="whitespace-nowrap tabular-nums">
                          {phone ? formatPhone(phone) : <span className="text-ink-subtle">&mdash;</span>}
                        </td>
                        <td className="max-w-[220px] truncate">
                          {email ?? <span className="text-ink-subtle">&mdash;</span>}
                        </td>
                        <td>
                          {shownBrands.length === 0 ? (
                            <span className="text-ink-subtle">&mdash;</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {shownBrands.map(({ company }) => (
                                <span key={company.id} className="chip">{company.name}</span>
                              ))}
                              {moreBrands > 0 && (
                                <span className="chip" title={`${moreBrands} more brand(s)`}>+{moreBrands}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{vendor._count.products}</td>
                        <td>
                          <VendorStatusBadge status={vendor.status} archivedAt={vendor.archivedAt} />
                        </td>
                        <td className="whitespace-nowrap">{formatDate(vendor.createdAt)}</td>
                        <td>
                          <VendorRowActions
                            vendor={{ id: vendor.id, businessName: vendor.businessName, status: vendor.status, archivedAt: vendor.archivedAt }}
                            permissions={permissions}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/vendors"
              params={linkParams}
              noun="vendors"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>

      <QuickActions permissions={permissions} />
    </div>
  );
}

function VendorHeader({ canCreate, canOcr = false }: { canCreate: boolean; canOcr?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <IconHandshake size={28} />
        </span>
        <h1 className="text-2xl font-bold text-ink">Vendor Management</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {canOcr && (
          <Link href="/vendors/ocr" className="btn-secondary h-11 px-4">
            <IconScan size={18} />
            Import with OCR
          </Link>
        )}
        {canCreate && (
          <Link href="/vendors/new" className="btn-primary h-11 px-5 text-base">
            <IconPlus size={18} />
            Add Vendor
          </Link>
        )}
      </div>
    </div>
  );
}

/** Entry points into the related workflows; each card links to a working screen. */
function QuickActions({ permissions }: { permissions: string[] }) {
  const cards = [
    {
      show: permissions.includes('vendor.create') && permissions.includes('ocr.submit'),
      title: 'OCR Import',
      text: 'Extract vendor details from visiting cards or documents, then review before saving.',
      href: '/vendors/ocr',
      cta: 'Import with OCR',
      icon: <IconScan size={20} />,
    },
    {
      show: permissions.includes('company.read'),
      title: 'Brand Master',
      text: 'Shared brands used by vendor mapping and the product catalogue.',
      href: '/companies',
      cta: 'Manage Brands',
      icon: <IconTag size={20} />,
    },
    {
      show: permissions.includes('product.read'),
      title: 'Product Catalogue',
      text: 'Shared products and models that vendors are mapped to.',
      href: '/products',
      cta: 'Manage Products',
      icon: <IconBox size={20} />,
    },
  ].filter((card) => card.show);

  if (cards.length === 0) return null;

  return (
    <section aria-label="Related tools" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div key={card.title} className="card flex flex-col p-5">
          <div className="flex items-center gap-2.5 text-ink">
            <span className="text-accent">{card.icon}</span>
            <h2 className="text-lg font-semibold">{card.title}</h2>
          </div>
          <p className="mt-1.5 flex-1 text-sm text-ink-muted">{card.text}</p>
          <Link href={card.href} className="btn-secondary mt-4 self-start border-accent/30 bg-accent-subtle text-accent hover:bg-accent/10">
            {card.cta}
            <IconArrowRight size={14} />
          </Link>
        </div>
      ))}
    </section>
  );
}
