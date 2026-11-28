import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { CustomerDetail, DeliveryDetail, FinalInvoiceDetail } from '@/lib/types';
import { DELIVERY_STATUS_LABELS } from '@/lib/delivery-labels';
import { todayIso } from '@/lib/enquiry-labels';
import { ErrorState } from '@/components/ui';
import type { SearchOption } from '@/components/search-select';
import { IconChevronLeft } from '@/components/icons';
import { CreateDeliveryForm, type RedeliveryPrefill } from '../delivery-form';

export const metadata: Metadata = { title: 'Create Delivery' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (v: string | undefined) => (v && UUID.test(v) ? v : null);

export default async function NewDeliveryPage({ searchParams }: { searchParams: Promise<{ customerId?: string; invoiceId?: string; redeliveryOf?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  if (!can('delivery.create')) return <ErrorState title="Not allowed" message="You do not have permission to create deliveries." />;

  let customer: SearchOption | null = null;
  let invoiceId = valid(params.invoiceId);
  let redelivery: RedeliveryPrefill | null = null;
  let notice: string | null = null;

  const redeliveryOf = valid(params.redeliveryOf);
  if (redeliveryOf) {
    let original: DeliveryDetail;
    try {
      original = await apiFetch<DeliveryDetail>(`/deliveries/${redeliveryOf}`);
    } catch (error) {
      return <ErrorState title="Could not load the returned delivery" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
    }
    if (original.status !== 'RETURNED') {
      return (
        <ErrorState
          title="Cannot redeliver"
          message={`Delivery ${original.deliveryNumber} is ${DELIVERY_STATUS_LABELS[original.status].toLowerCase()}. Only a returned delivery can be redelivered; reschedule a failed delivery instead.`}
        />
      );
    }
    customer = { id: original.customer.id, label: original.customer.name, detail: original.customer.customerCode };
    invoiceId = original.finalInvoice.id;
    redelivery = {
      id: original.id,
      deliveryNumber: original.deliveryNumber,
      deliveryAddress: original.deliveryAddress,
      contactPerson: original.contactPerson,
      contactNumber: original.contactNumber,
      quantities: Object.fromEntries(original.items.map((i) => [i.invoiceItemId, i.quantity])),
    };
  } else {
    const customerId = valid(params.customerId);
    // Lookups below only preselect the customer; on failure the user picks it.
    if (customerId) {
      try {
        const c = await apiFetch<CustomerDetail>(`/customers/${customerId}`);
        customer = { id: c.id, label: c.name, detail: c.customerCode };
      } catch (error) {
        notice = `The customer could not be preselected (${error instanceof ApiError ? error.messages[0] : 'server unreachable'}). Search for it below.`;
      }
    } else if (invoiceId) {
      try {
        const inv = await apiFetch<FinalInvoiceDetail>(`/final-invoices/${invoiceId}`);
        customer = { id: inv.customer.id, label: inv.customer.name, detail: inv.customer.customerCode };
      } catch (error) {
        notice = `The invoice's customer could not be preselected (${error instanceof ApiError ? error.messages[0] : 'server unreachable'}). Search for the customer below.`;
      }
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/deliveries" className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> All deliveries</Link>
      <div>
        <h1 className="text-xl font-bold text-ink">{redelivery ? 'Create Redelivery' : 'Create Delivery'}</h1>
        <p className="text-sm text-ink-muted">Choose an issued final invoice and the quantities to send. Nothing here changes the invoice amount or its payments.</p>
      </div>
      {notice && <p role="status" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-2.5 text-sm text-warning">{notice}</p>}
      <CreateDeliveryForm today={todayIso()} initialCustomer={customer} initialInvoiceId={invoiceId} redelivery={redelivery} canReadCustomers={can('customer.read')} />
    </div>
  );
}
