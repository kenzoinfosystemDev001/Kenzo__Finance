'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  checkCustomerDuplicatesAction,
  createCustomerAction,
  updateCustomerAction,
  type CustomerAddressPayload,
  type CustomerBasicsPayload,
  type CustomerContactPayload,
  type CustomerFormResult,
} from '@/lib/customer-actions';
import {
  BUSINESS_TYPES,
  COMPANY_SIZES,
  CUSTOMER_ADDRESS_TYPE_LABELS,
  isIndia,
  TURNOVER_RANGES,
} from '@/lib/customer-labels';
import type { CustomerAddressType, CustomerCategory, CustomerDuplicate, CustomerStatus, CustomerType } from '@/lib/types';
import {
  CheckboxField,
  isEmail,
  isGstinFormat,
  isPanFormat,
  isPhone,
  isPostalCode,
  isWebsite,
  ResultAlert,
  SelectField,
  TextField,
} from './client-ui';
import { IconAlert, IconPlus, IconTrash } from './icons';

let seed = 0;
const key = () => `c${++seed}`;

export const emptyCustomerContact = (o: Partial<CustomerContactPayload> = {}): CustomerContactPayload => ({
  name: '', designation: '', department: '', email: '', phone: '', alternatePhone: '', isPrimary: false, ...o,
});
export const emptyCustomerAddress = (o: Partial<CustomerAddressPayload> = {}): CustomerAddressPayload => ({
  addressType: 'BILLING', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: 'India', isDefault: false, ...o,
});

// Customer type starts unset and is required; the form refuses to save until it is chosen.
const emptyBasics: CustomerBasicsPayload = {
  customerType: '' as CustomerType, name: '', categoryId: '', industry: '', website: '', description: '', taxCountry: 'India',
  gstin: '', pan: '', cin: '', taxRegistrationNumber: '', otherRegistration: '', companySize: '', businessType: '',
  annualTurnoverRange: '', employeeCount: '',
};

