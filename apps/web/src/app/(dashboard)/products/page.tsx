import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  Company,
  PaginatedResponse,
  Product,
  ProductCategory,
} from '@/lib/types';
import {
  Badge,
  EmptyState,
  PageHeader,
  Pagination,
} from '@/components/ui';
import { ProductFilters } from './product-filters';

export const metadata: Metadata = { title: 'Products' };

interface SearchParams {
  search?: string;
  companyId?: string;
  categoryId?: string;
  modelNumber?: string;
  designNumber?: string;
  lowStockOnly?: string;
  outOfStockOnly?: string;
  includeArchived?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  const query = queryString({
    search: params.search,
    companyId: params.companyId,
    categoryId: params.categoryId,
    modelNumber: params.modelNumber,
    designNumber: params.designNumber,
    lowStockOnly: params.lowStockOnly,
    outOfStockOnly: params.outOfStockOnly,
    includeArchived: params.includeArchived,
    sortBy: params.sortBy ?? 'name',
    sortDir: params.sortDir ?? 'asc',
    page: params.page ?? '1',
    pageSize: 25,
  });

  const [data, companies, categories, stockStatus] = await Promise.all([
    apiFetch<PaginatedResponse<Product>>(`/products${query}`),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<ProductCategory[]>('/products/categories').catch(() => []),
    apiFetch<{ stockTrackingEnabled: boolean }>('/stock/status').catch(() => ({
      stockTrackingEnabled: false,
    })),
  ]);

  const showStock = stockStatus.stockTrackingEnabled;
  const hasFilters = Object.entries(params).some(
    ([key, value]) => value && key !== 'page' && key !== 'sortBy' && key !== 'sortDir',
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="The hardware catalogue. Each product belongs to one brand and one model number."
        actions={
          <>
            <Link href="/products/categories" className="btn-secondary">
              Categories
            </Link>
            {permissions.includes('product.export') && data.meta.totalItems > 0 && (
              <a href={`/products/export${query}`} className="btn-secondary">
                Export CSV
              </a>
            )}
            {permissions.includes('product.create') && (
              <Link href="/products/new" className="btn-primary">
                Add product
              </Link>
            )}
          </>
        }
      />

      <ProductFilters
        companies={companies}
        categories={categories}
        showStockFilters={showStock}
      />

      <div className="card mt-4 overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No products match these filters' : 'No products yet'}
            description={
              hasFilters
                ? 'Try a different search term, brand or category, or clear the filters.'
                : 'Add a brand first, then create the products you supply under it.'
            }
            action={
              hasFilters ? (
                <Link href="/products" className="btn-secondary">
                  Clear filters
                </Link>
              ) : (
                permissions.includes('product.create') && (
                  <Link href="/products/new" className="btn-primary">
                    Add product
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
                    <th scope="col">Product</th>
                    <th scope="col">Brand</th>
                    <th scope="col">Model</th>
                    <th scope="col">Category</th>
                    {showStock && (
                      <th scope="col" className="text-right">
                        On hand
                      </th>
                    )}
                    <th scope="col" className="text-right">
                      Vendors
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((product) => (
                    <tr key={product.id}>
                      <td className="whitespace-nowrap font-mono text-sm text-ink-muted">
                        {product.productCode}
                      </td>
                      <td>
                        <Link
                          href={`/products/${product.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {product.name}
                        </Link>
                        {product.designNumber && (
                          <p className="text-sm text-ink-subtle">
                            Design {product.designNumber}
                          </p>
                        )}
                      </td>
                      <td>{product.company.name}</td>
                      <td className="whitespace-nowrap font-mono text-sm">
                        {product.modelNumber}
                      </td>
                      <td>{product.category?.name ?? '-'}</td>
                      {showStock && (
                        <td className="text-right">
                          <span
                            className={`tabular-nums ${
                              product.isOutOfStock
                                ? 'font-medium text-danger'
                                : product.isLowStock
                                  ? 'font-medium text-warning'
                                  : 'text-ink'
                            }`}
                          >
                            {product.onHand ?? 0}
                          </span>
                          {product.isLowStock && !product.isOutOfStock && (
                            <p className="text-xs text-warning">Low</p>
                          )}
                        </td>
                      )}
                      <td className="text-right tabular-nums">
                        {product._count?.vendors ?? 0}
                      </td>
                      <td>
                        {product.archivedAt ? (
                          <Badge tone="danger">Archived</Badge>
                        ) : product.isActive ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge>Inactive</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/products"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </div>
    </>
  );
}
