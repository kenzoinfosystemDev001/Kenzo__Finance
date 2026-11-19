'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import {
  CheckboxField,
  ConfirmDialog,
  isEmail,
  isPhone,
  isPostalCode,
  Modal,
  ResultAlert,
  SelectField,
  TextField,
} from '@/components/client-ui';
import { DocumentsManager } from '@/components/documents-manager';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { emptyCustomerAddress, emptyCustomerContact } from '@/components/customer-form';
import { IconMail, IconMapPin, IconPencil, IconPhone, IconPlus, IconTrash } from '@/components/icons';
import {
  addProductInterestAction,
  deleteCustomerAddressAction,
  deleteCustomerContactAction,
  listProductModelsAction,
  removeCustomerDocumentAction,
  removeProductInterestAction,
  replaceCustomerDocumentAction,
  saveCustomerAddressAction,
  saveCustomerContactAction,
  updateProductInterestAction,
  uploadCustomerDocumentAction,
  type CustomerAddressPayload,
  type CustomerContactPayload,
} from '@/lib/customer-actions';
import { searchProductsAction, type ActionResult } from '@/lib/vendor-actions';
import { CUSTOMER_ADDRESS_TYPE_LABELS, CUSTOMER_DOCUMENT_KIND_LABELS } from '@/lib/customer-labels';
import { formatAddress, formatDate, formatPhone } from '@/lib/vendor-labels';
import type { CustomerAddress, CustomerAddressType, CustomerContact, CustomerDetail, CustomerProductInterest } from '@/lib/types';