const ADDRESS_TYPES = Object.entries(CUSTOMER_ADDRESS_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const CIN = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

/** Mirrors the API's tax rules: Indian identifiers only for India, CIN only for businesses. */
function validateBasics(b: CustomerBasicsPayload): Record<string, string> {
  const e: Record<string, string> = {};
  if (!b.customerType) e.customerType = 'Select a customer type.';
  if (b.name.trim().length < 2) e.name = 'Customer name is required (at least 2 characters).';
  if (b.website.trim() && !isWebsite(b.website)) e.website = 'Enter a valid website address.';
  if (isIndia(b.taxCountry)) {
    if (b.gstin.trim() && !isGstinFormat(b.gstin)) e.gstin = 'GSTIN must be 15 characters in the standard format.';
    if (b.pan.trim() && !isPanFormat(b.pan)) e.pan = 'PAN must look like ABCDE1234F.';
    if (b.gstin.trim() && b.pan.trim() && isGstinFormat(b.gstin) && isPanFormat(b.pan)) {
      const embedded = b.gstin.replace(/\s/g, '').toUpperCase().slice(2, 12);
      if (embedded !== b.pan.replace(/\s/g, '').toUpperCase()) e.pan = `PAN does not match the GSTIN (expected ${embedded}).`;
    }
    if (b.cin.trim() && !CIN.test(b.cin.replace(/\s/g, '').toUpperCase())) e.cin = 'CIN must be 21 characters in the standard format.';
  }
  if (b.employeeCount.trim() && !/^\d{1,8}$/.test(b.employeeCount.trim())) e.employeeCount = 'Enter a whole number.';
  return e;
}

export function CustomerForm({
  mode,
  customerId,
  categories,
  initial,
}: {
  mode: 'create' | 'edit';
  customerId?: string;
  categories: CustomerCategory[];
  initial?: Partial<CustomerBasicsPayload>;
}) {
  const creating = mode === 'create';
  const [basics, setBasics] = useState<CustomerBasicsPayload>({ ...emptyBasics, ...initial });
  const [status, setStatus] = useState<CustomerStatus>('ACTIVE');
  const [contacts, setContacts] = useState<Array<CustomerContactPayload & { key: string }>>(
    creating ? [{ ...emptyCustomerContact({ isPrimary: true }), key: key() }] : [],
  );
  const [addresses, setAddresses] = useState<Array<CustomerAddressPayload & { key: string }>>(
    // Addresses are optional for a customer; an empty default row would fail validation.
    [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CustomerFormResult>({});
  const [duplicates, setDuplicates] = useState<CustomerDuplicate[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, startTransition] = useTransition();

  const india = isIndia(basics.taxCountry);
  const business = basics.customerType === 'BUSINESS';
  const set = <K extends keyof CustomerBasicsPayload>(field: K, value: CustomerBasicsPayload[K]) => {
    setBasics((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };
  const setContact = (k: string, change: Partial<CustomerContactPayload>) =>
    setContacts((rows) => rows.map((r) => (r.key === k ? { ...r, ...change } : change.isPrimary ? { ...r, isPrimary: false } : r)));
  const setAddress = (k: string, change: Partial<CustomerAddressPayload>) =>
    setAddresses((rows) => {
      const target = rows.find((r) => r.key === k)!;
      const type = change.addressType ?? target.addressType;
      return rows.map((r) =>
        r.key === k ? { ...r, ...change } : change.isDefault && r.addressType === type ? { ...r, isDefault: false } : r,
      );
    });

  const copyBillingToShipping = () => {
    const billing = addresses.find((a) => a.addressType === 'BILLING' && a.isDefault) ?? addresses.find((a) => a.addressType === 'BILLING');
    if (!billing) return;
    const hasShippingDefault = addresses.some((a) => a.addressType === 'SHIPPING' && a.isDefault);
    setAddresses((rows) => [...rows, { ...billing, addressType: 'SHIPPING', isDefault: !hasShippingDefault, key: key() }]);
  };

  const checkDuplicates = async () => {
    const matches = await checkCustomerDuplicatesAction({
      name: basics.name.trim() || undefined,
      gstin: basics.gstin.trim() || undefined,
      pan: basics.pan.trim() || undefined,
      emails: contacts.map((c) => c.email).filter((v) => v.trim()),
      phones: contacts.flatMap((c) => [c.phone, c.alternatePhone]).filter((v) => v.trim()),
    });
    setDuplicates(matches);
    if (!matches.length) setAcknowledged(false);
  };

  const submit = () => {
    const found = validateBasics(basics);
    if (creating) {
      contacts.forEach((c, i) => {
        if (!c.name.trim()) found[`contacts.${i}.name`] = 'Contact name is required.';
        if (c.email.trim() && !isEmail(c.email)) found[`contacts.${i}.email`] = 'Enter a valid email address.';
        if (c.phone.trim() && !isPhone(c.phone)) found[`contacts.${i}.phone`] = 'Enter a valid phone number.';
        if (c.alternatePhone.trim() && !isPhone(c.alternatePhone)) found[`contacts.${i}.alternatePhone`] = 'Enter a valid phone number.';
      });
      if (!contacts.some((c) => c.phone.trim() || c.email.trim())) found.contacts = 'Add at least one contact with a phone number or email.';
      addresses.forEach((a, i) => {
        if (!a.addressLine1.trim()) found[`addresses.${i}.addressLine1`] = 'Address line 1 is required.';
        if (a.postalCode.trim() && !isPostalCode(a.postalCode)) found[`addresses.${i}.postalCode`] = 'Enter a valid postal code.';
      });
    }
    setErrors(found);
    if (Object.keys(found).length) {
      setResult({ error: 'Please correct the highlighted fields.' });
      return;
    }

    // Values that do not apply are cleared rather than silently saved.
    const cleaned: CustomerBasicsPayload = {
      ...basics,
      gstin: india ? basics.gstin : '',
      pan: india ? basics.pan : '',
      cin: india && business ? basics.cin : '',
      taxRegistrationNumber: india ? '' : basics.taxRegistrationNumber,
      ...(business ? {} : { companySize: '', businessType: '', annualTurnoverRange: '', employeeCount: '' }),
    };

    startTransition(async () => {
      const outcome =
        mode === 'edit' && customerId
          ? await updateCustomerAction(customerId, cleaned)
          : await createCustomerAction({
              ...cleaned,
              status,
              contacts: contacts.map(({ key: _k, ...c }) => c),
              addresses: addresses.map(({ key: _k, ...a }) => a),
              confirmPossibleDuplicate: acknowledged,
            });
      setResult(outcome);
      if (outcome.duplicates) {
        setDuplicates(outcome.duplicates);
        setAcknowledged(false);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const blocking = duplicates.filter((d) => d.severity === 'blocking');
  const warnings = duplicates.filter((d) => d.severity === 'warning');

  const section = (letter: string, title: string, description: string, children: React.ReactNode) => (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-sm font-bold text-accent">{letter}</span>
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-5">
      <ResultAlert result={result.duplicates?.length ? {} : result} />

      {blocking.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
          <p className="flex items-center gap-2 font-semibold"><IconAlert size={16} /> This GSTIN is already registered</p>
          <ul className="mt-1 space-y-0.5">
            {blocking.map((d) => (
              <li key={d.customerId}><Link href={`/customers/${d.customerId}`} target="_blank" className="underline">{d.name} ({d.customerCode})</Link></li>
            ))}
          </ul>
          <p className="mt-1">Update the existing customer instead of creating a second record.</p>
        </div>
      )}
      {creating && warnings.length > 0 && blocking.length === 0 && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          <p className="flex items-center gap-2 font-semibold"><IconAlert size={16} /> Possible duplicate customer</p>
          <ul className="mt-1 space-y-0.5">
            {warnings.map((d) => (
              <li key={d.customerId}>
                <Link href={`/customers/${d.customerId}`} target="_blank" className="underline">{d.name} ({d.customerCode})</Link> &mdash; same {d.matchedOn}
                {d.status === 'INACTIVE' && ' (inactive)'}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <CheckboxField label="I have reviewed these customers. This is a different customer — create it anyway." checked={acknowledged} onChange={setAcknowledged} />
          </div>
        </div>
      )}

      {section('A', 'Basic Information', 'The customer code is generated on save.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Customer Type"
            required
            value={basics.customerType}
            onChange={(v) => set('customerType', v as CustomerType)}
            placeholder="Select customer type"
            error={errors.customerType}
            options={[{ value: 'BUSINESS', label: 'Business / Company' }, { value: 'INDIVIDUAL', label: 'Individual' }]}
          />
          <TextField className="xl:col-span-2" label={business ? 'Company Name' : 'Customer Name'} required value={basics.name} onChange={(v) => set('name', v)} error={errors.name} maxLength={200} />
          <SelectField label="Customer Category" value={basics.categoryId} onChange={(v) => set('categoryId', v)} placeholder="Not categorised" options={categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (inactive)` }))} />
          <TextField label="Industry" value={basics.industry} onChange={(v) => set('industry', v)} maxLength={100} placeholder="Enter industry" />
          <TextField label="Website" value={basics.website} onChange={(v) => set('website', v)} error={errors.website} placeholder="Enter website address" />
          {creating && (
            <SelectField label="Status" value={status} onChange={(v) => setStatus(v as CustomerStatus)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
          )}
          <div className="md:col-span-2 xl:col-span-3">
            <label htmlFor="customer-description" className="field-label">Description</label>
            <textarea id="customer-description" rows={2} maxLength={2000} value={basics.description} onChange={(e) => set('description', e.target.value)} className="field-input" />
          </div>
        </div>,
      )}

      {section('B', 'Registration and Tax Information', 'All optional. Indian GSTIN / PAN / CIN apply only when the tax country is India.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TextField label="Tax Country" value={basics.taxCountry} onChange={(v) => set('taxCountry', v)} maxLength={100} hint="Country the customer is registered for tax in" />
          {india ? (
            <>
              <TextField label="GSTIN" value={basics.gstin} onChange={(v) => set('gstin', v.toUpperCase())} error={errors.gstin} maxLength={15} placeholder="Enter GSTIN" />
              <TextField label="PAN" value={basics.pan} onChange={(v) => set('pan', v.toUpperCase())} error={errors.pan} maxLength={10} placeholder="Enter PAN" />
              {business && <TextField label="CIN / Company Registration No." value={basics.cin} onChange={(v) => set('cin', v.toUpperCase())} error={errors.cin} maxLength={21} />}
            </>
          ) : (
            <TextField label="Tax Registration Number" value={basics.taxRegistrationNumber} onChange={(v) => set('taxRegistrationNumber', v)} maxLength={40} hint="VAT / TIN / EIN as applicable" />
          )}
          <TextField className="md:col-span-2" label="Other Registration Details" value={basics.otherRegistration} onChange={(v) => set('otherRegistration', v)} maxLength={500} placeholder="Enter registration name" />
        </div>,
      )}

      {creating && section('C', 'Contact Persons', 'At least one contact with a phone or email. One primary contact.',
        <div className="space-y-4">
          {errors.contacts && <p className="field-error">{errors.contacts}</p>}
          {contacts.map((c, i) => (
            <fieldset key={c.key} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <legend className="text-sm font-semibold text-ink">Contact {i + 1} {c.isPrimary && <span className="chip ml-1">Primary</span>}</legend>
                {contacts.length > 1 && (
                  <button type="button" className="inline-flex items-center gap-1 text-sm text-danger hover:underline" onClick={() => setContacts((rows) => {
                    const rest = rows.filter((r) => r.key !== c.key);
                    if (c.isPrimary && rest[0]) rest[0] = { ...rest[0], isPrimary: true };
                    return rest;
                  })}><IconTrash size={14} /> Remove</button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <TextField label="Contact Person Name" required value={c.name} onChange={(v) => setContact(c.key, { name: v })} error={errors[`contacts.${i}.name`]} />
                <TextField label="Designation" value={c.designation} onChange={(v) => setContact(c.key, { designation: v })} />
                <TextField label="Department" value={c.department} onChange={(v) => setContact(c.key, { department: v })} />
                <TextField label="Email" type="email" value={c.email} onChange={(v) => setContact(c.key, { email: v })} error={errors[`contacts.${i}.email`]} />
                <TextField label="Phone Number" value={c.phone} onChange={(v) => setContact(c.key, { phone: v })} error={errors[`contacts.${i}.phone`]} inputMode="tel" />
                <TextField label="Alternate Phone" value={c.alternatePhone} onChange={(v) => setContact(c.key, { alternatePhone: v })} error={errors[`contacts.${i}.alternatePhone`]} inputMode="tel" />
                <div className="pt-1"><CheckboxField label="Primary contact" checked={c.isPrimary} disabled={c.isPrimary} onChange={(v) => v && setContact(c.key, { isPrimary: true })} /></div>
              </div>
            </fieldset>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setContacts((rows) => [...rows, { ...emptyCustomerContact(), key: key() }])}><IconPlus size={16} /> Add contact</button>
        </div>,
      )}

      {creating && section('D', 'Addresses', 'Billing, shipping, office or registered addresses. One default per type.',
        <div className="space-y-4">
          {addresses.map((a, i) => (
            <fieldset key={a.key} className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <legend className="text-sm font-semibold text-ink">Address {i + 1} {a.isDefault && <span className="chip ml-1">Default {CUSTOMER_ADDRESS_TYPE_LABELS[a.addressType].replace(' Address', '').toLowerCase()}</span>}</legend>
                <button type="button" className="inline-flex items-center gap-1 text-sm text-danger hover:underline" onClick={() => setAddresses((rows) => rows.filter((r) => r.key !== a.key))}><IconTrash size={14} /> Remove</button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SelectField label="Address Type" value={a.addressType} onChange={(v) => setAddress(a.key, { addressType: v as CustomerAddressType, isDefault: !addresses.some((r) => r.key !== a.key && r.addressType === v && r.isDefault) })} options={ADDRESS_TYPES} />
                <TextField className="xl:col-span-2" label="Address Line 1" required value={a.addressLine1} onChange={(v) => setAddress(a.key, { addressLine1: v })} error={errors[`addresses.${i}.addressLine1`]} />
                <TextField className="md:col-span-2 xl:col-span-3" label="Address Line 2" value={a.addressLine2} onChange={(v) => setAddress(a.key, { addressLine2: v })} />
                <TextField label="City" value={a.city} onChange={(v) => setAddress(a.key, { city: v })} />
                <TextField label="State" value={a.state} onChange={(v) => setAddress(a.key, { state: v })} />
                <TextField label="Postal Code" value={a.postalCode} onChange={(v) => setAddress(a.key, { postalCode: v })} error={errors[`addresses.${i}.postalCode`]} />
                <TextField label="Country" value={a.country} onChange={(v) => setAddress(a.key, { country: v })} />
                <div className="pt-1"><CheckboxField label="Default address of this type" checked={a.isDefault} disabled={a.isDefault} onChange={(v) => v && setAddress(a.key, { isDefault: true })} /></div>
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAddresses((rows) => {
              const type: CustomerAddressType = rows.some((r) => r.addressType === 'BILLING') ? 'SHIPPING' : 'BILLING';
              const hasDefault = rows.some((r) => r.addressType === type && r.isDefault);
              return [...rows, { ...emptyCustomerAddress({ addressType: type, isDefault: !hasDefault }), key: key() }];
            })}><IconPlus size={16} /> Add address</button>
            {addresses.some((a) => a.addressType === 'BILLING' && a.addressLine1.trim()) && (
              <button type="button" className="btn-secondary" onClick={copyBillingToShipping}>Copy billing address to shipping</button>
            )}
          </div>
        </div>,
      )}

      {business && section(creating ? 'E' : 'C', 'Business Information', 'Optional profile for business customers.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Company Size" value={basics.companySize} onChange={(v) => set('companySize', v)} placeholder="Not specified" options={COMPANY_SIZES.map((v) => ({ value: v, label: `${v} employees` }))} />
          <SelectField label="Business Type" value={basics.businessType} onChange={(v) => set('businessType', v)} placeholder="Not specified" options={BUSINESS_TYPES.map((v) => ({ value: v, label: v }))} />
          <SelectField label="Annual Turnover Range" value={basics.annualTurnoverRange} onChange={(v) => set('annualTurnoverRange', v)} placeholder="Not specified" options={TURNOVER_RANGES.map((v) => ({ value: v, label: v }))} />
          <TextField label="Number of Employees" value={basics.employeeCount} onChange={(v) => set('employeeCount', v)} error={errors.employeeCount} inputMode="numeric" />
        </div>,
      )}

      {!creating && (
        <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          Status, contacts, addresses, products of interest and documents are managed on the customer profile.
        </p>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        {creating && <button type="button" className="mr-auto text-sm font-medium text-accent hover:underline" onClick={checkDuplicates}>Check for existing customers</button>}
        <Link href={customerId ? `/customers/${customerId}` : '/customers'} className="btn-secondary">Cancel</Link>
        <button type="submit" className={clsx('btn-primary px-5')} disabled={pending || blocking.length > 0 || (creating && warnings.length > 0 && !acknowledged)}>
          {pending ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Save Customer'}
        </button>
      </div>
    </form>
  );
}
