import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { Company, PaginatedResponse, Product } from '@/lib/types';
import { Badge, EmptyState, PageHeader, Pagination } from '@/components/ui';
import { CreateProductForm } from './create-product-form';

export const metadata: Metadata = { title: 'Products' };

interface SearchParams {
  search?: string;
  companyId?: string;
  modelNumber?: string;
  designNumber?: string;
  page?: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const canCreate = user?.permissions.includes('product.create') ?? false;

  const [data, companies, categories] = await Promise.all([
    apiFetch<PaginatedResponse<Product>>(
      `/products${queryString({
        search: params.search,
        companyId: params.companyId,
        modelNumber: params.modelNumber,
        designNumber: params.designNumber,
        page: params.page ?? '1',
        pageSize: 25,
      })}`,
    ),
    apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
      .then((r) => r.items)
      .catch(() => []),
    apiFetch<Array<{ id: string; name: string }>>('/products/categories').catch(
      () => [],
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        description="The hardware catalogue. Each product belongs to one brand and one model number."
      />

      {canCreate && (
        <div className="card mb-4 p-4">
          <CreateProductForm companies={companies} categories={categories} />
        </div>
      )}

      <form className="card mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="search" className="field-label">
              Search
            </label>
            <input
              id="search"
              name="search"
              type="search"
              defaultValue={params.search ?? ''}
              className="field-input"
              placeholder="Name, code, model or design number"
            />
          </div>

          <div className="w-48">
            <label htmlFor="companyId" className="field-label">
              Brand
            </label>
            <select
              id="companyId"
              name="companyId"
              defaultValue={params.companyId ?? ''}
              className="field-input"
            >
              <option value="">All brands</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-primary">
            Search
          </button>

          {(params.search || params.companyId) && (
            <Link href="/products" className="btn-secondary">
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={params.search || params.companyId ? 'No products match' : 'No products yet'}
            description={
              params.search || params.companyId
                ? 'Try a different search term or brand.'
                : 'Add a brand first, then create products under it.'
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
                      <td className="font-medium">{product.name}</td>
                      <td>{product.company.name}</td>
                      <td className="font-mono text-sm">{product.modelNumber}</td>
                      <td>{product.category?.name ?? '-'}</td>
                      <td className="text-right tabular-nums">
                        {product._count?.vendors ?? 0}
                      </td>
                      <td>
                        {product.isActive ? (
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
