import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { DeliveryDetail } from '@/lib/types';
import { DELIVERY_STATUS_LABELS, EDITABLE } from '@/lib/delivery-labels';
import { todayIso } from '@/lib/enquiry-labels';
import { ErrorState } from '@/components/ui';
import { DeliveryStatusBadge } from '@/components/delivery-badges';
import { IconChevronLeft } from '@/components/icons';
import { EditDeliveryForm } from '../../delivery-form';

export const metadata: Metadata = { title: 'Edit Delivery' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** YYYY-MM-DD of a @db.Date value for a date input (not for display). */
const inputDate = (value: string | null) => (value ? value.slice(0, 10) : '');

export default async function EditDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getCurrentUser();
  if (!user?.permissions.includes('delivery.update')) return <ErrorState title="Not allowed" message="You do not have permission to edit deliveries." />;

  let d: DeliveryDetail;
  try {
    d = await apiFetch<DeliveryDetail>(`/deliveries/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return <ErrorState title="Could not load delivery" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }

  const back = <Link href={`/deliveries/${d.id}`} className="link-pill-neutral text-sm"><IconChevronLeft size={16} /> Back to {d.deliveryNumber}</Link>;
  if (!EDITABLE.includes(d.status) || d.challanDocumentId || d.packingDocumentId) {
    return (
      <div className="space-y-5">
        {back}
        <ErrorState title="Cannot edit" message={`A ${DELIVERY_STATUS_LABELS[d.status].toLowerCase()} delivery cannot be edited. Only draft, scheduled or ready-for-dispatch deliveries without dispatch documents can.`} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-xl font-bold text-ink">Edit {d.deliveryNumber}</h1>
        <DeliveryStatusBadge status={d.status} />
      </div>
      <p className="text-sm text-ink-muted">Customer {d.customer.name} &middot; Invoice <span className="font-mono">{d.finalInvoice.invoiceNumber}</span></p>
      <EditDeliveryForm
        deliveryId={d.id}
        deliveryNumber={d.deliveryNumber}
        today={todayIso()}
        canEditItems={d.canEditItems}
        hasPackages={d.packingLists.length > 0}
        positions={d.invoicePositions}
        current={Object.fromEntries(d.items.map((i) => [i.invoiceItemId, { quantity: i.quantity, packageCount: i.packageCount, remarks: i.remarks }]))}
        initial={{
          deliveryDate: inputDate(d.deliveryDate),
          expectedDate: inputDate(d.expectedDate),
          deliveryAddress: d.deliveryAddress,
          contactPerson: d.contactPerson ?? '',
          contactNumber: d.contactNumber ?? '',
          internalRemarks: d.internalRemarks ?? '',
        }}
      />
    </div>
  );
}
