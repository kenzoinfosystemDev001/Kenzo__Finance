'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import {
  createEnquiryAction,
  getCustomerForEnquiryAction,
  listModelsWithSpecsAction,
  searchCustomersAction,
  updateEnquiryAction,
  type EnquiryDetailsPayload,
  type EnquiryItemPayload,
  type ModelOption,
} from '@/lib/enquiry-actions';
import { searchBrandsAction, searchProductsAction, type ActionResult } from '@/lib/vendor-actions';
import {
  ENQUIRY_DOCUMENT_KIND_LABELS,
  ENQUIRY_PRIORITIES,
  ENQUIRY_PRIORITY_LABELS,
} from '@/lib/enquiry-labels';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { formatAddress, formatBytes, formatPhone } from '@/lib/vendor-labels';
import type {
  CustomerAddress,
  CustomerContact,
  CustomerStatus,
  CustomerType,
  EnquiryAssignee,
  EnquiryDocumentKind,
  EnquiryPriority,
  EnquirySource,
} from '@/lib/types';
import { ResultAlert, SelectField, TextField } from './client-ui';
import { SearchSelect, type SearchOption } from './search-select';
import { IconAlert, IconArrowRight, IconPlus, IconTrash, IconUpload } from './icons';

// ---------------------------------------------------------------------------
// Product requirement fields (shared with the enquiry profile's item modal)
// ---------------------------------------------------------------------------

export interface RequirementRow {
  key: string;
  brand: SearchOption[];
  product: SearchOption[];
  productCode: string;
  productModelId: string;
  quantity: string;
  unit: string;
  technicalRequirements: string;
  remarks: string;
}

let seed = 0;
const nextKey = () => `r${++seed}`;

export const emptyRequirement = (): RequirementRow => ({
  key: nextKey(),
  brand: [],
  product: [],
  productCode: '',
  productModelId: '',
  quantity: '',
  unit: 'Nos',
  technicalRequirements: '',
  remarks: '',
});

export function validateRequirement(row: RequirementRow): Record<string, string> {
  const e: Record<string, string> = {};
  if (!row.product[0]) e.product = 'Select a product.';
  if (!/^\d+$/.test(row.quantity.trim()) || Number(row.quantity) < 1) e.quantity = 'Quantity must be a whole number of at least 1.';
  else if (Number(row.quantity) > 10_000_000) e.quantity = 'Quantity is too large.';
  if (row.unit.trim().length > 20) e.unit = 'Unit can be at most 20 characters.';
  if (row.technicalRequirements.length > 4000) e.technicalRequirements = 'At most 4000 characters.';
  if (row.remarks.length > 1000) e.remarks = 'At most 1000 characters.';
  return e;
}

export const toItemPayload = (row: RequirementRow): EnquiryItemPayload => ({
  productId: row.product[0]?.id ?? '',
  productModelId: row.productModelId,
  quantity: Number(row.quantity),
  unit: row.unit.trim() || 'Nos',
  technicalRequirements: row.technicalRequirements,
  remarks: row.remarks,
});

/**
 * Brand -> product -> model pickers over the shared catalogue, plus quantity
 * and requirement text. Only existing products and models can be chosen.
 */
