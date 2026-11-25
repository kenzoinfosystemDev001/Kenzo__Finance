import Link from 'next/link';
import type { DeliveryListItem } from '@/lib/types';
import { formatDate } from '@/lib/vendor-labels';
import { carrierOf, commonUnit, deliveredQuantityOf, TRANSPORT_MODE_LABELS } from '@/lib/delivery-labels';
import { DelayedBadge, DeliveryStatusBadge } from '@/components/delivery-badges';

/** Delivery list table. Delivered quantity is shown only once confirmed - never inferred from dispatch. */
export function DeliveryTable({ deliveries, canReadCustomers, canReadInvoices }: { deliveries: DeliveryListItem[]; canReadCustomers: boolean; canReadInvoices: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Delivery</th>
            <th scope="col">Invoice</th>
            <th scope="col">Customer</th>
            <th scope="col">Delivery date</th>
            <th scope="col">Expected</th>
            <th scope="col">Transport</th>
            <th scope="col" className="text-right">Quantity</th>
            <th scope="col" className="text-right">Delivered</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => {
            const unit = commonUnit(d.items);
            const delivered = deliveredQuantityOf(d);
            const carrier = carrierOf(d);
            return (
              <tr key={d.id}>
                <td>
                  <Link className="font-semibold text-accent hover:underline" href={`/deliveries/${d.id}`}>
                    {d.deliveryNumber}
                  </Link>
                </td>
                <td>
                  {d.finalInvoice.invoiceNumber ? (
                    canReadInvoices ? (
                      <Link className="text-accent hover:underline" href={`/final-invoices/${d.finalInvoice.id}`}>
                        {d.finalInvoice.invoiceNumber}
                      </Link>
                    ) : (
                      d.finalInvoice.invoiceNumber
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {canReadCustomers ? (
                    <Link className="text-accent hover:underline" href={`/customers/${d.customer.id}`}>
                      {d.customer.name}
                    </Link>
                  ) : (
                    d.customer.name
                  )}
                  <span className="block text-xs text-ink-subtle">{d.customer.customerCode}</span>
                </td>
                <td className="whitespace-nowrap">{formatDate(d.deliveryDate)}</td>
                <td className="whitespace-nowrap">{d.expectedDate ? formatDate(d.expectedDate) : '—'}</td>
                <td>
                  {d.transportMode ? TRANSPORT_MODE_LABELS[d.transportMode] : '—'}
                  {carrier && <span className="block text-xs text-ink-subtle">{carrier}</span>}
                  {d.trackingNumber && <span className="block text-xs text-ink-subtle">{d.trackingNumber}</span>}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {d.totalQuantity}
                  {unit ? ` ${unit}` : ''}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">{delivered === null ? '—' : `${delivered}${unit ? ` ${unit}` : ''}`}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DeliveryStatusBadge status={d.status} />
                    {d.delayed && <DelayedBadge />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
