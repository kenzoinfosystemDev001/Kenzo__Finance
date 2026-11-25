'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import {
  IconArchive,
  IconCheckCircle,
  IconEye,
  IconPause,
  IconPencil,
  IconRefresh,
  IconTrash,
} from '@/components/icons';
import {
  archiveVendorAction,
  deleteVendorAction,
  restoreVendorAction,
  setVendorStatusAction,
} from '@/lib/vendor-actions';
import type { VendorStatus } from '@/lib/types';

type Pending = 'activate' | 'deactivate' | 'archive' | 'restore' | 'delete' | null;

/**
 * View / Edit / More actions for one vendor. Each item is shown only when the
 * user holds the permission; the API enforces the same rule regardless.
 */
export function VendorRowActions({
  vendor,
  permissions,
  compact = true,
  afterDelete = 'refresh',
}: {
  vendor: { id: string; businessName: string; status: VendorStatus; archivedAt: string | null };
  permissions: string[];
  compact?: boolean;
  afterDelete?: 'refresh' | 'list';
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const can = (permission: string) => permissions.includes(permission);
  const archived = Boolean(vendor.archivedAt);

  const items: MenuItem[] = [];
  if (!archived && can('vendor.deactivate')) {
    items.push(
      vendor.status === 'ACTIVE'
        ? { label: 'Deactivate', icon: <IconPause size={16} />, onSelect: () => setPending('deactivate') }
        : { label: 'Activate', icon: <IconCheckCircle size={16} />, onSelect: () => setPending('activate') },
    );
  }
  if (can('vendor.archive')) {
    items.push(
      archived
        ? { label: 'Restore from archive', icon: <IconRefresh size={16} />, onSelect: () => setPending('restore') }
        : { label: 'Archive', icon: <IconArchive size={16} />, onSelect: () => setPending('archive') },
    );
  }
  if (can('vendor.delete')) {
    items.push({ label: 'Delete permanently', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setPending('delete') });
  }

  const done = async (result: Promise<{ ok?: boolean }>) => {
    const outcome = await result;
    if (outcome.ok) router.refresh();
    return outcome;
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {compact && (
        <>
          <Link href={`/vendors/${vendor.id}`} className="icon-btn" aria-label={`View ${vendor.businessName}`} title="View">
            <IconEye />
          </Link>
          {can('vendor.update') && !archived && (
            <Link href={`/vendors/${vendor.id}/edit`} className="icon-btn" aria-label={`Edit ${vendor.businessName}`} title="Edit">
              <IconPencil />
            </Link>
          )}
        </>
      )}
      <ActionMenu items={items} label={`More actions for ${vendor.businessName}`} />

      <ConfirmDialog
        open={pending === 'deactivate'}
        onClose={() => setPending(null)}
        title="Deactivate vendor?"
        message={
          <>
            <strong className="text-ink">{vendor.businessName}</strong> will stay on record with all
            contacts, mappings and history, but will not be offered for new business.
          </>
        }
        confirmLabel="Deactivate"
        withReason
        onConfirm={(reason) => done(setVendorStatusAction(vendor.id, 'INACTIVE', reason))}
      />
      <ConfirmDialog
        open={pending === 'activate'}
        onClose={() => setPending(null)}
        title="Activate vendor?"
        message={<><strong className="text-ink">{vendor.businessName}</strong> will be available for new business again.</>}
        confirmLabel="Activate"
        tone="primary"
        withReason
        onConfirm={(reason) => done(setVendorStatusAction(vendor.id, 'ACTIVE', reason))}
      />
      <ConfirmDialog
        open={pending === 'archive'}
        onClose={() => setPending(null)}
        title="Archive vendor?"
        message={
          <>
            <strong className="text-ink">{vendor.businessName}</strong> will be hidden from the vendor list
            and set inactive. Nothing is deleted and it can be restored at any time.
          </>
        }
        confirmLabel="Archive"
        withReason
        onConfirm={(reason) => done(archiveVendorAction(vendor.id, reason))}
      />
      <ConfirmDialog
        open={pending === 'restore'}
        onClose={() => setPending(null)}
        title="Restore vendor?"
        message={<><strong className="text-ink">{vendor.businessName}</strong> will be restored and set active.</>}
        confirmLabel="Restore"
        tone="primary"
        onConfirm={() => done(restoreVendorAction(vendor.id))}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title="Delete vendor permanently?"
        message={
          <>
            This removes <strong className="text-ink">{vendor.businessName}</strong> and its contacts,
            addresses and brand mappings. It is only allowed for a vendor with no product mappings or
            documents &mdash; otherwise deactivate or archive it to keep its history. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteVendorAction(vendor.id);
          if (outcome.ok) {
            if (afterDelete === 'list') router.push('/vendors');
            else router.refresh();
          }
          return outcome;
        }}
      />
    </div>
  );
}