export function RequirementFields({
  row,
  onChange,
  errors = {},
  pickerOnly = false,
}: {
  row: RequirementRow;
  onChange: (change: Partial<RequirementRow>) => void;
  errors?: Record<string, string>;
  /** Only brand -> product -> model (Quotation lines bring their own quantity and pricing fields). */
  pickerOnly?: boolean;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const codes = useRef(new Map<string, string>());
  const productId = row.product[0]?.id;
  const brandId = row.brand[0]?.id;

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    if (!productId) return;
    setLoadingModels(true);
    listModelsWithSpecsAction(productId).then((list) => {
      if (cancelled) return;
      setModels(list);
      setLoadingModels(false);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const brandSearch = useCallback(
    async (term: string) => (await searchBrandsAction(term)).map((b) => ({ id: b.id, label: b.name })),
    [],
  );
  const productSearch = useCallback(
    async (term: string) =>
      (await searchProductsAction(term, brandId))
        .filter((p) => p.isActive)
        .map((p) => {
          codes.current.set(p.id, p.productCode);
          return {
            id: p.id,
            label: p.name,
            detail: `${p.productCode} · ${p.company.name} · ${p._count.models} model(s)`,
            meta: { id: p.company.id, label: p.company.name },
          };
        }),
    [brandId],
  );

  const model = models.find((m) => m.id === row.productModelId);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SearchSelect
        label="Brand"
        placeholder="Search brands..."
        search={brandSearch}
        selected={row.brand}
        onChange={(next) => {
          // Changing the brand clears a product of another brand.
          const keep = row.product[0] && next[0] && row.product[0].meta?.id === next[0].id;
          onChange(keep ? { brand: next } : { brand: next, product: [], productCode: '', productModelId: '' });
        }}
        emptyText="No active brands found"
      />
      <div>
        <SearchSelect
          label="Product *"
          placeholder={brandId ? 'Search products of this brand...' : 'Search products...'}
          search={productSearch}
          selected={row.product}
          onChange={(next) => {
            const picked = next[0];
            onChange({
              product: next,
              productCode: picked ? codes.current.get(picked.id) ?? '' : '',
              productModelId: '',
              ...(picked?.meta ? { brand: [{ id: picked.meta.id, label: picked.meta.label }] } : {}),
            });
          }}
          emptyText="No active products found"
        />
        {errors.product && <p className="field-error">{errors.product}</p>}
      </div>
      <SelectField
        label="Model"
        value={row.productModelId}
        onChange={(v) => onChange({ productModelId: v })}
        placeholder={!productId ? 'Select a product first' : loadingModels ? 'Loading models...' : models.length ? 'Not specified' : 'This product has no models'}
        options={models.map((m) => ({ value: m.id, label: `${m.modelName} (${m.modelNumber})${m.isActive ? '' : ' - inactive'}` }))}
      />

      {productId && (
        <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm md:col-span-2 xl:col-span-3">
          <p className="text-ink-muted">
            Product code <span className="font-mono text-ink">{row.productCode || '—'}</span>
            {row.brand[0] && <> &middot; Brand <span className="text-ink">{row.brand[0].label}</span></>}
            {model && (
              <>
                {' '}&middot; Model number <span className="font-mono text-ink">{model.modelNumber}</span> &middot; Model code{' '}
                <span className="font-mono text-ink">{model.modelCode}</span>
              </>
            )}
          </p>
          {model && model.specifications.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Model specifications">
              {model.specifications.map((s) => (
                <li key={`${s.name}-${s.value}`} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-ink-muted">
                  <span className="font-medium text-ink">{s.name}:</span> {s.value}
                </li>
              ))}
            </ul>
          )}
          {model && !model.isActive && <p className="mt-1 text-xs text-warning">This model is inactive.</p>}
        </div>
      )}

      {!pickerOnly && (
        <>
          <TextField label="Quantity" required value={row.quantity} onChange={(v) => onChange({ quantity: v })} error={errors.quantity} inputMode="numeric" />
          <TextField label="Unit" value={row.unit} onChange={(v) => onChange({ unit: v })} error={errors.unit} maxLength={20} placeholder="Enter unit" />
          <TextField label="Remarks" value={row.remarks} onChange={(v) => onChange({ remarks: v })} error={errors.remarks} maxLength={1000} />
          <div className="md:col-span-2 xl:col-span-3">
            <label htmlFor={`${row.key}-tech`} className="field-label">Technical Requirements</label>
            <textarea
              id={`${row.key}-tech`}
              rows={2}
              maxLength={4000}
              value={row.technicalRequirements}
              onChange={(e) => onChange({ technicalRequirements: e.target.value })}
              className="field-input"
              placeholder="Enter specifications"
            />
            {errors.technicalRequirements && <p className="field-error">{errors.technicalRequirements}</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customer card
// ---------------------------------------------------------------------------

/** What the form needs to show a customer (full customer detail or the enquiry's copy). */
export interface CustomerCardData {
  id: string;
  customerCode: string;
  name: string;
  customerType: CustomerType;
  status: CustomerStatus;
  contacts: CustomerContact[];
  addresses: CustomerAddress[];
}

const defaultAddress = (customer: CustomerCardData, type: CustomerAddress['addressType']) =>
  customer.addresses.find((a) => a.addressType === type && a.isDefault) ?? customer.addresses.find((a) => a.addressType === type);

export function CustomerSummaryCard({ customer }: { customer: CustomerCardData }) {
  const primary = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
  const billing = defaultAddress(customer, 'BILLING');
  const shipping = defaultAddress(customer, 'SHIPPING');
  const address = (title: string, a?: CustomerAddress) => (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{title}</p>
      {a ? (
        <address className="mt-1 text-sm not-italic leading-relaxed text-ink">
          {formatAddress(a).map((line) => <span key={line} className="block">{line}</span>)}
        </address>
      ) : (
        <p className="mt-1 text-sm text-ink-subtle">Not provided</p>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-muted p-4 md:grid-cols-2 xl:grid-cols-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Customer</p>
        <p className="mt-1 font-semibold text-ink">{customer.name}</p>
        <p className="text-sm text-ink-muted"><span className="font-mono">{customer.customerCode}</span> &middot; {CUSTOMER_TYPE_LABELS[customer.customerType]}</p>
        {customer.status === 'INACTIVE' && <p className="mt-1 text-xs font-medium text-warning">Inactive customer</p>}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Primary contact</p>
        {primary ? (
          <div className="mt-1 text-sm text-ink">
            <p>{primary.name}{primary.designation && <span className="text-ink-muted">, {primary.designation}</span>}</p>
            {primary.phone && <p className="text-ink-muted">{formatPhone(primary.phone)}</p>}
            {primary.email && <p className="truncate text-ink-muted">{primary.email}</p>}
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-subtle">No contacts</p>
        )}
      </div>
      {address('Default billing address', billing)}
      {address('Default shipping address', shipping)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enquiry form
// ---------------------------------------------------------------------------

const MAX_FILE = 10 * 1024 * 1024;
/** Server actions accept 12 MB per request; leave room for the form itself. */
const MAX_TOTAL = 11 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.json,.md';
const KINDS = Object.entries(ENQUIRY_DOCUMENT_KIND_LABELS).map(([value, label]) => ({ value, label }));
const BUDGET = /^\d{1,13}(\.\d{1,2})?$/;

export const emptyEnquiryDetails = (): EnquiryDetailsPayload => ({
  customerId: '',
  customerContactId: '',
  enquiryDate: '',
  sourceId: '',
  priority: 'NORMAL',
  description: '',
  internalRemarks: '',
  expectedDecisionDate: '',
  nextFollowUpDate: '',
  expectedBudget: '',
  currency: 'INR',
  expectedDeliveryTimeline: '',
  paymentPreference: '',
  commercialNotes: '',
});

function validateDetails(d: EnquiryDetailsPayload): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.customerId) e.customer = 'Select a customer.';
  if (!d.enquiryDate) e.enquiryDate = 'Enquiry date is required.';
  if (d.expectedBudget.trim() && !BUDGET.test(d.expectedBudget.trim())) e.expectedBudget = 'Enter an amount with up to 2 decimals.';
  if (d.currency.trim() && !/^[A-Za-z]{3}$/.test(d.currency.trim())) e.currency = 'Use a 3-letter currency code.';
  if (d.description.length > 4000) e.description = 'At most 4000 characters.';
  if (d.internalRemarks.length > 2000) e.internalRemarks = 'At most 2000 characters.';
  if (d.commercialNotes.length > 2000) e.commercialNotes = 'At most 2000 characters.';
  return e;
}

export function EnquiryForm({
  mode,
  enquiryId,
  enquiryNumber,
  sources,
  assignees,
  initial,
  initialCustomer,
  canCreateCustomer,
  canCreateProduct,
}: {
  mode: 'create' | 'edit';
  enquiryId?: string;
  enquiryNumber?: string;
  sources: EnquirySource[];
  assignees: EnquiryAssignee[];
  initial?: EnquiryDetailsPayload;
  initialCustomer?: CustomerCardData | null;
  canCreateCustomer: boolean;
  canCreateProduct: boolean;
}) {
  const creating = mode === 'create';
  const [details, setDetails] = useState<EnquiryDetailsPayload>(() => ({
    ...emptyEnquiryDetails(),
    ...initial,
    ...(initialCustomer && !initial
      ? { customerId: initialCustomer.id, customerContactId: (initialCustomer.contacts.find((c) => c.isPrimary) ?? initialCustomer.contacts[0])?.id ?? '' }
      : {}),
  }));
  const [assignedToId, setAssignedToId] = useState('');
  const [customer, setCustomer] = useState<CustomerCardData | null>(initialCustomer ?? null);
  const [customerOption, setCustomerOption] = useState<SearchOption[]>(
    initialCustomer ? [{ id: initialCustomer.id, label: initialCustomer.name, detail: initialCustomer.customerCode }] : [],
  );
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [rows, setRows] = useState<RequirementRow[]>(() => [emptyRequirement()]);
  const [files, setFiles] = useState<Array<{ key: string; file: File; kind: EnquiryDocumentKind }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EnquiryDetailsPayload>(field: K, value: EnquiryDetailsPayload[K]) => {
    setDetails((d) => ({ ...d, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const customerSearch = useCallback(
    async (term: string) =>
      (await searchCustomersAction(term)).map((c) => ({
        id: c.id,
        label: c.name,
        detail: [c.customerCode, CUSTOMER_TYPE_LABELS[c.customerType], c.contacts[0]?.name, c.contacts[0]?.phone ? formatPhone(c.contacts[0].phone) : null]
          .filter(Boolean)
          .join(' · '),
      })),
    [],
  );

  const pickCustomer = (next: SearchOption[]) => {
    setCustomerOption(next);
    setErrors(({ customer: _c, ...rest }) => rest);
    const picked = next[0];
    if (!picked) {
      setCustomer(null);
      setDetails((d) => ({ ...d, customerId: '', customerContactId: '' }));
      return;
    }
    setDetails((d) => ({ ...d, customerId: picked.id, customerContactId: '' }));
    setLoadingCustomer(true);
    getCustomerForEnquiryAction(picked.id).then((detail) => {
      setLoadingCustomer(false);
      setCustomer(detail);
      if (!detail) {
        setResult({ error: 'The customer details could not be loaded.' });
        return;
      }
      const primary = detail.contacts.find((c) => c.isPrimary) ?? detail.contacts[0];
      setDetails((d) => (d.customerId === detail.id ? { ...d, customerContactId: primary?.id ?? '' } : d));
    });
  };

  const updateRow = (key: string, change: Partial<RequirementRow>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
    setRowErrors(({ [key]: _r, ...rest }) => rest);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > MAX_FILE);
    if (tooBig.length) setResult({ error: `${tooBig.map((f) => f.name).join(', ')} ${tooBig.length > 1 ? 'are' : 'is'} larger than 10 MB.` });
    setFiles((current) => [
      ...current,
      ...picked.filter((f) => f.size > 0 && f.size <= MAX_FILE).map((file) => ({ key: nextKey(), file, kind: 'ENQUIRY_REQUIREMENT' as EnquiryDocumentKind })),
    ]);
    if (fileInput.current) fileInput.current.value = '';
  };
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);

  const submit = () => {
    if (submitting.current) return;
    const found = validateDetails(details);
    const foundRows: Record<string, Record<string, string>> = {};
    if (creating) {
      if (rows.length === 0) found.items = 'Add at least one product requirement.';
      for (const row of rows) {
        const e = validateRequirement(row);
        if (Object.keys(e).length) foundRows[row.key] = e;
      }
      if (totalBytes > MAX_TOTAL) found.files = 'Attachments together exceed 11 MB. Upload the larger files from the enquiry profile after saving.';
    }
    setErrors(found);
    setRowErrors(foundRows);
    if (Object.keys(found).length || Object.keys(foundRows).length) {
      setResult({ error: 'Please correct the highlighted fields.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    submitting.current = true;
    startTransition(async () => {
      let outcome: ActionResult;
      try {
        if (!creating && enquiryId) {
          outcome = await updateEnquiryAction(enquiryId, details);
        } else {
          const data = new FormData();
          data.set('payload', JSON.stringify({ ...details, assignedToId, items: rows.map(toItemPayload) }));
          for (const f of files) {
            data.append('file', f.file);
            data.append('kind', f.kind);
          }
          outcome = await createEnquiryAction(data);
        }
      } finally {
        submitting.current = false;
      }
      // Success redirects on the server; anything returned is a problem.
      setResult(outcome);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const section = (letter: string, title: string, description: string, children: React.ReactNode, actions?: React.ReactNode) => (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-sm font-bold text-accent">{letter}</span>
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            <p className="text-sm text-ink-muted">{description}</p>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );

  const textarea = (field: 'description' | 'internalRemarks' | 'commercialNotes', label: string, max: number, placeholder?: string) => (
    <div className="md:col-span-2 xl:col-span-3">
      <label htmlFor={`enquiry-${field}`} className="field-label">{label}</label>
      <textarea id={`enquiry-${field}`} rows={2} maxLength={max} value={details[field]} onChange={(e) => set(field, e.target.value)} className="field-input" placeholder={placeholder} />
      {errors[field] && <p className="field-error">{errors[field]}</p>}
    </div>
  );

  const sourceOptions = sources.map((s) => ({ value: s.id, label: s.isActive ? s.name : `${s.name} (inactive)` }));
  const contacts = customer?.contacts ?? [];

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-5">
      <ResultAlert result={result} />

      {section('A', 'Enquiry Information', creating ? 'The enquiry number is generated on save.' : `Enquiry ${enquiryNumber ?? ''}`,
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <span className="field-label">Enquiry Number</span>
            <p className="field-input flex items-center bg-surface-muted font-mono text-ink-muted">{enquiryNumber ?? 'Generated on save'}</p>
          </div>
          <TextField label="Enquiry Date" type="date" required value={details.enquiryDate} onChange={(v) => set('enquiryDate', v)} error={errors.enquiryDate} />
          <SelectField label="Enquiry Source" value={details.sourceId} onChange={(v) => set('sourceId', v)} placeholder="Not specified" options={sourceOptions} />
          <SelectField label="Priority" value={details.priority} onChange={(v) => set('priority', v as EnquiryPriority)} options={ENQUIRY_PRIORITIES.map((p) => ({ value: p, label: ENQUIRY_PRIORITY_LABELS[p] }))} />
          {creating ? (
            <SelectField label="Assigned Employee" value={assignedToId} onChange={setAssignedToId} placeholder="Unassigned" options={assignees.map((a) => ({ value: a.id, label: a.fullName }))} />
          ) : (
            <div>
              <span className="field-label">Assigned Employee</span>
              <p className="field-hint mt-2">Change the assignment from the enquiry profile.</p>
            </div>
          )}
          <TextField label="Expected Decision Date" type="date" value={details.expectedDecisionDate} onChange={(v) => set('expectedDecisionDate', v)} />
          <TextField label="Next Follow-up Date" type="date" value={details.nextFollowUpDate} onChange={(v) => set('nextFollowUpDate', v)} hint={creating ? 'When to contact the customer first' : 'Recording a follow-up also updates this'} />
          {textarea('description', 'Enquiry Description', 4000, 'What the customer is asking for')}
          {textarea('internalRemarks', 'Internal Remarks', 2000, 'Visible to staff only')}
        </div>,
      )}

      {section('B', 'Customer Selection', 'Choose an existing customer from Customer Management.',
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <SearchSelect
                label="Customer *"
                placeholder="Search by name, code, GSTIN or contact..."
                search={customerSearch}
                selected={customerOption}
                onChange={pickCustomer}
                emptyText="No active customers found"
              />
              {errors.customer && <p className="field-error">{errors.customer}</p>}
            </div>
            <SelectField
              label="Contact Person"
              value={details.customerContactId}
              onChange={(v) => set('customerContactId', v)}
              placeholder={!customer ? 'Select a customer first' : contacts.length ? 'Not specified' : 'This customer has no contacts'}
              options={contacts.map((c) => ({ value: c.id, label: `${c.name}${c.isPrimary ? ' (primary)' : ''}${c.designation ? ` - ${c.designation}` : ''}` }))}
            />
          </div>
          {loadingCustomer && <p className="text-sm text-ink-subtle">Loading customer details...</p>}
          {customer && !loadingCustomer && <CustomerSummaryCard customer={customer} />}
          <div className="flex flex-wrap gap-4 text-sm">
            {customer && (
              <Link href={`/customers/${customer.id}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                View customer <IconArrowRight size={14} />
              </Link>
            )}
            {canCreateCustomer && (
              <Link href="/customers/new" target="_blank" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                <IconPlus size={14} /> Add new customer
              </Link>
            )}
          </div>
        </div>,
      )}

      {creating ? (
        section('C', 'Product Requirements', 'Existing products and models from Product Management. At least one is required.',
          <div className="space-y-4">
            {errors.items && <p className="field-error">{errors.items}</p>}
            {rows.map((row, index) => (
              <fieldset key={row.key} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <legend className="text-sm font-semibold text-ink">Product {index + 1}</legend>
                  {rows.length > 1 && (
                    <button type="button" className="inline-flex items-center gap-1 text-sm text-danger hover:underline" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}>
                      <IconTrash size={14} /> Remove
                    </button>
                  )}
                </div>
                <RequirementFields row={row} onChange={(change) => updateRow(row.key, change)} errors={rowErrors[row.key]} />
              </fieldset>
            ))}
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" className="btn-secondary" onClick={() => setRows((list) => [...list, emptyRequirement()])}><IconPlus size={16} /> Add product</button>
              {canCreateProduct && (
                <Link href="/products/new" target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  Product missing? Open Product Management <IconArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>,
        )
      ) : null}

      {section(creating ? 'D' : 'C', 'Commercial Expectations', 'Preliminary expectations only. This is not a price or a quotation.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField label="Expected Budget" value={details.expectedBudget} onChange={(v) => set('expectedBudget', v)} error={errors.expectedBudget} inputMode="decimal" placeholder="Optional" />
          <TextField label="Currency" value={details.currency} onChange={(v) => set('currency', v.toUpperCase())} error={errors.currency} maxLength={3} />
          <TextField label="Expected Delivery Timeline" value={details.expectedDeliveryTimeline} onChange={(v) => set('expectedDeliveryTimeline', v)} maxLength={200} placeholder="Enter delivery time" />
          <TextField label="Payment Preference" value={details.paymentPreference} onChange={(v) => set('paymentPreference', v)} maxLength={200} placeholder="Enter payment terms" />
          {textarea('commercialNotes', 'Commercial Notes', 2000)}
        </div>,
      )}

      {creating &&
        section('E', 'Attachments', 'Optional. Uploaded after the enquiry is saved. PDF, images or text, up to 10 MB each.',
          <div className="space-y-3">
            {files.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {files.map((f) => (
                  <li key={f.key} className="grid grid-cols-1 items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{f.file.name}</p>
                      <p className="text-xs text-ink-subtle">{formatBytes(f.file.size)}</p>
                    </div>
                    <select
                      aria-label={`Type of ${f.file.name}`}
                      value={f.kind}
                      onChange={(e) => setFiles((list) => list.map((x) => (x.key === f.key ? { ...x, kind: e.target.value as EnquiryDocumentKind } : x)))}
                      className="field-input h-9"
                    >
                      {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                    <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((list) => list.filter((x) => x.key !== f.key))}>
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {errors.files && <p className="field-error flex items-center gap-1.5"><IconAlert size={14} /> {errors.files}</p>}
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" id="enquiry-files" onChange={(e) => addFiles(e.target.files)} />
            <label htmlFor="enquiry-files" className="btn-secondary cursor-pointer"><IconUpload size={16} /> Choose files</label>
          </div>,
        )}

      {!creating && (
        <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          Product requirements, follow-ups, attachments, status and assignment are managed on the enquiry profile.
        </p>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <Link href={enquiryId ? `/enquiries/${enquiryId}` : '/enquiries'} className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary px-5" disabled={pending}>
          {pending ? 'Saving...' : creating ? 'Save Enquiry' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
