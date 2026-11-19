'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  CheckboxField,
  ConfirmDialog,
  isPostalCode,
  Modal,
  ResultAlert,
  SelectField,
  TextField,
} from '@/components/client-ui';
import { IconMapPin, IconPencil, IconPlus, IconTrash } from '@/components/icons';
import { emptyAddress } from '@/components/vendor-form';
import {
  deleteAddressAction,
  saveAddressAction,
  type ActionResult,
  type AddressPayload,
} from '@/lib/vendor-actions';
import { ADDRESS_TYPE_LABELS, formatAddress } from '@/lib/vendor-labels';
import type { VendorAddress, VendorAddressType } from '@/lib/types';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';

const ADDRESS_TYPES = Object.entries(ADDRESS_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function AddressesPanel({
  vendorId,
  addresses,
  canManage,
}: {
  vendorId: string;
  addresses: VendorAddress[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<VendorAddress | 'new' | null>(null);
  const [removing, setRemoving] = useState<VendorAddress | null>(null);

  return (
    <section className="card">
      <PanelHeader
        title="Addresses"
        description="The primary address is shown on the vendor list and exports."
        actions={
          canManage && (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              <IconPlus size={16} /> Add address
            </button>
          )
        }
      />

      {addresses.length === 0 ? (
        <EmptyStateClient title="No addresses yet" description="Add the registered office, branch offices or warehouses." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <IconMapPin size={16} className="text-accent" />
                  <p className="text-sm font-semibold text-ink">
                    {ADDRESS_TYPE_LABELS[address.addressType]}
                    {address.label && <span className="font-normal text-ink-muted"> &middot; {address.label}</span>}
                  </p>
                  {address.isPrimary && <span className="chip">Primary</span>}
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button type="button" className="icon-btn" onClick={() => setEditing(address)} aria-label="Edit address">
                      <IconPencil />
                    </button>
                    <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(address)} aria-label="Remove address">
                      <IconTrash />
                    </button>
                  </div>
                )}
              </div>
              <address className="mt-2 text-sm not-italic leading-relaxed text-ink-muted">
                {formatAddress(address).map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <>
          <AddressModal
            key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
            open={editing !== null}
            vendorId={vendorId}
            address={editing === 'new' ? null : editing}
            isFirst={addresses.length === 0}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove address?"
            message={
              <>
                This address will be removed from the vendor.
                {removing?.isPrimary && ' The oldest remaining address becomes primary.'}
              </>
            }
            confirmLabel="Remove address"
            onConfirm={async () => {
              const outcome = await deleteAddressAction(vendorId, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function AddressModal({
  open,
  vendorId,
  address,
  isFirst,
  onClose,
  onSaved,
}: {
  open: boolean;
  vendorId: string;
  address: VendorAddress | null;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AddressPayload>(() =>
    address
      ? {
          addressType: address.addressType,
          label: address.label ?? '',
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? '',
          city: address.city ?? '',
          state: address.state ?? '',
          postalCode: address.postalCode ?? '',
          country: address.country,
          isPrimary: address.isPrimary,
        }
      : emptyAddress({ addressType: isFirst ? 'REGISTERED_OFFICE' : 'OFFICE', isPrimary: isFirst }),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof AddressPayload>(key: K, value: AddressPayload[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const found: Record<string, string> = {};
    if (!form.addressLine1.trim()) found.addressLine1 = 'Address line 1 is required.';
    if (form.postalCode.trim() && !isPostalCode(form.postalCode)) found.postalCode = 'Enter a valid PIN / postal code.';
    setErrors(found);
    if (Object.keys(found).length) return;

    startTransition(async () => {
      const outcome = await saveAddressAction(vendorId, address?.id ?? null, form);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={address ? 'Edit address' : 'Add address'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Saving...' : 'Save address'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Address Type" value={form.addressType} onChange={(v) => set('addressType', v as VendorAddressType)} options={ADDRESS_TYPES} />
        <TextField label="Label" value={form.label} onChange={(v) => set('label', v)} placeholder="e.g. Nehru Place branch" />
        <TextField className="sm:col-span-2" label="Address Line 1" required value={form.addressLine1} onChange={(v) => set('addressLine1', v)} error={errors.addressLine1} />
        <TextField className="sm:col-span-2" label="Address Line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} />
        <TextField label="City" value={form.city} onChange={(v) => set('city', v)} />
        <TextField label="State" value={form.state} onChange={(v) => set('state', v)} />
        <TextField label="PIN Code" value={form.postalCode} onChange={(v) => set('postalCode', v)} error={errors.postalCode} inputMode="numeric" />
        <TextField label="Country" value={form.country} onChange={(v) => set('country', v)} />
        <div className="sm:col-span-2">
          <CheckboxField
            label="Primary address"
            hint={address?.isPrimary ? 'To change the primary address, mark another address as primary.' : 'Replaces the current primary address'}
            checked={form.isPrimary}
            disabled={Boolean(address?.isPrimary)}
            onChange={(checked) => set('isPrimary', checked)}
          />
        </div>
        <div className="sm:col-span-2">
          <ResultAlert result={result} />
        </div>
      </div>
    </Modal>
  );
}
