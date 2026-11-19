'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createVendorAction,
  updateVendorAction,
  type VendorFormState,
} from '@/lib/vendor-actions';
import type { Company, VendorCategory } from '@/lib/types';

interface Props {
  categories: VendorCategory[];
  companies: Company[];
  /** Values extracted by OCR, or the current values when editing. */
  initialValues?: Record<string, string>;
  /** Set when this form is confirming an OCR draft. */
  ocrJobId?: string;
  /** Per-field OCR confidence, shown so low-confidence values get checked. */
  confidence?: Record<string, number | null>;
  /** Present when editing an existing vendor rather than creating one. */
  vendorId?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving...' : label}
    </button>
  );
}

function ConfidenceHint({ value }: { value?: number | null }) {
  if (value === undefined || value === null) return null;

  const percent = Math.round(value * 100);
  const low = value < 0.8;

  return (
    <span
      className={`ml-2 text-xs font-normal ${low ? 'text-warning' : 'text-ink-subtle'}`}
    >
      {low ? `Low confidence - ${percent}%, please verify` : `Extracted - ${percent}%`}
    </span>
  );
}

export function VendorForm({
  categories,
  companies,
  initialValues = {},
  ocrJobId,
  confidence = {},
  vendorId,
}: Props) {
  const [state, formAction] = useActionState<VendorFormState, FormData>(
    vendorId ? updateVendorAction.bind(null, vendorId) : createVendorAction,
    {},
  );

  const [acknowledgeDuplicate, setAcknowledgeDuplicate] = useState(false);

  // After a failed submit the server echoes the values back, so nothing typed
  // is lost; otherwise fall back to the OCR prefill.
  const initial = (field: string): string =>
    state.values?.[field] ?? initialValues[field] ?? '';

  const blocking = state.duplicates?.filter((d) => d.severity === 'blocking') ?? [];
  const warnings = state.duplicates?.filter((d) => d.severity === 'warning') ?? [];

  const field = (
    name: string,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      placeholder?: string;
      hint?: string;
      autoComplete?: string;
    } = {},
  ) => (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
        {options.required && <span className="text-danger"> *</span>}
        <ConfidenceHint value={confidence[name]} />
      </label>
      <input
        id={name}
        name={name}
        type={options.type ?? 'text'}
        required={options.required}
        defaultValue={initial(name)}
        placeholder={options.placeholder}
        autoComplete={options.autoComplete ?? 'off'}
        className="field-input"
      />
      {options.hint && <p className="field-hint">{options.hint}</p>}
    </div>
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {ocrJobId && <input type="hidden" name="ocrJobId" value={ocrJobId} />}
      {acknowledgeDuplicate && (
        <input type="hidden" name="confirmPossibleDuplicate" value="true" />
      )}

      {state.error && blocking.length === 0 && warnings.length === 0 && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5"
        >
          <p className="text-sm font-medium text-danger">{state.error}</p>
          {state.fieldErrors && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-danger/90">
              {state.fieldErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {blocking.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5"
        >
          <p className="text-sm font-medium text-danger">
            This GSTIN is already registered
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-danger/90">
            {blocking.map((match) => (
              <li key={match.vendorId}>
                <Link
                  href={`/vendors/${match.vendorId}`}
                  className="underline underline-offset-2"
                >
                  {match.businessName} ({match.vendorCode})
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-danger/90">
            A GSTIN identifies one business. Edit the existing vendor instead of
            creating a second record.
          </p>
        </div>
      )}

      {warnings.length > 0 && blocking.length === 0 && (
        <div
          role="alert"
          className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2.5"
        >
          <p className="text-sm font-medium text-warning">
            A similar vendor already exists
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-warning/90">
            {warnings.map((match) => (
              <li key={match.vendorId}>
                <Link
                  href={`/vendors/${match.vendorId}`}
                  className="underline underline-offset-2"
                >
                  {match.businessName} ({match.vendorCode})
                </Link>{' '}
                &mdash; same {match.matchedOn}
              </li>
            ))}
          </ul>
          <label className="mt-2.5 flex items-start gap-2 text-sm text-warning">
            <input
              type="checkbox"
              checked={acknowledgeDuplicate}
              onChange={(event) => setAcknowledgeDuplicate(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border-strong"
            />
            <span>
              I have checked the matches above. This is a different business &mdash;
              create it anyway.
            </span>
          </label>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-ink">Business details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('businessName', 'Vendor name', {
            required: true,
            placeholder: 'Shree Computers Pvt Ltd',
          })}
          {field('legalName', 'Registered legal name', {
            hint: 'Only if different from the trading name',
          })}

          <div>
            <label htmlFor="categoryId" className="field-label">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={initial('categoryId')}
              className="field-input"
            >
              <option value="">Not categorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {field('website', 'Website', { placeholder: 'www.example.com' })}
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="text-lg font-semibold text-ink">Contact</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('contactPerson', 'Contact person')}
          {field('email', 'Email address', { type: 'email' })}
          {field('phone', 'Phone')}
          {field('alternatePhone', 'Alternate phone')}
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="text-lg font-semibold text-ink">Address</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('addressLine1', 'Address line 1')}
          {field('addressLine2', 'Address line 2')}
          {field('city', 'City')}
          {field('state', 'State')}
          {field('postalCode', 'PIN code')}
          <div>
            <label htmlFor="country" className="field-label">
              Country
            </label>
            <input
              id="country"
              name="country"
              defaultValue={initial('country') || 'India'}
              className="field-input"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-border pt-5">
        <legend className="text-lg font-semibold text-ink">Tax identifiers</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('gstin', 'GSTIN', {
            placeholder: '29ABCDE1234F1Z5',
            hint: 'Checked for format and checksum before saving',
          })}
          {field('pan', 'PAN', {
            placeholder: 'ABCDE1234F',
            hint: 'Must match the PAN inside the GSTIN when both are given',
          })}
        </div>
      </fieldset>

      {/* Brand selection is create-only: on an existing vendor, brands are
          managed from the detail page so each change is audited separately. */}
      {companies.length > 0 && !vendorId && (
        <fieldset className="space-y-3 border-t border-border pt-5">
          <legend className="text-lg font-semibold text-ink">Brands supplied</legend>
          <p className="text-sm text-ink-muted">
            Optional. More brands and specific products can be mapped after saving.
          </p>
          <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3">
            {companies.map((company) => (
              <label key={company.id} className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  name="companyIds"
                  value={company.id}
                  className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
                />
                <span className="truncate">{company.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="border-t border-border pt-5">
        <label htmlFor="notes" className="field-label">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial('notes')}
          className="field-input"
          placeholder="Payment terms discussed, areas covered, other remarks"
        />
      </fieldset>

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <SubmitButton
          label={
            vendorId
              ? 'Save changes'
              : ocrJobId
                ? 'Confirm and save vendor'
                : 'Save vendor'
          }
        />
        <Link
          href={vendorId ? `/vendors/${vendorId}` : '/vendors'}
          className="btn-secondary"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
