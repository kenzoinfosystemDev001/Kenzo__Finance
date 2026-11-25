'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  CheckboxField,
  ConfirmDialog,
  isEmail,
  isPhone,
  Modal,
  ResultAlert,
  SelectField,
  TextField,
} from '@/components/client-ui';
import { EmptyStateClient } from '@/components/panel-shared';
import { IconMail, IconPencil, IconPhone, IconPlus, IconTrash } from '@/components/icons';
import { emptyContact } from '@/components/vendor-form';
import {
  deleteContactAction,
  saveContactAction,
  type ActionResult,
  type ContactPayload,
} from '@/lib/vendor-actions';
import { CONTACT_TYPE_LABELS, formatPhone } from '@/lib/vendor-labels';
import type { VendorContact, VendorContactType } from '@/lib/types';

const CONTACT_TYPES = Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function ContactsPanel({
  vendorId,
  contacts,
  canManage,
}: {
  vendorId: string;
  contacts: VendorContact[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<VendorContact | 'new' | null>(null);
  const [removing, setRemoving] = useState<VendorContact | null>(null);

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-lg font-semibold text-ink">Contact persons</h2>
          <p className="text-sm text-ink-muted">One primary contact per contact type.</p>
        </div>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            <IconPlus size={16} /> Add contact
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <EmptyStateClient title="No contacts yet" description="Add the people you deal with at this vendor." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Mobile</th>
                <th scope="col">Email</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <p className="font-semibold">
                      {contact.name}
                      {contact.isPrimary && <span className="chip ml-2">Primary</span>}
                    </p>
                    {contact.designation && <p className="text-xs text-ink-subtle">{contact.designation}</p>}
                  </td>
                  <td>{CONTACT_TYPE_LABELS[contact.contactType]}</td>
                  <td className="whitespace-nowrap">
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                        <IconPhone size={14} /> {formatPhone(contact.phone)}
                      </a>
                    ) : (
                      <span className="text-ink-subtle">&mdash;</span>
                    )}
                    {contact.alternatePhone && <p className="text-xs text-ink-subtle">Alt: {formatPhone(contact.alternatePhone)}</p>}
                  </td>
                  <td>
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                        <IconMail size={14} /> {contact.email}
                      </a>
                    ) : (
                      <span className="text-ink-subtle">&mdash;</span>
                    )}
                    {contact.alternateEmail && <p className="text-xs text-ink-subtle">Alt: {contact.alternateEmail}</p>}
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" onClick={() => setEditing(contact)} aria-label={`Edit ${contact.name}`}>
                          <IconPencil />
                        </button>
                        <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(contact)} aria-label={`Remove ${contact.name}`}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <ContactModal
            key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
            open={editing !== null}
            vendorId={vendorId}
            contact={editing === 'new' ? null : editing}
            isFirst={contacts.length === 0}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove contact?"
            message={
              <>
                <strong className="text-ink">{removing?.name}</strong> will be removed from this vendor.
                {removing?.isPrimary && ' The next contact of the same type becomes primary.'}
              </>
            }
            confirmLabel="Remove contact"
            onConfirm={async () => {
              const outcome = await deleteContactAction(vendorId, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function ContactModal({
  open,
  vendorId,
  contact,
  isFirst,
  onClose,
  onSaved,
}: {
  open: boolean;
  vendorId: string;
  contact: VendorContact | null;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ContactPayload>(() =>
    contact
      ? {
          contactType: contact.contactType,
          name: contact.name,
          designation: contact.designation ?? '',
          phone: contact.phone ?? '',
          alternatePhone: contact.alternatePhone ?? '',
          email: contact.email ?? '',
          alternateEmail: contact.alternateEmail ?? '',
          isPrimary: contact.isPrimary,
          notes: contact.notes ?? '',
        }
      : emptyContact({ isPrimary: isFirst }),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ContactPayload>(key: K, value: ContactPayload[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Contact name is required.';
    if (form.phone.trim() && !isPhone(form.phone)) found.phone = 'Enter a valid mobile number.';
    if (form.alternatePhone.trim() && !isPhone(form.alternatePhone)) found.alternatePhone = 'Enter a valid mobile number.';
    if (form.email.trim() && !isEmail(form.email)) found.email = 'Enter a valid email address.';
    if (form.alternateEmail.trim() && !isEmail(form.alternateEmail)) found.alternateEmail = 'Enter a valid email address.';
    setErrors(found);
    if (Object.keys(found).length) return;

    startTransition(async () => {
      const outcome = await saveContactAction(vendorId, contact?.id ?? null, form);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? `Edit ${contact.name}` : 'Add contact person'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Saving...' : 'Save contact'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Contact Person" required value={form.name} onChange={(v) => set('name', v)} error={errors.name} />
        <TextField label="Designation" value={form.designation} onChange={(v) => set('designation', v)} />
        <SelectField label="Contact Type" value={form.contactType} onChange={(v) => set('contactType', v as VendorContactType)} options={CONTACT_TYPES} />
        <div className="flex items-end pb-2">
          <CheckboxField
            label="Primary contact for this type"
            hint="Replaces the current primary of the same type"
            checked={form.isPrimary}
            onChange={(checked) => set('isPrimary', checked)}
          />
        </div>
        <TextField label="Mobile Number" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} inputMode="tel" />
        <TextField label="Alternate Mobile" value={form.alternatePhone} onChange={(v) => set('alternatePhone', v)} error={errors.alternatePhone} inputMode="tel" />
        <TextField label="Email Address" type="email" value={form.email} onChange={(v) => set('email', v)} error={errors.email} />
        <TextField label="Alternate Email" type="email" value={form.alternateEmail} onChange={(v) => set('alternateEmail', v)} error={errors.alternateEmail} />
        <div className="sm:col-span-2">
          <ResultAlert result={result} />
        </div>
      </div>
    </Modal>
  );
}
