'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ActionMenu, ConfirmDialog, type MenuItem } from '@/components/client-ui';
import { IconArchive, IconBox, IconCheckCircle, IconEye, IconHandshake, IconPause, IconPencil, IconRefresh, IconTrash } from '@/components/icons';
import { archiveProductAction, deleteProductAction, restoreProductAction, setProductStatusAction } from '@/lib/product-actions';

type Pending = 'activate' | 'deactivate' | 'archive' | 'restore' | 'delete' | null;

/** View / Edit / More for one product. Each item needs its permission; the API enforces the same. */
export function ProductRowActions({
  product,
  permissions,
  compact = true,
  afterDelete = 'refresh',
}: {
  product: { id: string; name: string; isActive: boolean; archivedAt: string | null };
  permissions: string[];
  compact?: boolean;
  afterDelete?: 'refresh' | 'list';
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const can = (permission: string) => permissions.includes(permission);
  const archived = Boolean(product.archivedAt);

  const items: MenuItem[] = [];
  if (compact) {
    items.push({ label: 'Manage models', icon: <IconBox size={16} />, onSelect: () => router.push(`/products/${product.id}?tab=models`) });
    items.push({ label: 'Manage vendors', icon: <IconHandshake size={16} />, onSelect: () => router.push(`/products/${product.id}?tab=vendors`) });
  }
  if (!archived && can('product.update')) {
    items.push(
      product.isActive
        ? { label: 'Deactivate', icon: <IconPause size={16} />, onSelect: () => setPending('deactivate') }
        : { label: 'Activate', icon: <IconCheckCircle size={16} />, onSelect: () => setPending('activate') },
    );
  }
  if (can('product.archive')) {
    items.push(
      archived
        ? { label: 'Restore from archive', icon: <IconRefresh size={16} />, onSelect: () => setPending('restore') }
        : { label: 'Archive', icon: <IconArchive size={16} />, onSelect: () => setPending('archive') },
    );
  }
  if (can('product.delete')) {
    items.push({ label: 'Delete permanently', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setPending('delete') });
  }

  const done = async (result: Promise<{ ok?: boolean }>) => {
    const outcome = await result;
    if (outcome.ok) router.refresh();
    return outcome;
  };
  const name = <strong className="text-ink">{product.name}</strong>;

  return (
    <div className="flex items-center justify-end gap-1">
      {compact && (
        <>
          <Link href={`/products/${product.id}`} className="icon-btn" aria-label={`View ${product.name}`} title="View">
            <IconEye />
          </Link>
          {can('product.update') && !archived && (
            <Link href={`/products/${product.id}/edit`} className="icon-btn" aria-label={`Edit ${product.name}`} title="Edit">
              <IconPencil />
            </Link>
          )}
        </>
      )}
      <ActionMenu items={items} label={`More actions for ${product.name}`} />

      <ConfirmDialog
        open={pending === 'deactivate'}
        onClose={() => setPending(null)}
        title="Deactivate product?"
        message={<>{name} stays in the catalogue with its models, vendors and history, but is not offered for new business.</>}
        confirmLabel="Deactivate"
        withReason
        onConfirm={(reason) => done(setProductStatusAction(product.id, false, reason))}
      />
      <ConfirmDialog
        open={pending === 'activate'}
        onClose={() => setPending(null)}
        title="Activate product?"
        message={<>{name} will be available for new business again.</>}
        confirmLabel="Activate"
        tone="primary"
        withReason
        onConfirm={(reason) => done(setProductStatusAction(product.id, true, reason))}
      />
      <ConfirmDialog
        open={pending === 'archive'}
        onClose={() => setPending(null)}
        title="Archive product?"
        message={<>{name} will be hidden from the catalogue and set inactive. Nothing is deleted; it can be restored.</>}
        confirmLabel="Archive"
        onConfirm={() => done(archiveProductAction(product.id))}
      />
      <ConfirmDialog
        open={pending === 'restore'}
        onClose={() => setPending(null)}
        title="Restore product?"
        message={<>{name} will be restored and set active.</>}
        confirmLabel="Restore"
        tone="primary"
        onConfirm={() => done(restoreProductAction(product.id))}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title="Delete product permanently?"
        message={
          <>
            This removes {name} and its models. It is only allowed when no vendor is mapped and there are no
            documents or stock movements &mdash; otherwise deactivate or archive it. This cannot be undone.
          </>
        }
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          const outcome = await deleteProductAction(product.id);
          if (outcome.ok) {
            if (afterDelete === 'list') router.push('/products');
            else router.refresh();
          }
          return outcome;
        }}
      />
    </div>
  );
}
