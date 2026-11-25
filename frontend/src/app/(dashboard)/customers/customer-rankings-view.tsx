import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate } from '@/lib/vendor-labels';
import { Badge, EmptyState, ErrorState, Pagination, PageHeader } from '@/components/ui';
import { FavouriteBadge, FavouriteToggle } from '@/components/favourite-customer';
import { IconArrowDown, IconArrowUp } from '@/components/icons';
import { PageSizeSelect } from '../vendors/vendor-toolbar';

export interface RankingRow {
  customer: { id: string; name: string; customerCode: string; status: string };
  currency: string | null;
  orders: number;
  invoicedAmount: string;
  unitsPurchased: number;
  distinctProducts: number;
  lastInvoiceDate: string | null;
  favourite: boolean;
}

interface RankingsResponse {
  view: 'all' | 'top' | 'favourite';
  sortBy: 'invoiced' | 'purchases' | 'orders';
  sortDir: 'asc' | 'desc';
  items: RankingRow[];
  favouritesAvailable: boolean;
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean };
}

const SORTS = ['invoiced', 'purchases', 'orders'] as const;
const PAGE_SIZES = [10, 25, 50];

const TITLES = {
  all: 'All customers',
  top: 'Top customers',
  favourite: 'Favourite customers',
} as const;

/**
 * Top Customers and Favourite Customers, ranked from issued and sent final
 * invoices. Figures are computed on every request, so a new, updated or
 * cancelled invoice is reflected on the next load.
 */
export async function CustomerRankingsView({
  view,
  params,
  canManage,
  canCreate,
}: {
  view: 'all' | 'top' | 'favourite';
  params: Record<string, string | undefined>;
  canManage: boolean;
  canCreate: boolean;
}) {
  const sortBy = SORTS.includes(params.sortBy as (typeof SORTS)[number]) ? (params.sortBy as (typeof SORTS)[number]) : 'invoiced';
  const sortDir = params.sortDir === 'asc' ? 'asc' : 'desc';
  const pageSize = PAGE_SIZES.includes(Number(params.pageSize)) ? Number(params.pageSize) : 25;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const search = params.search?.trim() || undefined;

  let data: RankingsResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiFetch<RankingsResponse>(`/customers/rankings${queryString({ view, sortBy, sortDir, page, pageSize, search })}`);
  } catch (cause) {
    error = cause instanceof ApiError ? cause.messages[0] : 'The customer rankings could not be loaded.';
  }

  const base = (overrides: Record<string, string | undefined>) => {
    const query = queryString({ view: view === 'all' ? undefined : view, search, sortBy, sortDir, pageSize, ...overrides });
    return `/customers${query}`;
  };
  const nextDir = (field: (typeof SORTS)[number]) => (sortBy === field && sortDir === 'desc' ? 'asc' : 'desc');
  const SortHead = ({ field, label }: { field: (typeof SORTS)[number]; label: string }) => (
    <Link href={base({ sortBy: field, sortDir: nextDir(field), page: '1' })} className="inline-flex items-center gap-1 hover:text-ink">
      {label}
      {sortBy === field && (sortDir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />)}
    </Link>
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Customer Management"
        description="Rankings use issued and sent final invoices only. Quotations and proforma invoices are not counted."
        actions={
          canCreate ? (
            <Link href="/customers/new" className="btn-primary">
              Add customer
            </Link>
          ) : undefined
        }
      />

      <CustomerViewTabs active={view} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="view" value={view === 'all' ? '' : view} />
        <input type="hidden" name="sortBy" value={sortBy} />
        <input type="hidden" name="sortDir" value={sortDir} />
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          Search
          <input name="search" defaultValue={search ?? ''} placeholder="Name or customer code" className="field-input h-9" />
        </label>
        <button type="submit" className="btn-secondary h-9">Search</button>
      </form>

      {view !== 'all' && data && !data.favouritesAvailable && view === 'top' && (
        <p className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          Favourite marking is not yet enabled in this database. Rankings by purchases are unaffected.
        </p>
      )}

      {error ? (
        <ErrorState title="Customer rankings unavailable" message={error} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={view === 'favourite' ? 'No favourite customers yet' : view === 'top' ? 'No customers with issued invoices yet' : 'No customers match'}
          description={
            view === 'favourite'
              ? 'An administrator can mark customers as favourites from this list.'
              : view === 'top'
                ? 'A customer appears here once a final invoice for them has been issued.'
                : 'Try a different search.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col" className="text-right"><SortHead field="orders" label="Orders" /></th>
                  <th scope="col" className="text-right"><SortHead field="purchases" label="Products purchased" /></th>
                  <th scope="col" className="text-right"><SortHead field="invoiced" label="Invoiced amount" /></th>
                  <th scope="col">Last invoice</th>
                  {canManage && <th scope="col" className="text-right">Favourite</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={`${row.customer.id}-${row.currency ?? 'none'}`}>
                    <td>
                      <Link href={`/customers/${row.customer.id}`} className="font-medium text-accent hover:underline">
                        {row.customer.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-ink-subtle">{row.customer.customerCode}</span>
                      {row.favourite && <FavouriteBadge />}
                      {row.customer.status !== 'ACTIVE' && (
                        <span className="ml-2">
                          <Badge>Inactive</Badge>
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{row.orders || '—'}</td>
                    <td className="text-right tabular-nums">
                      {row.orders ? (
                        <>
                          {row.unitsPurchased}
                          <span className="block text-xs text-ink-subtle">{row.distinctProducts} product{row.distinctProducts === 1 ? '' : 's'}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right tabular-nums">{row.currency ? formatMoney(row.invoicedAmount, row.currency) : '—'}</td>
                    <td className="whitespace-nowrap">{row.lastInvoiceDate ? formatDate(row.lastInvoiceDate) : '—'}</td>
                    {canManage && (
                      <td className="text-right">
                        <FavouriteToggle customerId={row.customer.id} customerName={row.customer.name} favourite={row.favourite} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border p-3">
            <Pagination
              meta={data.meta}
              basePath="/customers"
              params={{ view: view === 'all' ? undefined : view, search, sortBy, sortDir, pageSize: String(pageSize) }}
              noun="customers"
              extra={<PageSizeSelect value={pageSize} options={PAGE_SIZES} />}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The three customer views. Shared by the All list and the rankings views. */
export function CustomerViewTabs({ active }: { active: "all" | "top" | "favourite" }) {
  return (
    <nav aria-label="Customer views" className="mb-4 flex flex-wrap gap-2">
      {(["all", "top", "favourite"] as const).map((key) => (
        <Link
          key={key}
          href={key === "all" ? "/customers" : `/customers?view=${key}`}
          aria-current={active === key ? "page" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            active === key ? "border-accent bg-accent text-white" : "border-border-strong bg-surface text-ink-muted hover:bg-surface-muted"
          }`}
        >
          {TITLES[key]}
        </Link>
      ))}
    </nav>
  );
}
