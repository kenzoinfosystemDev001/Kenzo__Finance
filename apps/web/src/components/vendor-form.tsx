'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  checkDuplicatesAction,
  createVendorAction,
  quickCreateBrandAction,
  quickCreateProductAction,
  searchBrandsAction,
  searchProductsAction,
  updateVendorAction,
  type AddressPayload,
  type ContactPayload,
  type VendorBasicsPayload,
  type VendorFormResult,
} from '@/lib/vendor-actions';
import { ADDRESS_TYPE_LABELS, CONTACT_TYPE_LABELS } from '@/lib/vendor-labels';
import type {
  DuplicateMatch,
  ProductCategory,
  VendorAddressType,
  VendorCategory,
  VendorContactType,
} from '@/lib/types';
import {
  CheckboxField,
  isEmail,
  isGstinFormat,
  isPanFormat,
  isPhone,
  isPostalCode,
  isWebsite,
  Modal,
  ResultAlert,
  SelectField,
  TextField,
} from './client-ui';
import { SearchSelect, type SearchOption } from './search-select';
import { IconAlert, IconPlus, IconTrash } from './icons';

// ---------------------------------------------------------------------------
// Types and defaults
// ---------------------------------------------------------------------------

type ContactRow = ContactPayload & { key: string };
type AddressRow = AddressPayload & { key: string };

export interface VendorFormInitial {
  basics?: Partial<VendorBasicsPayload>;
  contacts?: ContactPayload[];
  addresses?: AddressPayload[];
  brands?: SearchOption[];
}

export interface OcrReview {
  jobId: string;
  /** Raw extracted values, shown read-only beside the form. */
  extracted: Record<string, string>;
  /** Confidence per form field key, e.g. "businessName", "contacts.0.phone". */
  confidence: Record<string, number | null>;
  note?: string | null;
}

let keySeed = 0;
const newKey = () => `row-${++keySeed}`;

const emptyBasics: VendorBasicsPayload = {
  businessName: '',
  legalName: '',
  categoryId: '',
  registrationNumber: '',
  gstin: '',
  pan: '',
  website: '',
  status: 'ACTIVE',
  notes: '',
  phone: '',
  alternatePhone: '',
  email: '',
  alternateEmail: '',
};

export const emptyContact = (overrides: Partial<ContactPayload> = {}): ContactPayload => ({
  contactType: 'GENERAL',
  name: '',
  designation: '',
  phone: '',
  alternatePhone: '',
  email: '',
  alternateEmail: '',
  isPrimary: false,
  ...overrides,
});

export const emptyAddress = (overrides: Partial<AddressPayload> = {}): AddressPayload => ({
  addressType: 'REGISTERED_OFFICE',
  label: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  isPrimary: false,
  ...overrides,
});