const ADDRESS_TYPES = Object.entries(CUSTOMER_ADDRESS_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const remover = 'icon-btn hover:bg-danger-subtle hover:text-danger';

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function CustomerContactsPanel({ customer, canManage }: { customer: CustomerDetail; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomerContact | 'new' | null>(null);
  const [removing, setRemoving] = useState<CustomerContact | null>(null);

  return (
    <section className="card">
      <PanelHeader
        title="Contact persons"
        description="One primary contact. At least one contact must have a phone or email."
        actions={canManage && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><IconPlus size={16} /> Add contact</button>}
      />
      {customer.contacts.length === 0 ? (
        <EmptyStateClient title="No contacts" description="Add the people you deal with at this customer." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Designation</th>
                <th scope="col">Department</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Primary</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {customer.contacts.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td>
                  <td>{c.designation ?? '—'}</td>
                  <td>{c.department ?? '—'}</td>
                  <td>{c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-accent"><IconMail size={14} />{c.email}</a> : '—'}</td>
                  <td className="whitespace-nowrap">
                    {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-accent"><IconPhone size={14} />{formatPhone(c.phone)}</a> : '—'}
                    {c.alternatePhone && <p className="text-xs text-ink-subtle">Alt: {formatPhone(c.alternatePhone)}</p>}
                  </td>
                  <td>{c.isPrimary ? <span className="chip">Primary</span> : <span className="text-ink-subtle">No</span>}</td>
                  {canManage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><IconPencil /></button>
                        <button type="button" className={remover} onClick={() => setRemoving(c)} aria-label={`Remove ${c.name}`}><IconTrash /></button>
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
            customerId={customer.id}
            contact={editing === 'new' ? null : editing}
            open={editing !== null}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove contact?"
            message={<><strong className="text-ink">{removing?.name}</strong> will be removed.{removing?.isPrimary && ' The oldest remaining contact becomes primary.'}</>}
            confirmLabel="Remove contact"
            onConfirm={async () => {
              const outcome = await deleteCustomerContactAction(customer.id, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function ContactModal({ customerId, contact, open, onClose, onSaved }: { customerId: string; contact: CustomerContact | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerContactPayload>(() =>
    contact
      ? { name: contact.name, designation: contact.designation ?? '', department: contact.department ?? '', email: contact.email ?? '', phone: contact.phone ?? '', alternatePhone: contact.alternatePhone ?? '', isPrimary: contact.isPrimary }
      : emptyCustomerContact(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof CustomerContactPayload>(k: K, v: CustomerContactPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (form.email.trim() && !isEmail(form.email)) e.email = 'Enter a valid email address.';
    if (form.phone.trim() && !isPhone(form.phone)) e.phone = 'Enter a valid phone number.';
    if (form.alternatePhone.trim() && !isPhone(form.alternatePhone)) e.alternatePhone = 'Enter a valid phone number.';
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      const outcome = await saveCustomerContactAction(customerId, contact?.id ?? null, form);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={contact ? `Edit ${contact.name}` : 'Add contact person'} footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save contact'}</button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" required value={form.name} onChange={(v) => set('name', v)} error={errors.name} />
        <TextField label="Designation" value={form.designation} onChange={(v) => set('designation', v)} />
        <TextField label="Department" value={form.department} onChange={(v) => set('department', v)} />
        <TextField label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} error={errors.email} />
        <TextField label="Phone" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} inputMode="tel" />
        <TextField label="Alternate Phone" value={form.alternatePhone} onChange={(v) => set('alternatePhone', v)} error={errors.alternatePhone} inputMode="tel" />
        <div className="sm:col-span-2">
          <CheckboxField label="Primary contact" hint={contact?.isPrimary ? 'To change it, mark another contact as primary.' : 'Replaces the current primary contact'} checked={form.isPrimary} disabled={Boolean(contact?.isPrimary)} onChange={(v) => set('isPrimary', v)} />
        </div>
        <div className="sm:col-span-2"><ResultAlert result={result} /></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export function CustomerAddressesPanel({ customer, canManage }: { customer: CustomerDetail; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ address: CustomerAddress | null; preset?: CustomerAddressPayload } | null>(null);
  const [removing, setRemoving] = useState<CustomerAddress | null>(null);
  const billing = customer.addresses.find((a) => a.addressType === 'BILLING' && a.isDefault);

  return (
    <section className="card">
      <PanelHeader
        title="Addresses"
        description="Multiple billing and shipping addresses are allowed; one default per type."
        actions={canManage && (
          <>
            {billing && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing({
                  address: null,
                  preset: { ...emptyCustomerAddress(), ...billing, addressLine2: billing.addressLine2 ?? '', city: billing.city ?? '', state: billing.state ?? '', postalCode: billing.postalCode ?? '', addressType: 'SHIPPING', isDefault: !customer.addresses.some((a) => a.addressType === 'SHIPPING') },
                })}
              >
                Copy billing to shipping
              </button>
            )}
            <button type="button" className="btn-primary" onClick={() => setEditing({ address: null })}><IconPlus size={16} /> Add address</button>
          </>
        )}
      />
      {customer.addresses.length === 0 ? (
        <EmptyStateClient title="No addresses" description="Add billing, shipping, office or registered addresses." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          {customer.addresses.map((a) => (
            <li key={a.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <IconMapPin size={16} className="text-accent" /> {CUSTOMER_ADDRESS_TYPE_LABELS[a.addressType]}
                  {a.isDefault && <span className="chip">Default</span>}
                </p>
                {canManage && (
                  <div className="flex gap-1">
                    <button type="button" className="icon-btn" onClick={() => setEditing({ address: a })} aria-label="Edit address"><IconPencil /></button>
                    <button type="button" className={remover} onClick={() => setRemoving(a)} aria-label="Remove address"><IconTrash /></button>
                  </div>
                )}
              </div>
              <address className="mt-2 text-sm not-italic leading-relaxed text-ink-muted">
                {formatAddress(a).map((line) => <span key={line} className="block">{line}</span>)}
              </address>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <>
          <AddressModal
            key={editing ? editing.address?.id ?? `new-${editing.preset ? 'copy' : 'blank'}` : 'closed'}
            customerId={customer.id}
            address={editing?.address ?? null}
            preset={editing?.preset}
            open={editing !== null}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove address?"
            message={<>This address will be removed.{removing?.isDefault && ' The next address of the same type becomes default.'}</>}
            confirmLabel="Remove address"
            onConfirm={async () => {
              const outcome = await deleteCustomerAddressAction(customer.id, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function AddressModal({ customerId, address, preset, open, onClose, onSaved }: { customerId: string; address: CustomerAddress | null; preset?: CustomerAddressPayload; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerAddressPayload>(() =>
    address
      ? { addressType: address.addressType, addressLine1: address.addressLine1, addressLine2: address.addressLine2 ?? '', city: address.city ?? '', state: address.state ?? '', postalCode: address.postalCode ?? '', country: address.country, isDefault: address.isDefault }
      : preset ?? emptyCustomerAddress(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof CustomerAddressPayload>(k: K, v: CustomerAddressPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!form.addressLine1.trim()) e.addressLine1 = 'Address line 1 is required.';
    if (form.postalCode.trim() && !isPostalCode(form.postalCode)) e.postalCode = 'Enter a valid postal code.';
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      const outcome = await saveCustomerAddressAction(customerId, address?.id ?? null, form);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={address ? 'Edit address' : preset ? 'Add shipping address (copied from billing)' : 'Add address'} footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save address'}</button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Address Type" value={form.addressType} onChange={(v) => set('addressType', v as CustomerAddressType)} options={ADDRESS_TYPES} />
        <div />
        <TextField className="sm:col-span-2" label="Address Line 1" required value={form.addressLine1} onChange={(v) => set('addressLine1', v)} error={errors.addressLine1} />
        <TextField className="sm:col-span-2" label="Address Line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} />
        <TextField label="City" value={form.city} onChange={(v) => set('city', v)} />
        <TextField label="State" value={form.state} onChange={(v) => set('state', v)} />
        <TextField label="Postal Code" value={form.postalCode} onChange={(v) => set('postalCode', v)} error={errors.postalCode} />
        <TextField label="Country" value={form.country} onChange={(v) => set('country', v)} />
        <div className="sm:col-span-2">
          <CheckboxField label="Default address of this type" hint={address?.isDefault ? 'To change it, mark another address of this type as default.' : undefined} checked={form.isDefault} disabled={Boolean(address?.isDefault && address.addressType === form.addressType)} onChange={(v) => set('isDefault', v)} />
        </div>
        <div className="sm:col-span-2"><ResultAlert result={result} /></div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Products of interest (from Product Management)
// ---------------------------------------------------------------------------

export function CustomerProductsPanel({ customer, canManage, canViewProducts }: { customer: CustomerDetail; canManage: boolean; canViewProducts: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [product, setProduct] = useState<SearchOption[]>([]);
  const [models, setModels] = useState<Array<{ id: string; label: string; detail: string; isActive: boolean }>>([]);
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<ActionResult>({});
  const [editing, setEditing] = useState<CustomerProductInterest | null>(null);
  const [removing, setRemoving] = useState<CustomerProductInterest | null>(null);
  const [pending, startTransition] = useTransition();

  const productSearch = useCallback(
    async (term: string) =>
      (await searchProductsAction(term))
        .filter((p) => p.isActive)
        .map((p) => ({ id: p.id, label: p.name, detail: `${p.company.name} · ${p.productCode} · ${p._count.models} model(s)` })),
    [],
  );

  const pickProduct = (next: SearchOption[]) => {
    setProduct(next);
    setModelIds([]);
    setModels([]);
    if (next[0]) startTransition(async () => setModels(await listProductModelsAction(next[0].id)));
  };

  const reset = () => {
    setAdding(false);
    setProduct([]);
    setModels([]);
    setModelIds([]);
    setNotes('');
    setResult({});
  };

  const save = () =>
    startTransition(async () => {
      if (!product[0]) return setResult({ error: 'Select a product.' });
      const outcome = await addProductInterestAction(customer.id, product[0].id, modelIds, notes);
      if (outcome.ok) {
        reset();
        router.refresh();
      } else setResult(outcome);
    });

  return (
    <section className="card">
      <PanelHeader
        title="Products of interest"
        description="Existing products and models from Product Management. This is not an enquiry or an order."
        actions={canManage && <button type="button" className="btn-primary" onClick={() => setAdding(true)}><IconPlus size={16} /> Add product</button>}
      />
      {customer.interests.length === 0 ? (
        <EmptyStateClient title="No products of interest" description="Record which products and models this customer is interested in." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Product Code</th>
                <th scope="col">Brand</th>
                <th scope="col">Model</th>
                <th scope="col">Model Number</th>
                <th scope="col">Date Added</th>
                <th scope="col">Notes</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {customer.interests.map((i) => (
                <tr key={i.id}>
                  <td className="min-w-[160px] font-semibold">
                    {canViewProducts ? <Link href={`/products/${i.product.id}`} className="hover:text-accent hover:underline">{i.product.name}</Link> : i.product.name}
                    {(!i.product.isActive || i.product.archivedAt) && <p className="text-xs font-normal text-warning">Product no longer active</p>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs text-ink-muted">{i.product.productCode}</td>
                  <td>{i.product.company.name}</td>
                  <td>{i.productModel?.modelName ?? <span className="text-ink-subtle">Any model</span>}</td>
                  <td className="font-mono text-sm">{i.productModel?.modelNumber ?? '—'}</td>
                  <td className="whitespace-nowrap">{formatDate(i.createdAt)}</td>
                  <td className="max-w-[240px] text-sm text-ink-muted">{i.notes ?? '—'}</td>
                  {canManage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" onClick={() => setEditing(i)} aria-label="Edit notes"><IconPencil /></button>
                        <button type="button" className={remover} onClick={() => setRemoving(i)} aria-label="Remove product"><IconTrash /></button>
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
          <Modal
            open={adding}
            onClose={reset}
            size="lg"
            title="Add product of interest"
            description="Search the shared catalogue. Pick specific models, or none for interest in the product generally."
            footer={<><button type="button" className="btn-secondary" onClick={reset} disabled={pending}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={pending || !product[0]}>{pending ? 'Saving...' : 'Add'}</button></>}
          >
            <div className="space-y-4">
              <SearchSelect label="Product" placeholder="Search by product, code or model..." search={productSearch} selected={product} onChange={pickProduct} emptyText="No active products found" />
              {product[0] && (
                models.length === 0 ? (
                  <p className="text-sm text-ink-subtle">{pending ? 'Loading models...' : 'This product has no models; the interest will be recorded for the product.'}</p>
                ) : (
                  <fieldset>
                    <legend className="field-label">Models (optional)</legend>
                    <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
                      {models.map((m) => (
                        <CheckboxField
                          key={m.id}
                          label={`${m.label}${m.isActive ? '' : ' (inactive)'}`}
                          hint={m.detail}
                          checked={modelIds.includes(m.id)}
                          onChange={(checked) => setModelIds((ids) => (checked ? [...ids, m.id] : ids.filter((x) => x !== m.id)))}
                        />
                      ))}
                    </div>
                  </fieldset>
                )
              )}
              <div>
                <label htmlFor="interest-notes" className="field-label">Notes</label>
                <textarea id="interest-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field-input" placeholder="e.g. Needs 50 units for a Q3 office rollout" />
              </div>
              <ResultAlert result={result} />
            </div>
          </Modal>
          <NotesModal key={editing?.id ?? 'closed'} customerId={customer.id} interest={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove product of interest?"
            message={<><strong className="text-ink">{removing?.product.name}{removing?.productModel ? ` - ${removing.productModel.modelName}` : ''}</strong> will be removed from this customer. The product itself is not changed.</>}
            confirmLabel="Remove"
            onConfirm={async () => {
              const outcome = await removeProductInterestAction(customer.id, removing!.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function NotesModal({ customerId, interest, onClose, onSaved }: { customerId: string; interest: CustomerProductInterest | null; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(interest?.notes ?? '');
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  return (
    <Modal
      open={interest !== null}
      onClose={onClose}
      size="sm"
      title="Edit notes"
      description={interest ? `${interest.product.name}${interest.productModel ? ` - ${interest.productModel.modelName}` : ''}` : undefined}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button><button type="button" className="btn-primary" disabled={pending} onClick={() => startTransition(async () => { const o = await updateProductInterestAction(customerId, interest!.id, notes); if (o.ok) onSaved(); else setResult(o); })}>{pending ? 'Saving...' : 'Save'}</button></>}
    >
      <div className="space-y-3">
        <textarea aria-label="Notes" rows={4} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="field-input" />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const KINDS = Object.entries(CUSTOMER_DOCUMENT_KIND_LABELS).map(([value, label]) => ({ value, label }));

export function CustomerDocumentsPanel({ customer, canUpload, canRemove, canDownload }: { customer: CustomerDetail; canUpload: boolean; canRemove: boolean; canDownload: boolean }) {
  return (
    <DocumentsManager
      basePath={`/customers/${customer.id}/documents`}
      documents={customer.documents}
      kinds={KINDS}
      canUpload={canUpload}
      canRemove={canRemove}
      canDownload={canDownload}
      emptyText="Upload the GST certificate, PAN, registration certificate, agreements or purchase authorizations."
      onUpload={(data) => uploadCustomerDocumentAction(customer.id, data)}
      onReplace={(documentId, data) => replaceCustomerDocumentAction(customer.id, documentId, data)}
      onRemove={(documentId) => removeCustomerDocumentAction(customer.id, documentId)}
    />
  );
}
