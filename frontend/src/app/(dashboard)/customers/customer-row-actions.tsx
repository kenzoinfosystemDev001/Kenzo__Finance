'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import { IconCheckCircle, IconClock, IconEye, IconMapPin, IconPause, IconPencil, IconTrash, IconUsers } from '@/components/icons';
import { deleteCustomerAction, setCustomerStatusAction } from '@/lib/customer-actions';
import type { CustomerStatus } from '@/lib/types';

/** View / Edit / More for one customer. Items follow permissions; the API enforces the same. */
export function CustomerRowActions({
  customer,
  permissions,
  compact = true,
  afterDelete = 'refresh',
}: {
  customer: { id: string; name: string; status: CustomerStatus };
  permissions: string[];
  compact?: boolean;
  afterDelete?: 'refresh' | 'list';
}) {
  const router = useRouter();
  const [pending, setPending] = useState<'activate' | 'deactivate' | 'delete' | null>(null);
  const can = (p: string) => permissions.includes(p);
  const go = (tab: string) => () => router.push(`/customers/${customer.id}?tab=${tab}`);

  const items: MenuItem[] = [];
  if (compact) {
    items.push({ label: 'Manage contacts', icon: <IconUsers size={16} />, onSelect: go('contacts') });
    items.push({ label: 'Manage addresses', icon: <IconMapPin size={16} />, onSelect: go('addresses') });
    items.push({ label: 'View activity', icon: <IconClock size={16} />, onSelect: go('activity') });
  }
  if (can('customer.update')) {
    items.push(
      customer.status === 'ACTIVE'
        ? { label: 'Deactivate', icon: <IconPause size={16} />, onSelect: () => setPending('deactivate') }
        : { label: 'Activate', icon: <IconCheckCircle size={16} />, onSelect: () => setPending('activate') },
    );
  }
  if (can('customer.delete')) {
    items.push({ label: 'Delete permanently', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setPending('delete') });
  }

  const done = async (result: Promise<{ ok?: boolean }>) => {
    const outcome = await result;
    if (outcome.ok) router.refresh();
    return outcome;
  };
  const name = <strong className="text-ink">{customer.name}</strong>;

  return (
    <div className="flex items-center justify-end gap-1">
      {compact && (
        <>
          <Link href={`/customers/${customer.id}`} className="icon-btn" aria-label={`View ${customer.name}`} title="View"><IconEye /></Link>
          {can('customer.update') && (
            <Link href={`/customers/${customer.id}/edit`} className="icon-btn" aria-label={`Edit ${customer.name}`} title="Edit"><IconPencil /></Link>
          )}
        </>
      )}
      <ActionMenu items={items} label={`More actions for ${customer.name}`} />

      <ConfirmDialog
        open={pending === 'deactivate'}
        onClose={() => setPending(null)}
        title="Deactivate customer?"
        message={<>{name} stays on record with all contacts, addresses and history, but will not be offered for new enquiries or quotations.</>}
        confirmLabel="Deactivate"
        withReason
        onConfirm={(reason) => done(setCustomerStatusAction(customer.id, 'INACTIVE', reason))}
      />
      <ConfirmDialog
        open={pending === 'activate'}
        onClose={() => setPending(null)}
        title="Activate customer?"
        message={<>{name} will be available for new business again.</>}
        confirmLabel="Activate"
        tone="primary"
        withReason
        onConfirm={(reason) => done(setCustomerStatusAction(customer.id, 'ACTIVE', reason))}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title="Delete customer permanently?"
        message={
          <>
            This removes {name} with its contacts, addresses and products of interest. It is refused while documents (or,
            later, enquiries, quotations, invoices or deliveries) refer to the customer &mdash; deactivate instead. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteCustomerAction(customer.id);
          if (outcome.ok) {
            if (afterDelete === 'list') router.push('/customers');
            else router.refresh();
          }
          return outcome;
        }}
      />
    </div>
  );
}
