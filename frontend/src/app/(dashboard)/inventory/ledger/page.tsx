import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { PaginatedResponse, StockMovement } from '@/lib/types';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
import { StockTrackingDisabled } from '../stock-disabled';

export const metadata: Metadata = { title: 'Stock ledger' };

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING_BALANCE: 'Opening balance',
  RECEIPT: 'Receipt',
  ISSUE: 'Issue',
  ADJUSTMENT_IN: 'Adjustment +',
  ADJUSTMENT_OUT: 'Adjustment -',
  RETURN_IN: 'Customer return',
  RETURN_OUT: 'Return to vendor',
};

export default async function StockLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    productId?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const status = await apiFetch<{ stockTrackingEnabled: boolean }>(
    '/stock/status',
  ).catch(() => ({ stockTrackingEnabled: false }));

  if (!status.stockTrackingEnabled) {
    return (
      <StockTrackingDisabled
        canManageSettings={user?.permissions.includes('settings.manage') ?? false}
      />
    );
  }

  const data = await apiFetch<PaginatedResponse<StockMovement>>(
    `/stock/movements${queryString({
      productId: params.productId,
      type: params.type,
      from: params.from,
      to: params.to,
      page: params.page ?? '1',
      pageSize: 50,
      sortBy: 'occurredAt',
      sortDir: 'desc',
    })}`,
  );

  return (
    <>
      <PageHeader
        title="Stock ledger"
        description="Every recorded movement, newest first. The ledger is append-only: corrections are posted as new entries."
        actions={
          <Link href="/inventory" className="btn-secondary">
            Back to inventory
          </Link>
        }
      />

      <form className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label htmlFor="type" className="field-label">
              Movement type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={params.type ?? ''}
              className="field-input"
            >
              <option value="">All types</option>
              {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-40">
            <label htmlFor="from" className="field-label">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={params.from ?? ''}
              className="field-input"
            />
          </div>

          <div className="w-40">
            <label htmlFor="to" className="field-label">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={params.to ?? ''}
              className="field-input"
            />
          </div>

          {params.productId && (
            <input type="hidden" name="productId" value={params.productId} />
          )}

          <button type="submit" className="btn-primary">
            Filter
          </button>

          <Link href="/inventory/ledger" className="btn-secondary">
            Clear
          </Link>
        </div>
      </form>

      <div className="card mt-4 overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title="No movements recorded"
            description="Record an opening balance or a receipt on a product to start the ledger."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Product</th>
                    <th scope="col">Movement</th>
                    <th scope="col">Location</th>
                    <th scope="col" className="text-right">
                      Change
                    </th>
                    <th scope="col" className="text-right">
                      Balance
                    </th>
                    <th scope="col">Reason</th>
                    <th scope="col">Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap">
                        {new Date(movement.occurredAt).toLocaleDateString('en-IN', { timeZone: BUSINESS_TIME_ZONE,
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <Link
                          href={`/products/${movement.product.id}`}
                          className="link-pill font-medium"
                        >
                          {movement.product.name}
                        </Link>
                        <p className="font-mono text-sm text-ink-subtle">
                          {movement.product.productCode}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {MOVEMENT_LABELS[movement.type] ?? movement.type}
                      </td>
                      <td>{movement.location.name}</td>
                      <td
                        className={`text-right font-medium tabular-nums ${
                          movement.quantityDelta > 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {movement.quantityDelta > 0 ? '+' : ''}
                        {movement.quantityDelta}
                      </td>
                      <td className="text-right tabular-nums">
                        {movement.balanceAfter}
                      </td>
                      <td className="max-w-xs truncate text-ink-muted">
                        {movement.reason ?? '-'}
                      </td>
                      <td className="whitespace-nowrap text-ink-muted">
                        {movement.createdBy?.fullName ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              meta={data.meta}
              basePath="/inventory/ledger"
              params={params as Record<string, string | undefined>}
            />
          </>
        )}
      </div>
    </>
  );
}
