import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import type { CustomerDeliveryHistory, InvoiceDeliveryHistory } from '@/lib/types';
import { DeliveryTable } from './delivery-table';
import { InvoiceDeliveryStateBadge } from './delivery-badges';
import { EmptyStateClient, PanelHeader } from './panel-shared';
import { ErrorState } from './ui';
import { IconPlus } from './icons';

/**
 * Delivery panels shown on other profiles (final invoice, customer). Server
 * components: each loads its own history so the host page stays unchanged.
 */

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  );
}

export async function InvoiceDeliveriesPanel({
  invoiceId,
  customerId,
  invoiceDeliverable,
  permissions,
}: {
  invoiceId: string;
  customerId: string;
  /** ISSUED or SENT: the API only delivers those. */
  invoiceDeliverable: boolean;
  permissions: string[];
}) {
  const can = (p: string) => permissions.includes(p);
  if (!can('delivery.read')) return <ErrorState title="Not allowed" message="You do not have permission to view deliveries." />;
  let history: InvoiceDeliveryHistory;
  try {
    history = await apiFetch<InvoiceDeliveryHistory>(`/deliveries/invoices/${invoiceId}/history`);
  } catch (error) {
    return <ErrorState title="Could not load deliveries" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }
  const canCreate = can('delivery.create') && invoiceDeliverable && history.unallocatedQuantity > 0;

  return (
    <div className="space-y-5">
      <section className="card">
        <PanelHeader
          title="Delivery position"
          description="From confirmed proofs of delivery. Delivery never changes the invoice amount or its payments."
          actions={canCreate ? <Link href={`/deliveries/new?customerId=${customerId}&invoiceId=${invoiceId}`} className="btn-primary"><IconPlus size={16} /> Create delivery</Link> : undefined}
        />
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2"><span className="text-sm text-ink-muted">Invoice delivery state:</span> <InvoiceDeliveryStateBadge state={history.deliveryState} /></div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Invoiced qty" value={history.invoicedQuantity} />
            <Stat label="Dispatched" value={history.dispatchedQuantity} />
            <Stat label="Confirmed delivered" value={history.confirmedDeliveredQuantity} tone="text-success" />
            <Stat label="Still to deliver" value={history.remainingQuantity} />
            <Stat label="Not on any delivery" value={history.unallocatedQuantity} />
          </div>
          {!canCreate && can('delivery.create') && history.unallocatedQuantity > 0 && !invoiceDeliverable && (
            <p className="text-sm text-ink-muted">Deliveries can be created once the invoice is issued.</p>
          )}
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className="text-right">Invoiced</th>
                <th scope="col" className="text-right">On deliveries</th>
                <th scope="col" className="text-right">Confirmed delivered</th>
                <th scope="col" className="text-right">Not on any delivery</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((i) => (
                <tr key={i.invoiceItemId}>
                  <td>{i.productName}{i.modelName && <span className="block text-xs text-ink-subtle">{i.modelName}</span>}</td>
                  <td className="text-right tabular-nums">{i.invoicedQuantity} {i.unit}</td>
                  <td className="text-right tabular-nums">{i.allocatedQuantity}</td>
                  <td className="text-right tabular-nums">{i.confirmedDeliveredQuantity}</td>
                  <td className="text-right font-semibold tabular-nums">{i.remainingQuantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card overflow-hidden">
        <PanelHeader title="Deliveries" description={`${history.numberOfDeliveries} delivery record${history.numberOfDeliveries === 1 ? '' : 's'} (excluding cancelled).`} />
        {history.deliveries.length === 0 ? (
          <EmptyStateClient title="No deliveries yet" description="Deliveries created for this invoice will appear here." />
        ) : (
          <DeliveryTable deliveries={history.deliveries} canReadCustomers={can('customer.read')} canReadInvoices={can('invoice.read')} />
        )}
      </section>
    </div>
  );
}

export async function CustomerDeliveriesPanel({ customerId, permissions }: { customerId: string; permissions: string[] }) {
  const can = (p: string) => permissions.includes(p);
  if (!can('delivery.read')) return null;
  let history: CustomerDeliveryHistory | null = null;
  let error: string | null = null;
  try {
    history = await apiFetch<CustomerDeliveryHistory>(`/deliveries/customers/${customerId}/history`);
  } catch (e) {
    error = e instanceof ApiError ? e.messages[0] : 'The server could not be reached.';
  }
  return (
    <section className="card">
      <PanelHeader
        title="Delivery History"
        description={history ? `${history.total} deliver${history.total === 1 ? 'y' : 'ies'}${history.total === 300 ? ' (latest 300)' : ''}.` : 'Deliveries to this customer.'}
        actions={can('delivery.create') ? <Link href={`/deliveries/new?customerId=${customerId}`} className="btn-primary"><IconPlus size={16} /> Create delivery</Link> : undefined}
      />
      {error ? (
        <div className="p-5"><ErrorState title="Could not load deliveries" message={error} /></div>
      ) : history && history.deliveries.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-4 p-5 md:grid-cols-6">
            <Stat label="Scheduled" value={history.scheduled} />
            <Stat label="On the way" value={history.inTransit} />
            <Stat label="Delivered" value={history.completed} tone="text-success" />
            <Stat label="Partial" value={history.partiallyDelivered} tone="text-warning" />
            <Stat label="Failed" value={history.failed} tone="text-danger" />
            <Stat label="Delayed" value={history.delayed} tone="text-danger" />
          </div>
          <div className="border-t border-border">
            <DeliveryTable deliveries={history.deliveries.slice(0, 50)} canReadCustomers={false} canReadInvoices={can('invoice.read')} />
          </div>
          {history.deliveries.length > 50 && (
            <p className="border-t border-border px-5 py-3 text-sm"><Link href={`/deliveries?customerId=${customerId}`} className="link-pill font-medium">View all {history.total} deliveries in the register</Link></p>
          )}
        </>
      ) : (
        <EmptyStateClient title="No deliveries yet" description="Deliveries to this customer will appear here." />
      )}
    </section>
  );
}
