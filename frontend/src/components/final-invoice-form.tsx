'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ResultAlert, SelectField, TextField } from './client-ui';
import { ProformaLines } from './proforma-lines';
import { createFinalInvoiceAction, updateFinalInvoiceAction, type FinalInvoiceDetailsPayload } from '@/lib/final-invoice-actions';
import { asLineItems } from '@/lib/final-invoice-labels';
import { formatDate } from '@/lib/vendor-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { EnquiryAssignee, FinalInvoiceItem, ProformaBankDetails, ProformaTotals, QuotationCustomerSnapshot } from '@/lib/types';

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SWIFT = /^([A-Z0-9]{8}|[A-Z0-9]{11})$/;

export interface FinalInvoiceFormProps {
  mode: 'create' | 'edit';
  /** create: the issued PI to bill; edit: the draft invoice being edited. */
  proformaInvoiceId?: string;
  invoiceId?: string;
  proformaRef: { piNumber: string; piDate: string; quotationNumber: string; revisionNumber: number; enquiryNumber: string | null };
  customerName: string;
  customerSnapshot: QuotationCustomerSnapshot;
  contacts: Array<{ id: string; name: string; designation: string | null }>;
  assignees: EnquiryAssignee[];
  currency: string;
  items: FinalInvoiceItem[];
  totals: ProformaTotals;
  initial: FinalInvoiceDetailsPayload;
  /** A cancelled invoice this one will replace (create only). */
  replaces?: { id: string; invoiceNumber: string | null } | null;
  approvalRequired: boolean;
}

const addressText = (snapshot: QuotationCustomerSnapshot) => {
  const a = snapshot.billingAddress;
  return a ? [a.addressLine1, a.addressLine2, [a.city, a.state, a.postalCode].filter(Boolean).join(', '), a.country].filter(Boolean).join(', ') : '';
};

