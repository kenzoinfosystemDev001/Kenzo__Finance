import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  PaginatedResponse,
  VendorCategory,
  VendorListItem,
} from '@/lib/types';
import {
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  VendorStatusBadge,
} from '@/components/ui';
import { VendorFilters } from './vendor-filters';

export const metadata: Metadata = { title: 'Vendors' };

interface SearchParams {
  search?: string;
  companyName?: string;
  productName?: string;
  modelNumber?: string;
  city?: string;
  status?: string;
  categoryIds?: string;
  includeArchived?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  const query = queryString({
    search: params.search,
    companyName: params.companyName,
    productName: params.productName,
    modelNumber: params.modelNumber,
    city: params.city,
    status: params.status,
    categoryIds: params.categoryIds,
    includeArchived: params.includeArchived,
    sortBy: params.sortBy ?? 'createdAt',
    sortDir: params.sortDir ?? 'desc',
    page: params.page ?? '1',
    pageSize: 25,
  });

  let data: PaginatedResponse<VendorListItem>;
  let categories: VendorCategory[] = [];

  try {
    [data, categories] = await Promise.all([
      apiFetch<PaginatedResponse<VendorListItem>>(`/vendors${query}`),
      apiFetch<VendorCategory[]>('/vendor-categories').catch(() => []),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <>
        <PageHeader title="Vendors" />
        <ErrorState
          title="Could not load vendors"
          message={apiError?.messages[0] ?? 'The server could not be reached.'}
          correlationId={apiError?.body.correlationId}
        />
      </>
    );
  }

  const hasFilters = Boolean(
    params.search ||
      params.companyName ||
      params.productName ||
      params.modelNumber ||
      params.city ||
      params.status ||
      params.categoryIds,
  );

  const exportHref = `/vendors/export${query}`;

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Suppliers, the brands they carry and the products they can quote."
        actions={
          <>
            {permissions.includes('vendor.export') && data.meta.totalItems > 0 && (
              <a href={exportHref} className="btn-secondary">
                Export CSV
              </a>
            )}
            {permissions.includes('vendor.create') && (
              <>
                <Link href="/vendors/ocr" className="btn-secondary">
                  Upload document
                </Link>
                <Link href="/vendors/new" className="btn-primary">
                  Add vendor
                </Link>
              </>
            )}
          </>
        }
      />

      <VendorFilters categories={categories} />

      <div className="card mt-4 overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No vendors match these filters' : 'No vendors yet'}
            description={
              hasFilters
                ? 'Try a different name, brand, product or model, or clear the filters.'
                : 'Add your first vendor manually, or upload a vendor document to extract the details.'
            }
            action={
              hasFilters ? (
                <Link href="/vendors" className="btn-secondary">
                  Clear filters
                </Link>
              ) : (
                permissions.includes('vendor.create') && (
                  <Link href="/vendors/new" className="btn-primary">
                    Add vendor
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
                    <th scope="col">Code</th>
                    <th scope="col">Vendor</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Location</th>
                    <th scope="col">GSTIN</th>
                    <th scope="col" className="text-right">
                      Brands
                    </th>
                    <th scope="col" className="text-right">
                      Products
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((vendor) => (
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
                        {vendor.category && (
                          <p className="text-sm text-ink-subtle">
                            {vendor.category.name}
                          </p>
                        )}
                      </td>
                      <td>
                        <p>{vendor.contactPerson ?? '-'}</p>
                        <p className="text-sm text-ink-subtle">
                          {vendor.phone ?? vendor.email ?? ''}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {[vendor.city, vendor.state].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="whitespace-nowrap font-mono text-sm">
                        {vendor.gstin ?? '-'}
                      </td>
                      <td className="text-right tabular-nums">
                        {vendor._count.companies}
                      </td>
                      <td className="text-right tabular-nums">
                        {vendor._count.products}
                      </td>
                      <td>
                        <VendorStatusBadge
                          status={vendor.status}
                          archivedAt={vendor.archivedAt}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/vendors"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </div>
    </>
  );
}
