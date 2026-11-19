import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { Company, PaginatedResponse, Product, ProductCategory, ProductSummary, VendorDetail } from '@/lib/types';
import { formatDate } from '@/lib/vendor-labels';
import { Badge, EmptyState, ErrorState, Pagination, StatCard, VendorStatusBadge } from '@/components/ui';
import {
  IconArrowDown,
  IconArrowUp,
  IconBox,
  IconCheck,
  IconHandshake,
  IconPause,
  IconPlus,
  IconSort,
  IconTag,
} from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';
import { ProductToolbar } from './product-toolbar';
import { ProductRowActions } from './product-row-actions';

export const metadata: Metadata = { title: 'Product Management' };

interface SearchParams {
  search?: string;
  companyId?: string;
  categoryId?: string;
  isActive?: string;
  vendorId?: string;
  createdFrom?: string;
  createdTo?: string;
  includeArchived?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
  pageSize?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);

  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 10;
  const sortBy = params.sortBy ?? 'createdAt';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const uuidOr = (value?: string) => (value && UUID.test(value) ? value : undefined);

  const filters = {
    search: params.search,
    companyId: uuidOr(params.companyId),
    categoryId: uuidOr(params.categoryId),
    vendorId: uuidOr(params.vendorId),
    isActive: params.isActive === 'true' || params.isActive === 'false' ? params.isActive : undefined,
    createdFrom: params.createdFrom && DATE.test(params.createdFrom) ? params.createdFrom : undefined,
    createdTo: params.createdTo && DATE.test(params.createdTo) ? params.createdTo : undefined,
    includeArchived: params.includeArchived === 'true' ? 'true' : undefined,
  };

  let data: PaginatedResponse<Product>;
  let summary: ProductSummary | null;
  let categories: ProductCategory[];
  let brand: Company | null;
  let vendor: VendorDetail | null;
  try {
    [data, summary, categories, brand, vendor] = await Promise.all([
      apiFetch<PaginatedResponse<Product>>(`/products${queryString({ ...filters, sortBy, sortDir, page: params.page ?? '1', pageSize })}`),
      apiFetch<ProductSummary>('/products/summary').catch(() => null),
      apiFetch<ProductCategory[]>('/products/categories').catch(() => [] as ProductCategory[]),
      filters.companyId ? apiFetch<Company>(`/companies/${filters.companyId}`).catch(() => null) : Promise.resolve(null),
      filters.vendorId && can('vendor.read') ? apiFetch<VendorDetail>(`/vendors/${filters.vendorId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <ProductHeader canCreate={false} />
        <ErrorState title="Could not load products" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />
      </>
    );
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const exportHref = can('product.export') && data.meta.totalItems > 0 ? `/products/export${queryString({ ...filters, sortBy, sortDir })}` : null;

  const sortHref = (field: string) =>
    `/products${queryString({ ...filters, pageSize: params.pageSize, sortBy: field, sortDir: sortBy === field && sortDir === 'asc' ? 'desc' : 'asc' })}`;

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

  const firstRow = (data.meta.page - 1) * data.meta.pageSize;

  return (
    <div className="space-y-5">
      <ProductHeader canCreate={can('product.create')} />

      {summary && (
        <section aria-label="Product summary" className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatCard label="Total Products" value={summary.products.total} icon={<IconBox size={22} />} iconClassName="bg-accent" />
          <StatCard label="Active Products" value={summary.products.active} icon={<IconCheck size={22} />} iconClassName="bg-success" href="/products?isActive=true" />
          <StatCard label="Inactive Products" value={summary.products.inactive} icon={<IconPause size={22} />} iconClassName="bg-danger" href="/products?isActive=false" />
          <StatCard label="Total Brands" value={summary.brands} icon={<IconTag size={22} />} iconClassName="bg-violet-600" />
          <StatCard label="Total Models" value={summary.models.total} icon={<IconBox size={22} />} iconClassName="bg-teal-600" />
          <StatCard label="Vendor Mappings" value={summary.vendorMappings.products} icon={<IconHandshake size={22} />} iconClassName="bg-orange-500" />
        </section>
      )}

      <ProductToolbar
        categories={categories}
        selectedBrand={brand ? { id: brand.id, label: brand.name } : null}
        selectedVendor={vendor ? { id: vendor.id, label: vendor.businessName } : null}
        exportHref={exportHref}
      />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No products match these filters' : 'No products yet'}
            description={hasFilters ? 'Try another name, brand, model or vendor, or clear the filters.' : 'Add your first catalogue product, then its models and vendors.'}
            action={
              hasFilters ? (
                <Link href="/products" className="btn-secondary">Clear filters</Link>
              ) : (
                can('product.create') && (
                  <Link href="/products/new" className="btn-primary"><IconPlus size={16} /> Add Product</Link>
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
                    <SortHeader field="productCode" label="Product ID" />
                    <SortHeader field="name" label="Product Name" />
                    <th scope="col">Brand</th>
                    <th scope="col">Category</th>
                    <SortHeader field="modelCount" label="Models" align="right" />
                    <SortHeader field="vendorCount" label="Vendors" align="right" />
                    <SortHeader field="isActive" label="Status" />
                    <SortHeader field="createdAt" label="Created Date" />
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((product, index) => (
                    <tr key={product.id}>
                      <td className="tabular-nums text-ink-subtle">{firstRow + index + 1}</td>
                      <td className="whitespace-nowrap font-mono text-sm text-ink-muted">
                        {product.productCode}
                        {product.sku && <p className="text-xs text-ink-subtle">SKU {product.sku}</p>}
                      </td>
                      <td className="min-w-[180px]">
                        <Link href={`/products/${product.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{product.name}</Link>
                      </td>
                      <td className="whitespace-nowrap">{product.company.name}</td>
                      <td>{product.category ? <span className="chip">{product.category.name}</span> : <span className="text-ink-subtle">&mdash;</span>}</td>
                      <td className="text-right tabular-nums">{product._count.models}</td>
                      <td className="text-right tabular-nums">{product._count.vendors}</td>
                      <td>
                        {product.archivedAt ? (
                          <VendorStatusBadge status="INACTIVE" archivedAt={product.archivedAt} />
                        ) : (
                          <VendorStatusBadge status={product.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        )}
                        {product.isOutOfStock && <span className="ml-1"><Badge tone="warning">Out of stock</Badge></span>}
                      </td>
                      <td className="whitespace-nowrap">{formatDate(product.createdAt)}</td>
                      <td>
                        <ProductRowActions product={{ id: product.id, name: product.name, isActive: product.isActive, archivedAt: product.archivedAt }} permissions={permissions} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              meta={data.meta}
              basePath="/products"
              params={{ ...filters, sortBy: params.sortBy, sortDir: params.sortDir, pageSize: params.pageSize }}
              noun="products"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ProductHeader({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-subtle text-accent">
          <IconBox size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Product Management</h1>
          <p className="text-base text-ink-muted">Manage your product catalogue, brands and vendor mappings</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/companies" className="btn-secondary h-11 px-4"><IconTag size={16} /> Brands</Link>
        <Link href="/products/categories" className="btn-secondary h-11 px-4">Categories</Link>
        {canCreate && (
          <Link href="/products/new" className="btn-primary h-11 px-5 text-base">
            <IconPlus size={18} /> Add Product
          </Link>
        )}
      </div>
    </div>
  );
}