const CONTACT_TYPES = Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const ADDRESS_TYPES = Object.entries(ADDRESS_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// ---------------------------------------------------------------------------
// Validation (mirrors the API rules so most mistakes are caught before a round trip)
// ---------------------------------------------------------------------------

function validate(
  basics: VendorBasicsPayload,
  contacts: ContactRow[],
  addresses: AddressRow[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = basics.businessName.trim();
  if (!name) errors.businessName = 'Vendor name is required.';
  else if (name.length < 2) errors.businessName = 'Vendor name must be at least 2 characters.';

  if (basics.gstin.trim() && !isGstinFormat(basics.gstin)) errors.gstin = 'GSTIN must be 15 letters or digits.';
  if (basics.pan.trim() && !isPanFormat(basics.pan)) errors.pan = 'PAN must look like ABCDE1234F.';
  if (basics.website.trim() && !isWebsite(basics.website)) errors.website = 'Enter a valid website, e.g. www.example.com.';
  if (basics.email.trim() && !isEmail(basics.email)) errors.email = 'Enter a valid email address.';
  if (basics.alternateEmail.trim() && !isEmail(basics.alternateEmail)) errors.alternateEmail = 'Enter a valid email address.';
  if (basics.phone.trim() && !isPhone(basics.phone)) errors.phone = 'Enter a valid phone number (7-15 digits).';
  if (basics.alternatePhone.trim() && !isPhone(basics.alternatePhone)) errors.alternatePhone = 'Enter a valid phone number (7-15 digits).';

  const primaryTypes = new Set<VendorContactType>();
  contacts.forEach((contact, index) => {
    const at = (field: string) => `contacts.${index}.${field}`;
    if (!contact.name.trim()) errors[at('name')] = 'Contact name is required.';
    if (contact.email.trim() && !isEmail(contact.email)) errors[at('email')] = 'Enter a valid email address.';
    if (contact.alternateEmail.trim() && !isEmail(contact.alternateEmail)) errors[at('alternateEmail')] = 'Enter a valid email address.';
    if (contact.phone.trim() && !isPhone(contact.phone)) errors[at('phone')] = 'Enter a valid mobile number.';
    if (contact.alternatePhone.trim() && !isPhone(contact.alternatePhone)) errors[at('alternatePhone')] = 'Enter a valid mobile number.';
    if (contact.isPrimary) {
      if (primaryTypes.has(contact.contactType)) {
        errors[at('isPrimary')] = `Only one primary ${CONTACT_TYPE_LABELS[contact.contactType].toLowerCase()} contact is allowed.`;
      }
      primaryTypes.add(contact.contactType);
    }
  });

  addresses.forEach((address, index) => {
    const at = (field: string) => `addresses.${index}.${field}`;
    if (!address.addressLine1.trim()) errors[at('addressLine1')] = 'Address line 1 is required.';
    if (address.postalCode.trim() && !isPostalCode(address.postalCode)) errors[at('postalCode')] = 'Enter a valid PIN / postal code.';
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VendorForm({
  mode,
  categories,
  productCategories = [],
  permissions,
  initial = {},
  vendorId,
  ocr,
  initialDuplicates = [],
}: {
  mode: 'create' | 'edit' | 'ocr';
  categories: VendorCategory[];
  productCategories?: ProductCategory[];
  permissions: string[];
  initial?: VendorFormInitial;
  vendorId?: string;
  ocr?: OcrReview;
  initialDuplicates?: DuplicateMatch[];
}) {
  const creating = mode !== 'edit';
  const can = (permission: string) => permissions.includes(permission);

  const [basics, setBasics] = useState<VendorBasicsPayload>({ ...emptyBasics, ...initial.basics });
  const [contacts, setContacts] = useState<ContactRow[]>(() =>
    (initial.contacts?.length ? initial.contacts : creating ? [emptyContact({ isPrimary: true })] : []).map((c) => ({ ...c, key: newKey() })),
  );
  const [addresses, setAddresses] = useState<AddressRow[]>(() =>
    (initial.addresses?.length ? initial.addresses : creating ? [emptyAddress({ isPrimary: true })] : []).map((a) => ({ ...a, key: newKey() })),
  );
  const [brands, setBrands] = useState<SearchOption[]>(initial.brands ?? []);
  const [products, setProducts] = useState<SearchOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<VendorFormResult>({});
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>(initialDuplicates);
  const [acknowledged, setAcknowledged] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [pending, startTransition] = useTransition();

  const setBasic = <K extends keyof VendorBasicsPayload>(key: K, value: VendorBasicsPayload[K]) => {
    setBasics((current) => ({ ...current, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const updateContact = (key: string, changes: Partial<ContactPayload>) =>
    setContacts((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const updateAddress = (key: string, changes: Partial<AddressPayload>) =>
    setAddresses((rows) =>
      rows.map((row) =>
        row.key === key ? { ...row, ...changes } : changes.isPrimary ? { ...row, isPrimary: false } : row,
      ),
    );

  const confidenceBadge = (field: string) => {
    const value = ocr?.confidence[field];
    if (value === undefined || value === null) return null;
    const percent = Math.round(value * 100);
    const low = value < 0.8;
    return (
      <span
        className={clsx(
          'ml-2 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold',
          low ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success',
        )}
        title={low ? 'Low confidence - verify against the document' : 'Read from the document'}
      >
        OCR {percent}%
      </span>
    );
  };

  // Early, advisory duplicate check while typing (create flows only).
  const refreshDuplicates = useCallback(async () => {
    if (!creating) return;
    const matches = await checkDuplicatesAction({
      businessName: basics.businessName.trim() || undefined,
      gstin: basics.gstin.trim() || undefined,
      emails: [basics.email, ...contacts.map((c) => c.email)].filter((v) => v.trim()),
      phones: [basics.phone, ...contacts.map((c) => c.phone)].filter((v) => v.trim()),
    });
    setDuplicates(matches);
    if (!matches.length) setAcknowledged(false);
  }, [basics.businessName, basics.gstin, basics.email, basics.phone, contacts, creating]);

  const blocking = duplicates.filter((match) => match.severity === 'blocking');
  const warnings = duplicates.filter((match) => match.severity === 'warning');

  const brandSearch = useCallback(
    async (term: string) => (await searchBrandsAction(term)).map((brand) => ({ id: brand.id, label: brand.name })),
    [],
  );
  const productSearch = useCallback(
    async (term: string) =>
      (await searchProductsAction(term)).map((product) => ({
        id: product.id,
        label: product.name,
        detail: `${product.company.name}${product.category ? ` · ${product.category.name}` : ''} · ${product._count.models} model(s)`,
        meta: { id: product.company.id, label: product.company.name },
      })),
    [],
  );
  const createBrand = useCallback(async (name: string) => {
    const created = await quickCreateBrandAction(name);
    if (!created.brand) {
      setResult({ error: created.error ?? 'The brand could not be created.' });
      return null;
    }
    return { id: created.brand.id, label: created.brand.name };
  }, []);

  const submit = () => {
    const found = validate(basics, contacts, addresses);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setResult({ error: 'Please correct the highlighted fields.' });
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    startTransition(async () => {
      let outcome: VendorFormResult;
      if (mode === 'edit' && vendorId) {
        const { status: _status, ...editable } = basics;
        outcome = await updateVendorAction(vendorId, editable);
      } else {
        outcome = await createVendorAction({
          ...basics,
          contacts: contacts.map(({ key: _key, ...contact }) => contact),
          addresses: addresses.map(({ key: _key, ...address }) => address),
          companyIds: brands.map((brand) => brand.id),
          productIds: products.map((product) => product.id),
          ocrJobId: ocr?.jobId,
          confirmPossibleDuplicate: acknowledged,
        });
      }
      // Success redirects on the server; anything returned here is a problem.
      setResult(outcome);
      if (outcome.duplicates) {
        setDuplicates(outcome.duplicates);
        setAcknowledged(false);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const extractedPanel = ocr && (
    <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
      <div className="card p-4">
        <h2 className="text-base font-semibold text-ink">Extracted from document</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Unverified OCR output, kept separate from what will be saved. Compare each value with the
          original before confirming.
        </p>
        {Object.keys(ocr.extracted).length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">Nothing could be read automatically.</p>
        ) : (
          <dl className="mt-3 divide-y divide-border text-sm">
            {Object.entries(ocr.extracted).map(([key, value]) => (
              <div key={key} className="py-2">
                <dt className="text-xs uppercase tracking-wide text-ink-subtle">{key.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="break-words font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {ocr.note && <p className="mt-3 text-xs text-ink-muted">{ocr.note}</p>}
      </div>
    </aside>
  );

  const sectionTitle = (letter: string, title: string, description?: string) => (
    <div className="mb-4 flex items-start gap-3">
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-sm font-bold text-accent">
        {letter}
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
    </div>
  );

  const form = (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      {mode === 'ocr' && (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          <strong>Review step.</strong> Nothing has been saved. Values pre-filled from the document are
          marked with their OCR confidence &mdash; correct anything wrong, then confirm.
        </div>
      )}

      <ResultAlert result={result.duplicates?.length ? { error: undefined } : result} />

      {blocking.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <IconAlert size={16} /> This GSTIN is already registered
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-danger/90">
            {blocking.map((match) => (
              <li key={match.vendorId}>
                <Link href={`/vendors/${match.vendorId}`} className="underline underline-offset-2" target="_blank">
                  {match.businessName} ({match.vendorCode})
                </Link>
                {match.archived && ' — archived'}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-danger/90">
            A GSTIN identifies one business. Update the existing vendor instead of creating a second record.
          </p>
        </div>
      )}

      {warnings.length > 0 && blocking.length === 0 && creating && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <IconAlert size={16} /> Possible duplicate vendor
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-warning">
            {warnings.map((match) => (
              <li key={match.vendorId}>
                <Link href={`/vendors/${match.vendorId}`} className="underline underline-offset-2" target="_blank">
                  {match.businessName} ({match.vendorCode})
                </Link>{' '}
                &mdash; same {match.matchedOn}
                {match.archived ? ' (archived)' : match.status === 'INACTIVE' ? ' (inactive)' : ''}
              </li>
            ))}
          </ul>
          <div className="mt-2.5">
            <CheckboxField
              label="I have checked these vendors. This is a different business — save it as a new vendor."
              checked={acknowledged}
              onChange={setAcknowledged}
            />
          </div>
        </div>
      )}

      {/* A. Basic information ------------------------------------------------ */}
      <section className="card p-5">
        {sectionTitle('A', 'Basic Information', 'Only the vendor name is mandatory. Legal identifiers are optional.')}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField
            className="md:col-span-2 xl:col-span-1"
            label="Vendor / Company Name"
            required
            value={basics.businessName}
            onChange={(value) => setBasic('businessName', value)}
            error={errors.businessName}
            maxLength={200}
            placeholder="e.g. ABC Technologies"
            badge={confidenceBadge('businessName')}
          />
          <TextField
            label="Registered Legal Name"
            value={basics.legalName}
            onChange={(value) => setBasic('legalName', value)}
            maxLength={200}
            hint="Only if different from the trading name"
            badge={confidenceBadge('legalName')}
          />
          <div>
            <p className="field-label">Vendor Code</p>
            <p className="field-input cursor-default bg-surface-muted text-ink-subtle">
              {creating ? 'Generated automatically on save' : 'Assigned — cannot be changed'}
            </p>
          </div>
          <SelectField
            label="Vendor Type"
            value={basics.categoryId}
            onChange={(value) => setBasic('categoryId', value)}
            placeholder="Not specified"
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
          />
          <TextField
            label="Company Registration No."
            value={basics.registrationNumber}
            onChange={(value) => setBasic('registrationNumber', value)}
            maxLength={50}
            placeholder="CIN / LLPIN / Udyam"
          />
          <TextField
            label="Website"
            value={basics.website}
            onChange={(value) => setBasic('website', value)}
            error={errors.website}
            placeholder="www.example.com"
            badge={confidenceBadge('website')}
          />
          <TextField
            label="GSTIN"
            value={basics.gstin}
            onChange={(value) => setBasic('gstin', value.toUpperCase())}
            error={errors.gstin}
            maxLength={15}
            placeholder="07ABCDE1234F1Z5"
            hint="Format and checksum are verified on save"
            badge={confidenceBadge('gstin')}
          />
          <TextField
            label="PAN"
            value={basics.pan}
            onChange={(value) => setBasic('pan', value.toUpperCase())}
            error={errors.pan}
            maxLength={10}
            placeholder="ABCDE1234F"
            badge={confidenceBadge('pan')}
          />
          {creating ? (
            <SelectField
              label="Vendor Status"
              value={basics.status}
              onChange={(value) => setBasic('status', value as VendorBasicsPayload['status'])}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
            />
          ) : (
            <div>
              <p className="field-label">Vendor Status</p>
              <p className="field-hint mt-2">Change status from the vendor&rsquo;s actions menu &mdash; it is recorded separately.</p>
            </div>
          )}
          <div className="md:col-span-2 xl:col-span-3">
            <label htmlFor="vendor-notes" className="field-label">
              Vendor Description
            </label>
            <textarea
              id="vendor-notes"
              rows={3}
              maxLength={2000}
              value={basics.notes}
              onChange={(event) => setBasic('notes', event.target.value)}
              className="field-input"
              placeholder="What they supply, regions covered, terms discussed..."
            />
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-3 text-sm font-semibold text-ink">Company phone &amp; email</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TextField label="Company Phone" value={basics.phone} onChange={(v) => setBasic('phone', v)} error={errors.phone} inputMode="tel" placeholder="+91 11 2345 6789" />
            <TextField label="Alternate Phone" value={basics.alternatePhone} onChange={(v) => setBasic('alternatePhone', v)} error={errors.alternatePhone} inputMode="tel" />
            <TextField label="Company Email" type="email" value={basics.email} onChange={(v) => setBasic('email', v)} error={errors.email} placeholder="sales@company.com" />
            <TextField label="Alternate Email" type="email" value={basics.alternateEmail} onChange={(v) => setBasic('alternateEmail', v)} error={errors.alternateEmail} />
          </div>
        </div>
        {creating && (
          <div className="mt-3 flex justify-end">
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={refreshDuplicates}>
              Check for existing vendors
            </button>
          </div>
        )}
      </section>

      {creating ? (
        <>
          {/* B. Contacts ------------------------------------------------------- */}
          <section className="card p-5">
            {sectionTitle('B', 'Contact Information', 'Add every person you deal with. One primary contact per contact type.')}
            <div className="space-y-4">
              {contacts.map((contact, index) => (
                <fieldset key={contact.key} className="rounded-xl border border-border p-4">
                  <legend className="sr-only">Contact {index + 1}</legend>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      Contact {index + 1}
                      {contact.isPrimary && <span className="chip ml-2">Primary</span>}
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm text-danger hover:underline"
                      onClick={() => setContacts((rows) => rows.filter((row) => row.key !== contact.key))}
                    >
                      <IconTrash size={14} /> Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <TextField label="Contact Person" required value={contact.name} onChange={(v) => updateContact(contact.key, { name: v })} error={errors[`contacts.${index}.name`]} badge={confidenceBadge(`contacts.${index}.name`)} />
                    <TextField label="Designation" value={contact.designation} onChange={(v) => updateContact(contact.key, { designation: v })} badge={confidenceBadge(`contacts.${index}.designation`)} />
                    <SelectField label="Contact Type" value={contact.contactType} onChange={(v) => updateContact(contact.key, { contactType: v as VendorContactType })} options={CONTACT_TYPES} />
                    <TextField label="Mobile Number" value={contact.phone} onChange={(v) => updateContact(contact.key, { phone: v })} error={errors[`contacts.${index}.phone`]} inputMode="tel" placeholder="+91 98765 43210" badge={confidenceBadge(`contacts.${index}.phone`)} />
                    <TextField label="Alternate Mobile" value={contact.alternatePhone} onChange={(v) => updateContact(contact.key, { alternatePhone: v })} error={errors[`contacts.${index}.alternatePhone`]} inputMode="tel" badge={confidenceBadge(`contacts.${index}.alternatePhone`)} />
                    <div className="flex items-end pb-2">
                      <CheckboxField
                        label="Primary contact for this type"
                        checked={contact.isPrimary}
                        onChange={(checked) => updateContact(contact.key, { isPrimary: checked })}
                      />
                    </div>
                    <TextField label="Email Address" type="email" value={contact.email} onChange={(v) => updateContact(contact.key, { email: v })} error={errors[`contacts.${index}.email`]} badge={confidenceBadge(`contacts.${index}.email`)} />
                    <TextField label="Alternate Email" type="email" value={contact.alternateEmail} onChange={(v) => updateContact(contact.key, { alternateEmail: v })} error={errors[`contacts.${index}.alternateEmail`]} badge={confidenceBadge(`contacts.${index}.alternateEmail`)} />
                  </div>
                  {errors[`contacts.${index}.isPrimary`] && <p className="field-error">{errors[`contacts.${index}.isPrimary`]}</p>}
                </fieldset>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setContacts((rows) => [...rows, { ...emptyContact({ isPrimary: rows.length === 0 }), key: newKey() }])}
              >
                <IconPlus size={16} /> Add contact person
              </button>
            </div>
          </section>

          {/* C. Addresses ------------------------------------------------------ */}
          <section className="card p-5">
            {sectionTitle('C', 'Address Information', 'Registered office, branch offices and warehouses. One address is primary.')}
            <div className="space-y-4">
              {addresses.map((address, index) => (
                <fieldset key={address.key} className="rounded-xl border border-border p-4">
                  <legend className="sr-only">Address {index + 1}</legend>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      Address {index + 1}
                      {address.isPrimary && <span className="chip ml-2">Primary</span>}
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm text-danger hover:underline"
                      onClick={() =>
                        setAddresses((rows) => {
                          const remaining = rows.filter((row) => row.key !== address.key);
                          // Keep exactly one primary when the primary row is removed.
                          if (address.isPrimary && remaining[0]) remaining[0] = { ...remaining[0], isPrimary: true };
                          return remaining;
                        })
                      }
                    >
                      <IconTrash size={14} /> Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <SelectField label="Address Type" value={address.addressType} onChange={(v) => updateAddress(address.key, { addressType: v as VendorAddressType })} options={ADDRESS_TYPES} />
                    <TextField className="xl:col-span-2" label="Address Line 1" required value={address.addressLine1} onChange={(v) => updateAddress(address.key, { addressLine1: v })} error={errors[`addresses.${index}.addressLine1`]} badge={confidenceBadge(`addresses.${index}.addressLine1`)} />
                    <TextField className="md:col-span-2 xl:col-span-3" label="Address Line 2" value={address.addressLine2} onChange={(v) => updateAddress(address.key, { addressLine2: v })} />
                    <TextField label="City" value={address.city} onChange={(v) => updateAddress(address.key, { city: v })} badge={confidenceBadge(`addresses.${index}.city`)} />
                    <TextField label="State" value={address.state} onChange={(v) => updateAddress(address.key, { state: v })} badge={confidenceBadge(`addresses.${index}.state`)} />
                    <TextField label="PIN Code" value={address.postalCode} onChange={(v) => updateAddress(address.key, { postalCode: v })} error={errors[`addresses.${index}.postalCode`]} inputMode="numeric" badge={confidenceBadge(`addresses.${index}.postalCode`)} />
                    <TextField label="Country" value={address.country} onChange={(v) => updateAddress(address.key, { country: v })} />
                    <div className="flex items-end pb-2">
                      <CheckboxField
                        label="Primary address"
                        checked={address.isPrimary}
                        disabled={address.isPrimary}
                        onChange={(checked) => checked && updateAddress(address.key, { isPrimary: true })}
                      />
                    </div>
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAddresses((rows) => [...rows, { ...emptyAddress({ addressType: 'OFFICE', isPrimary: rows.length === 0 }), key: newKey() }])}
              >
                <IconPlus size={16} /> Add address
              </button>
            </div>
          </section>

          {/* D + E. Brands and products ---------------------------------------- */}
          <section className="card p-5">
            {sectionTitle('D', 'Brand / Company Mapping', 'Brands come from the shared brand master used by Product Management.')}
            <SearchSelect
              label="Brands supplied"
              multiple
              placeholder="Search brands..."
              search={brandSearch}
              selected={brands}
              onChange={setBrands}
              onCreate={can('company.create') ? createBrand : undefined}
              createLabel={(term) => `Register new brand "${term}"`}
              emptyText="No brand found"
            />
            {mode === 'ocr' && brands.length > 0 && (
              <p className="field-hint">Brands pre-selected because their names appear in the document. Remove any that do not apply.</p>
            )}

            <div className="mt-6 border-t border-border pt-5">
              {sectionTitle('E', 'Product / Model Mapping', "Pick existing catalogue models. Each product's brand is mapped automatically.")}
              <SearchSelect
                label="Products supplied"
                multiple
                placeholder="Search by product name, model or code..."
                search={productSearch}
                selected={products}
                onChange={(next) => {
                  setProducts(next);
                  // A vendor can only supply brands it is mapped to. Add the
                  // brands of picked products visibly, so the choice is explicit.
                  setBrands((current) => {
                    const ids = new Set(current.map((b) => b.id));
                    const added = next.map((p) => p.meta).filter((m): m is SearchOption => Boolean(m && !ids.has(m.id) && ids.add(m.id)));
                    return added.length ? [...current, ...added] : current;
                  });
                }}
                emptyText="No product found"
              />
              <p className="field-hint">
                Picking a product adds its brand to section D. Specific models, SKU, lead time and preferred-supplier
                details can be set per product from the vendor profile after saving.
                {can('product.create') && (
                  <>
                    {' '}Model not in the catalogue?{' '}
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => setProductModal(true)}>
                      Register it in the shared catalogue
                    </button>
                    .
                  </>
                )}
              </p>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          Contacts, addresses, brands, products and documents are managed on the{' '}
          <Link href={`/vendors/${vendorId}`} className="font-medium text-accent hover:underline">
            vendor profile
          </Link>
          , where each change is saved and recorded individually.
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <Link href={vendorId ? `/vendors/${vendorId}` : '/vendors'} className="btn-secondary">
          Cancel
        </Link>
        <button
          type="submit"
          className="btn-primary px-5"
          disabled={pending || blocking.length > 0 || (creating && warnings.length > 0 && !acknowledged)}
        >
          {pending ? 'Saving...' : mode === 'edit' ? 'Save Changes' : mode === 'ocr' ? 'Confirm and Save' : 'Save Vendor'}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {ocr ? <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">{form}{extractedPanel}</div> : form}

      {creating && can('product.create') && (
        <QuickProductModal
          open={productModal}
          onClose={() => setProductModal(false)}
          productCategories={productCategories}
          brandSearch={brandSearch}
          onCreated={(option) => {
            setProducts((current) => [...current, option]);
            // Same rule as picking a product: its brand must be mapped too,
            // or the API rejects the save.
            const brand = option.meta;
            if (brand) setBrands((current) => (current.some((b) => b.id === brand.id) ? current : [...current, brand]));
            setProductModal(false);
          }}
        />
      )}
    </>
  );
}

/**
 * Registers a product/model in the shared catalogue (Product Management's
 * table) so it can be mapped. Brand + model number is unique there, so this
 * cannot create a second copy of an existing model.
 */
export function QuickProductModal({
  open,
  onClose,
  productCategories,
  brandSearch,
  onCreated,
  defaultBrand,
}: {
  open: boolean;
  onClose: () => void;
  productCategories: ProductCategory[];
  brandSearch: (term: string) => Promise<SearchOption[]>;
  onCreated: (option: SearchOption) => void;
  defaultBrand?: SearchOption;
}) {
  const [name, setName] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [brand, setBrand] = useState<SearchOption[]>(defaultBrand ? [defaultBrand] : []);
  const [categoryId, setCategoryId] = useState('');
  const [result, setResult] = useState<{ error?: string }>({});
  const [pending, startTransition] = useTransition();

  const categoryOptions = useMemo(
    () => productCategories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    [productCategories],
  );

  const save = () =>
    startTransition(async () => {
      if (!brand[0]) {
        setResult({ error: 'Select the brand this product belongs to.' });
        return;
      }
      const outcome = await quickCreateProductAction({ name, modelName, modelNumber, companyId: brand[0].id, categoryId });
      if (outcome.product) {
        onCreated({ id: outcome.product.id, label: outcome.product.name, detail: brand[0].label, meta: brand[0] });
        setName('');
        setModelName('');
        setModelNumber('');
        setResult({});
      } else {
        setResult({ error: outcome.error });
      }
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register product in the shared catalogue"
      description="The product is created once in Product Management and can then be mapped to any vendor."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending}>
            {pending ? 'Registering...' : 'Register product'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <SearchSelect label="Brand *" placeholder="Search brands..." search={brandSearch} selected={brand} onChange={setBrand} />
        </div>
        <TextField className="sm:col-span-2" label="Product Name" required value={name} onChange={setName} placeholder="e.g. HP ProBook Laptop" />
        <TextField label="First Model Name" value={modelName} onChange={setModelName} placeholder="e.g. ProBook 440 G10" hint="Optional; more models can be added in Product Management" />
        <TextField label="Model Number" value={modelNumber} onChange={setModelNumber} placeholder="e.g. 8A5D7PA" />
        <SelectField className="sm:col-span-2" label="Category" value={categoryId} onChange={setCategoryId} placeholder="Not categorised" options={categoryOptions} />
        <div className="sm:col-span-2">
          <ResultAlert result={result} />
        </div>
      </div>
    </Modal>
  );
}
