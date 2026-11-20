'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import { ResultAlert, SelectField, TextField } from './client-ui';
import { ProformaLines } from './proforma-lines';
import { createProformaAction, updateProformaAction, type ProformaDetailsPayload } from '@/lib/proforma-actions';
import { formatMoney } from '@/lib/quotation-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { EnquiryAssignee, ProformaBankDetails, ProformaItem, ProformaTotals, QuotationCustomerSnapshot } from '@/lib/types';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SWIFT = /^([A-Z0-9]{8}|[A-Z0-9]{11})$/;

export interface ProformaFormProps {
  mode: 'create' | 'edit';
  /** create: the quotation to convert; edit: the PI being edited. */
  quotationId?: string;
  proformaId?: string;
  piNumber?: string;
  quotationRef: { quotationNumber: string; revisionNumber: number; acceptedAt: string | null; enquiryNumber: string | null };
  customerName: string;
  customerSnapshot: QuotationCustomerSnapshot;
  contacts: Array<{ id: string; name: string; designation: string | null }>;
  assignees: EnquiryAssignee[];
  currency: string;
  items: ProformaItem[];
  totals: ProformaTotals;
  initial: ProformaDetailsPayload;
  /** A cancelled PI this one will replace (create only). */
  replaces?: { id: string; piNumber: string } | null;
  approvalRequired: boolean;
}

const addressText = (snapshot: QuotationCustomerSnapshot) => {
  const a = snapshot.billingAddress;
  return a ? [a.addressLine1, a.addressLine2, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.country].filter(Boolean).join(', ') : '';
};

