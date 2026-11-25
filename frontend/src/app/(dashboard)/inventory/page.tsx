import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type {
  Company,
  PaginatedResponse,
  ProductCategory,
  StockBalanceRow,
  StockSummary,
} from '@/lib/types';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
import { StockTrackingDisabled } from './stock-disabled';

export const metadata: Metadata = { title: 'Inventory' };

interface SearchParams {
  search?: string;
  companyId?: string;
  categoryId?: string;
  lowStockOnly?: string;
  outOfStockOnly?: string;
  page?: string;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  const status = await apiFetch<{ stockTrackingEnabled: boolean }>(
    '/stock/status',
  ).catch(() => ({ stockTrackingEnabled: false }));

  if (!status.stockTrackingEnabled) {
    return (
      <StockTrackingDisabled
        canManageSettings={permissions.includes('settings.manage')}
      />
    );
  }

  const query = queryString({
    search: params.search,
    companyId: params.companyId,
    categoryId: params.categoryId,
    lowStockOnly: params.lowStockOnly,
    outOfStockOnly: params.outOfStockOnly,
    page: params.page ?? '1',
    pageSize: 25,
  });

  let summary: StockSummary | null = null;
  let balances: PaginatedResponse<StockBalanceRow>;
  let companies: Company[] = [];
  let categories: ProductCategory[] = [];

  try {
    [summary, balances, companies, categories] = await Promise.all([
      apiFetch<StockSummary>('/stock/summary').catch(() => null),
      apiFetch<PaginatedResponse<StockBalanceRow>>(`/stock/balances${query}`),
      apiFetch<PaginatedResponse<Company>>('/companies?pageSize=100&sortBy=name')
        .then((r) => r.items)
        .catch(() => []),
      apiFetch<ProductCategory[]>('/products/categories').catch(() => []),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <>
          <PageHeader title="Inventory" />
          <div className="card p-6">
            <p className="text-base text-ink-muted">
              You do not have permission to view stock figures.
            </p>
          </div>
        </>
      );
    }
    throw error;
  }

  const stats = [
    { label: 'Products tracked', value: summary?.trackedProducts ?? 0 },
    { label: 'Total units on hand', value: summary?.totalUnits ?? 0 },
    {
      label: 'Low stock',
      value: summary?.lowStock ?? 0,
      tone: (summary?.lowStock ?? 0) > 0 ? 'warning' : undefined,
      href: '/inventory?lowStockOnly=true',
    },
    {
      label: 'Out of stock',
      value: summary?.outOfStock ?? 0,
      tone: (summary?.outOfStock ?? 0) > 0 ? 'danger' : undefined,
      href: '/inventory?outOfStockOnly=true',
    },
  ];

  const activeFilter = params.lowStockOnly
    ? 'low stock'
    : params.outOfStockOnly
      ? 'out of stock'
      : null;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="On-hand quantities derived from the stock ledger. Every figure is the sum of recorded movements."
        actions={
          <>
            <Link href="/inventory/ledger" className="btn-secondary">
              Stock ledger
            </Link>
            <Link href="/inventory/locations" className="btn-secondary">
              Locations
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const body = (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                {stat.label}
              </p>
              <p
                className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                  stat.tone === 'warning'
                    ? 'text-warning'
                    : stat.tone === 'danger'
                      ? 'text-danger'
                      : 'text-ink'
                }`}
              >
                {stat.value}
              </p>
            </>
          );

          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className="card p-4 hover:border-border-strong"
            >
              {body}
            </Link>
          ) : (
            <div key={stat.label} className="card p-4">
              {body}
            </div>
          );
        })}
      </div>

      <form className="card mt-4 p-4">
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
              placeholder="Product name, code or model"
            />
          </div>

          <div className="w-44">
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

          <div className="w-44">
            <label htmlFor="categoryId" className="field-label">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={params.categoryId ?? ''}
              className="field-input"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {params.lowStockOnly && (
            <input type="hidden" name="lowStockOnly" value="true" />
          )}
          {params.outOfStockOnly && (
            <input type="hidden" name="outOfStockOnly" value="true" />
          )}

          <button type="submit" className="btn-primary">
            Search
          </button>

          {activeFilter && (
            <Link href="/inventory" className="btn-secondary">
              Clear {activeFilter} filter
            </Link>
          )}
        </div>
      </form>

      <div className="card mt-4 overflow-hidden">
        {balances.items.length === 0 ? (
          <EmptyState
            title="Nothing to show"
            description={
              activeFilter
                ? `No products are currently ${activeFilter}.`
                : 'No products match these filters.'
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
                    <th scope="col" className="text-right">
                      Reorder level
                    </th>
                    <th scope="col" className="text-right">
                      On hand
                    </th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.items.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap font-mono text-sm text-ink-muted">
                        {row.productCode}
                      </td>
                      <td>
                        <Link
                          href={`/products/${row.id}`}
                          className="font-medium text-accent hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td>{row.company.name}</td>
                      <td className="font-mono text-sm">{row.modelNumber}</td>
                      <td className="text-right tabular-nums text-ink-muted">
                        {row.reorderLevel ?? '-'}
                      </td>
                      <td
                        className={`text-right font-medium tabular-nums ${
                          row.isOutOfStock
                            ? 'text-danger'
                            : row.isLowStock
                              ? 'text-warning'
                              : 'text-ink'
                        }`}
                      >
                        {row.onHand}
                      </td>
                      <td>
                        {row.isOutOfStock ? (
                          <span className="badge bg-danger-subtle text-danger">
                            Out of stock
                          </span>
                        ) : row.isLowStock ? (
                          <span className="badge bg-warning-subtle text-warning">
                            Low
                          </span>
                        ) : (
                          <span className="badge bg-success-subtle text-success">
                            In stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={balances.meta}
              basePath="/inventory"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </div>
    </>
  );
}