/** Invoice-specific details only: lines and every amount come from the proforma invoice. */
export function FinalInvoiceForm(props: FinalInvoiceFormProps) {
  const [values, setValues] = useState<FinalInvoiceDetailsPayload>(props.initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult & { existingId?: string }>({});
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof FinalInvoiceDetailsPayload>(key: K, value: FinalInvoiceDetailsPayload[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };
  const setBank = (key: keyof ProformaBankDetails, value: string) => {
    setValues((v) => ({ ...v, bankDetails: { ...v.bankDetails, [key]: value } }));
    setErrors(({ [`bank.${key}`]: _drop, ...rest }) => rest);
  };

  const validate = () => {
    const found: Record<string, string> = {};
    if (!values.invoiceDate) found.invoiceDate = 'Invoice date is required.';
    if (values.dueDate && values.invoiceDate && values.dueDate < values.invoiceDate) found.dueDate = 'The due date cannot be before the invoice date.';
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
      const outcome = props.mode === 'create' ? await createFinalInvoiceAction(props.proformaInvoiceId!, payload) : await updateFinalInvoiceAction(props.invoiceId!, payload);
      // Success redirects; only failures come back here.
      if (outcome) setResult(outcome);
    });
  };

  const area = (key: keyof FinalInvoiceDetailsPayload, label: string, rows = 3, hint?: string) => (
    <div>
      <label htmlFor={`fi-${key}`} className="field-label">{label}</label>
      <textarea id={`fi-${key}`} rows={rows} maxLength={key === 'termsAndConditions' ? 8000 : 4000} value={values[key] as string} onChange={(e) => set(key, e.target.value as never)} className="field-input" />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );

  const snapshot = props.customerSnapshot;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {props.replaces && (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
          This invoice will replace the cancelled <strong>{props.replaces.invoiceNumber ?? 'draft invoice'}</strong>. Both stay on record and are linked.
        </div>
      )}

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">A. Basic information</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <span className="field-label">Invoice number</span>
            <p className="field-input flex items-center bg-surface-muted text-ink-muted">Allocated when issued</p>
            <p className="field-hint">Drafts have no number, so cancelled or deleted drafts leave no gaps in the series.</p>
          </div>
          <div>
            <span className="field-label">Proforma invoice</span>
            <p className="field-input flex items-center bg-surface-muted font-mono text-ink-muted">{props.proformaRef.piNumber}</p>
            <p className="field-hint">
              Dated {formatDate(props.proformaRef.piDate)} &middot; quotation {props.proformaRef.quotationNumber} revision {props.proformaRef.revisionNumber}
              {props.proformaRef.enquiryNumber ? ` · enquiry ${props.proformaRef.enquiryNumber}` : ''}
            </p>
          </div>
          <div>
            <span className="field-label">Currency</span>
            <p className="field-input flex items-center bg-surface-muted text-ink-muted">{props.currency}</p>
            <p className="field-hint">Fixed by the proforma invoice.</p>
          </div>
          <TextField label="Invoice Date" type="date" required value={values.invoiceDate} onChange={(v) => set('invoiceDate', v)} error={errors.invoiceDate} />
          <TextField label="Due Date" type="date" value={values.dueDate} onChange={(v) => set('dueDate', v)} error={errors.dueDate} hint="Optional. Enter only if agreed with the customer." />
          <SelectField label="Assigned To" value={values.assignedToId} onChange={(v) => set('assignedToId', v)} placeholder="Unassigned" options={props.assignees.map((a) => ({ value: a.id, label: a.fullName }))} />
          <TextField label="Subject" value={values.subject} onChange={(v) => set('subject', v)} maxLength={300} className="md:col-span-2" />
          <TextField label="Customer PO No." value={values.purchaseOrderNumber} onChange={(v) => set('purchaseOrderNumber', v)} maxLength={100} hint="The customer's purchase order number" />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-lg font-semibold text-ink">B. Customer</h2>
        <p className="mb-4 text-sm text-ink-muted">From Customer Management. These details are refreshed while the invoice is a draft and frozen when it is issued.</p>
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
        <h2 className="mb-1 text-lg font-semibold text-ink">C. Products and amounts</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Copied exactly from proforma invoice {props.proformaRef.piNumber}. Quantities, prices, discounts and tax cannot be changed on the invoice.
        </p>
        <ProformaLines items={asLineItems(props.items)} totals={props.totals} currency={props.currency} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">D. Payment information</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <TextField label="Bank Name" value={values.bankDetails.bankName ?? ''} onChange={(v) => setBank('bankName', v)} maxLength={150} />
          <TextField label="Account Name" value={values.bankDetails.accountName ?? ''} onChange={(v) => setBank('accountName', v)} maxLength={150} />
          <TextField label="Account Number" value={values.bankDetails.accountNumber ?? ''} onChange={(v) => setBank('accountNumber', v)} maxLength={40} />
          <TextField label="IFSC" value={values.bankDetails.ifsc ?? ''} onChange={(v) => setBank('ifsc', v)} error={errors['bank.ifsc']} maxLength={11} />
          <TextField label="SWIFT / BIC" value={values.bankDetails.swift ?? ''} onChange={(v) => setBank('swift', v)} error={errors['bank.swift']} maxLength={11} />
          <TextField label="Branch" value={values.bankDetails.branch ?? ''} onChange={(v) => setBank('branch', v)} maxLength={200} />
        </div>
        <p className="field-hint mt-2">Pre-filled from the proforma invoice. Leave blank to print no bank details.</p>
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
        <div className="mt-4">{area('termsAndConditions', 'Terms and Conditions', 5, 'Copied from the proforma invoice. Printed on the invoice.')}</div>
        <div className="mt-4">{area('internalRemarks', 'Internal Remarks', 2, 'Not printed on the invoice.')}</div>
      </section>

      <ResultAlert result={result} />
      {result.existingId && (
        <p className="text-sm">
          <Link href={`/final-invoices/${result.existingId}`} className="link-pill font-medium">Open the existing invoice</Link>
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <p className="text-sm text-ink-muted">
          {props.mode === 'create' ? 'Saved as a draft without a number.' : 'Only drafts can be edited.'}{' '}
          {props.approvalRequired ? 'It must be approved before it can be issued.' : 'Issue it from the invoice page when ready; the number is allocated then.'}
        </p>
        <div className="flex gap-3">
          <Link href={props.mode === 'edit' ? `/final-invoices/${props.invoiceId}` : '/final-invoices/new'} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary px-5" disabled={pending}>
            {pending ? 'Saving...' : props.mode === 'create' ? 'Create Draft Invoice' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
