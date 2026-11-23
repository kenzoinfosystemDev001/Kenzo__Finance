import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, DeliveryListItem, DeliverySummary, PaginatedResponse } from '@/lib/types';
import { DELIVERY_STATUSES } from '@/lib/delivery-labels';
import { EmptyState, ErrorState, Pagination, StatCard } from '@/components/ui';
import { DeliveryTable } from '@/components/delivery-table';
import { IconChart, IconDownload, IconPlus, IconTruck } from '@/components/icons';
import { DeliveryFilters } from './delivery-filters';

export const metadata: Metadata = { title: 'Delivery Management' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORTS = ['deliveryNumber', 'deliveryDate', 'expectedDate', 'actualDeliveryDate', 'dispatchDate', 'status', 'createdAt'];
const DATE_KEYS = ['dateFrom', 'dateTo', 'dispatchFrom', 'dispatchTo', 'expectedFrom', 'expectedTo', 'deliveredFrom', 'deliveredTo'] as const;

/** Only values the API accepts are forwarded, so a hand-edited URL cannot turn into a 400. */
function cleanFilters(params: Record<string, string | undefined>) {
  const status = (params.status ?? '').split(',').filter((s) => (DELIVERY_STATUSES as string[]).includes(s)).join(',');
  const dates = Object.fromEntries(DATE_KEYS.map((k) => [k, params[k] && DATE.test(params[k]!) ? params[k] : undefined]));
  return {
    search: params.search?.trim().slice(0, 200) || undefined,
    status: status || undefined,
    customerId: params.customerId && UUID.test(params.customerId) ? params.customerId : undefined,
    finalInvoiceId: params.finalInvoiceId && UUID.test(params.finalInvoiceId) ? params.finalInvoiceId : undefined,
    transporter: params.transporter?.trim().slice(0, 200) || undefined,
    location: params.location?.trim().slice(0, 200) || undefined,
    delayedOnly: params.delayedOnly === 'true' ? 'true' : undefined,
    sortBy: params.sortBy && SORTS.includes(params.sortBy) ? params.sortBy : undefined,
    sortDir: params.sortDir === 'asc' || params.sortDir === 'desc' ? params.sortDir : undefined,
    ...dates,
  } as Record<string, string | undefined>;
}

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  if (!can('delivery.read')) return <ErrorState title="Not allowed" message="You do not have permission to view deliveries." />;

  const filters = cleanFilters(params);
  const page = /^\d+$/.test(params.page ?? '') ? params.page : '1';
  const pageSize = ['10', '25', '50', '100'].includes(params.pageSize ?? '') ? params.pageSize : '25';

  let data: PaginatedResponse<DeliveryListItem>;
  let summary: DeliverySummary | null = null;
  let summaryError: string | null = null;
  let customer: Pick<CustomerDetail, 'id' | 'name' | 'customerCode'> | null = null;
  try {
    [data, summary, customer] = await Promise.all([
      apiFetch<PaginatedResponse<DeliveryListItem>>(`/deliveries${queryString({ ...filters, sortBy: filters.sortBy ?? 'createdAt', sortDir: filters.sortDir ?? 'desc', page, pageSize })}`),
      apiFetch<DeliverySummary>('/deliveries/summary').catch((error) => {
        summaryError = error instanceof ApiError ? error.messages[0] : 'The summary could not be loaded.';
        return null;
      }),
      // Only to show the selected customer's name in the filter.
      filters.customerId ? apiFetch<CustomerDetail>(`/customers/${filters.customerId}`).catch(() => null) : Promise.resolve(null),
    ]);
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    return <ErrorState title="Could not load deliveries" message={apiError?.messages[0] ?? 'The server could not be reached.'} correlationId={apiError?.body.correlationId} />;
  }

  const filterKey = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]))).toString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Delivery Management</h1>
          <p className="text-sm text-ink-muted">Plan, dispatch, track and confirm deliveries of invoiced goods. Delivery never changes invoice amounts or payments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('delivery.reports') && <Link href="/deliveries/reports" className="btn-secondary"><IconChart size={16} /> Reports</Link>}
          {can('delivery.export') && data.meta.totalItems > 0 && (
            <a className="btn-secondary" href={`/deliveries/export${queryString(filters)}`}><IconDownload size={16} /> Export CSV</a>
          )}
          {can('delivery.create') && <Link href="/deliveries/new" className="btn-primary"><IconPlus size={16} /> Create Delivery</Link>}
        </div>
      </div>

      {summary ? (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Deliveries" value={summary.total} icon={<IconTruck size={22} />} iconClassName="bg-accent" href="/deliveries" note={`${summary.draft} draft · ${summary.cancelled} cancelled`} />
          <StatCard label="Scheduled" value={summary.scheduled} icon={<IconTruck size={22} />} iconClassName="bg-sky-500" href="/deliveries?status=SCHEDULED" />
          <StatCard label="Ready for Dispatch" value={summary.readyForDispatch} icon={<IconTruck size={22} />} iconClassName="bg-violet-500" href="/deliveries?status=READY_FOR_DISPATCH" />
          <StatCard label="Dispatched / In Transit" value={summary.dispatched + summary.inTransit} icon={<IconTruck size={22} />} iconClassName="bg-teal-500" href="/deliveries?status=DISPATCHED,IN_TRANSIT" note={`${summary.dispatched} dispatched · ${summary.inTransit} in transit`} />
          <StatCard label="Delivered" value={summary.delivered} icon={<IconTruck size={22} />} iconClassName="bg-success" href="/deliveries?status=DELIVERED" />
          <StatCard label="Partially Delivered" value={summary.partiallyDelivered} icon={<IconTruck size={22} />} iconClassName="bg-warning" href="/deliveries?status=PARTIALLY_DELIVERED" />
          <StatCard label="Failed / Returned" value={summary.failed + summary.returned} icon={<IconTruck size={22} />} iconClassName="bg-danger" href="/deliveries?status=DELIVERY_FAILED,RETURNED" note={`${summary.failed} failed · ${summary.returned} returned`} />
          <StatCard label="Delayed" value={summary.delayed} icon={<IconTruck size={22} />} iconClassName="bg-orange-500" href="/deliveries?delayedOnly=true" note="Expected date passed, not delivered" />
        </section>
      ) : (
        summaryError && <ErrorState title="Could not load the summary" message={summaryError} />
      )}

      <DeliveryFilters key={filterKey} customer={customer ? { id: customer.id, label: customer.name, detail: customer.customerCode } : null} />

      <div className="card overflow-hidden">
        {data.items.length === 0 ? (
          <EmptyState
            title={filterKey ? 'No deliveries match' : 'No deliveries yet'}
            description={filterKey ? 'Change or clear the filters.' : 'Create a delivery from an issued final invoice.'}
            action={!filterKey && can('delivery.create') ? <Link href="/deliveries/new" className="btn-primary"><IconPlus size={16} /> Create Delivery</Link> : undefined}
          />
        ) : (
          <>
            <DeliveryTable deliveries={data.items} canReadCustomers={can('customer.read')} canReadInvoices={can('invoice.read')} />
            <Pagination
              meta={data.meta}
              basePath="/deliveries"
              params={{ ...filters, pageSize: pageSize === '25' ? undefined : pageSize }}
              noun="deliveries"
              extra={
                <span className="flex items-center gap-1 text-sm text-ink-muted">
                  Per page:
                  {['10', '25', '50', '100'].map((size) => (
                    size === pageSize
                      ? <span key={size} className="font-semibold text-ink">{size}</span>
                      : <Link key={size} className="hover:text-accent hover:underline" href={`/deliveries${queryString({ ...filters, pageSize: size })}`}>{size}</Link>
                  ))}
                </span>
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