export function ProformaForm(props: ProformaFormProps) {
  const [values, setValues] = useState<ProformaDetailsPayload>(props.initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult & { existingId?: string }>({});
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ProformaDetailsPayload>(key: K, value: ProformaDetailsPayload[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };
  const setBank = (key: keyof ProformaBankDetails, value: string) => {
    setValues((v) => ({ ...v, bankDetails: { ...v.bankDetails, [key]: value } }));
    setErrors(({ [`bank.${key}`]: _drop, ...rest }) => rest);
  };

  const validate = () => {
    const found: Record<string, string> = {};
    if (!values.piDate) found.piDate = 'PI date is required.';
    if (values.dueDate && values.piDate && values.dueDate < values.piDate) found.dueDate = 'The due date cannot be before the PI date.';
    if (values.advanceAmount.trim()) {
      if (!MONEY.test(values.advanceAmount.trim())) found.advanceAmount = 'Enter a number with up to 2 decimals.';
      else if (Math.round(Number(values.advanceAmount) * 100) > Math.round(Number(props.totals.grandTotal) * 100)) found.advanceAmount = 'Cannot exceed the grand total.';
    }
    const ifsc = (values.bankDetails.ifsc ?? '').trim().toUpperCase();
    if (ifsc && !IFSC.test(ifsc)) found['bank.ifsc'] = 'IFSC must look like ABCD0123456.';
    const swift = (values.bankDetails.swift ?? '').trim().toUpperCase();
    if (swift && !SWIFT.test(swift)) found['bank.swift'] = 'SWIFT/BIC must be 8 or 11 letters/digits.';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return; // repeated clicks never send a second request
    if (!validate()) {
      setResult({ error: 'Please correct the highlighted fields.' });
      return;
    }
    setResult({});
    startTransition(async () => {
      const payload = { ...values, bankDetails: { ...values.bankDetails, ifsc: values.bankDetails.ifsc?.toUpperCase(), swift: values.bankDetails.swift?.toUpperCase() } };
      const outcome = props.mode === 'create' ? await createProformaAction(props.quotationId!, payload) : await updateProformaAction(props.proformaId!, payload);
      // Success redirects; only failures come back here.
      if (outcome) setResult(outcome);
    });
  };

  const area = (key: keyof ProformaDetailsPayload, label: string, rows = 3, hint?: string) => (
    <div>
      <label htmlFor={`pi-${key}`} className="field-label">{label}</label>
      <textarea id={`pi-${key}`} rows={rows} maxLength={key === 'termsAndConditions' ? 8000 : 4000} value={values[key] as string} onChange={(e) => set(key, e.target.value as never)} className="field-input" />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );

  const snapshot = props.customerSnapshot;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {props.replaces && (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          This proforma invoice will replace the cancelled <strong>{props.replaces.piNumber}</strong>. Both stay on record and are linked.
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">A. Basic information</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <span className="field-label">PI number</span>
            <p className="field-input flex items-center bg-surface-muted font-mono text-ink-muted">{props.piNumber ?? 'Generated on save'}</p>
          </div>
          <div>
            <span className="field-label">Source quotation</span>
            <p className="field-input flex items-center bg-surface-muted text-ink-muted">
              {props.quotationRef.quotationNumber} · Revision {props.quotationRef.revisionNumber}
            </p>
            {props.quotationRef.enquiryNumber && <p className="field-hint">From enquiry {props.quotationRef.enquiryNumber}</p>}
          </div>
          <div>
            <span className="field-label">Currency</span>
            <p className="field-input flex items-center bg-surface-muted text-ink-muted">{props.currency}</p>
            <p className="field-hint">Fixed by the accepted quotation.</p>
          </div>
          <TextField label="PI Date" type="date" required value={values.piDate} onChange={(v) => set('piDate', v)} error={errors.piDate} />
          <TextField label="Payment Due Date" type="date" value={values.dueDate} onChange={(v) => set('dueDate', v)} error={errors.dueDate} hint="Optional. Enter only if agreed with the customer." />
          <SelectField
            label="Assigned To"
            value={values.assignedToId}
            onChange={(v) => set('assignedToId', v)}
            placeholder="Unassigned"
            options={props.assignees.map((a) => ({ value: a.id, label: a.fullName }))}
          />
          <TextField label="Subject" value={values.subject} onChange={(v) => set('subject', v)} maxLength={300} />
          <TextField label="Customer Reference No." value={values.referenceNumber} onChange={(v) => set('referenceNumber', v)} maxLength={100} hint="e.g. the customer's purchase order number" />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold text-ink">B. Customer</h2>
        <p className="mb-4 text-sm text-ink-muted">
          From Customer Management. These details are refreshed while the PI is a draft and frozen when it is issued.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="font-semibold text-ink">{props.customerName}</p>
            <p className="text-sm text-ink-muted">{snapshot.customerCode}</p>
            {addressText(snapshot) && <p className="mt-1 text-sm text-ink-muted">{addressText(snapshot)}</p>}
            {(snapshot.gstin || snapshot.pan) && (
              <p className="mt-1 text-sm text-ink-muted">{[snapshot.gstin && `GSTIN ${snapshot.gstin}`, snapshot.pan && `PAN ${snapshot.pan}`].filter(Boolean).join(' · ')}</p>
            )}
            {!snapshot.billingAddress && <p className="mt-1 text-sm text-warning">No default billing address on the customer record.</p>}
          </div>
          <SelectField
            label="Contact Person"
            value={values.contactId}
            onChange={(v) => set('contactId', v)}
            placeholder="Primary contact"
            options={props.contacts.map((c) => ({ value: c.id, label: c.designation ? `${c.name} (${c.designation})` : c.name }))}
          />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold text-ink">C. Products and commercial summary</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Copied exactly from the accepted quotation revision. Quantities, prices, discounts and tax cannot be changed on a proforma invoice; a
          commercial change needs a new quotation the customer accepts.
        </p>
        <ProformaLines items={props.items} totals={props.totals} currency={props.currency} advanceAmount={MONEY.test(values.advanceAmount.trim()) ? values.advanceAmount.trim() : null} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">D. Payment information</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TextField
            label={`Advance Amount (${props.currency})`}
            value={values.advanceAmount}
            onChange={(v) => set('advanceAmount', v)}
            error={errors.advanceAmount}
            inputMode="decimal"
            hint={`Optional. Up to ${formatMoney(props.totals.grandTotal, props.currency)}. No percentage is assumed.`}
          />
          <TextField label="Bank Name" value={values.bankDetails.bankName ?? ''} onChange={(v) => setBank('bankName', v)} maxLength={150} />
          <TextField label="Account Name" value={values.bankDetails.accountName ?? ''} onChange={(v) => setBank('accountName', v)} maxLength={150} />
          <TextField label="Account Number" value={values.bankDetails.accountNumber ?? ''} onChange={(v) => setBank('accountNumber', v)} maxLength={40} />
          <TextField label="IFSC" value={values.bankDetails.ifsc ?? ''} onChange={(v) => setBank('ifsc', v)} error={errors['bank.ifsc']} maxLength={11} />
          <TextField label="SWIFT / BIC" value={values.bankDetails.swift ?? ''} onChange={(v) => setBank('swift', v)} error={errors['bank.swift']} maxLength={11} />
          <TextField label="Branch" value={values.bankDetails.branch ?? ''} onChange={(v) => setBank('branch', v)} maxLength={200} className="md:col-span-3" />
        </div>
        <p className="field-hint mt-2">
          Pre-filled from Settings → Proforma Invoice. Leave blank to print no bank details. Nothing here is ever filled in automatically from elsewhere.
        </p>
        <div className="mt-4">{area('paymentInstructions', 'Payment Instructions', 3)}</div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">E. Terms and notes</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {area('paymentTerms', 'Payment Terms')}
          {area('deliveryTerms', 'Delivery Terms')}
          {area('warrantyTerms', 'Warranty Terms')}
          {area('notes', 'Notes')}
        </div>
        <div className="mt-4">{area('termsAndConditions', 'Terms and Conditions', 5, 'Copied from the accepted quotation. Printed on the PI.')}</div>
        <div className="mt-4">{area('internalRemarks', 'Internal Remarks', 2, 'Not printed on the PI.')}</div>
      </section>

      <ResultAlert result={result} />
      {result.existingId && (
        <p className="text-sm">
          <Link href={`/proforma-invoices/${result.existingId}`} className="font-medium text-accent hover:underline">Open the existing proforma invoice</Link>
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <p className="text-sm text-ink-muted">
          {props.mode === 'create' ? 'Saved as a draft.' : 'Only drafts can be edited.'}{' '}
          {props.approvalRequired ? 'It must be approved before it can be issued.' : 'Issue it from the PI page when ready.'}
        </p>
        <div className="flex gap-3">
          <Link href={props.mode === 'edit' ? `/proforma-invoices/${props.proformaId}` : '/proforma-invoices/new'} className="btn-secondary">Cancel</Link>
          <button type="submit" className={clsx('btn-primary px-5')} disabled={pending}>
            {pending ? 'Saving...' : props.mode === 'create' ? 'Create Proforma Invoice' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
