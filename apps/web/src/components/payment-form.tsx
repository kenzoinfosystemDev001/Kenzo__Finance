'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { ResultAlert, SelectField, TextField } from '@/components/client-ui';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { PaymentStateBadge, PaymentStatusBadge } from '@/components/payment-badges';
import { Pill } from '@/components/enquiry-badges';
import { IconChevronLeft, IconPhone, IconMail, IconUser } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { createPaymentAction, eligibleInvoicesAction, updatePaymentAction, type PaymentActionResult, type PaymentFieldsPayload } from '@/lib/payment-actions';
import { formatMoney } from '@/lib/quotation-labels';
import { formatDate, formatPhone } from '@/lib/vendor-labels';
import type { EligiblePaymentInvoice, EnquiryAssignee, PaymentMethodOption } from '@/lib/types';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const cents = (value: string) => Math.round(Number(value) * 100);

export interface PaymentCustomer {
  id: string;
  name: string;
  customerCode: string;
  contacts: Array<{ name: string; phone: string | null; email: string | null }>;
}

type FieldErrors = Partial<Record<keyof PaymentFieldsPayload, string>>;

/** Shared payment fields with client-side checks (the API re-validates everything). */
function PaymentFields({
  values,
  setValue,
  errors,
  methods,
  assignees,
  today,
  currency,
  available,
}: {
  values: PaymentFieldsPayload;
  setValue: (key: keyof PaymentFieldsPayload, value: string) => void;
  errors: FieldErrors;
  methods: PaymentMethodOption[];
  assignees: Array<{ id: string; fullName: string }>;
  today: string;
  currency: string;
  available?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField label="Payment date" type="date" required value={values.paymentDate} onChange={(v) => setValue('paymentDate', v)} error={errors.paymentDate} hint="Today or earlier." />
      <div>
        <TextField
          label={`Amount (${currency})`}
          required
          inputMode="decimal"
          value={values.amount}
          onChange={(v) => setValue('amount', v)}
          error={errors.amount}
          hint={available !== undefined ? `At most ${formatMoney(available, currency)} (outstanding less payments awaiting verification).` : 'Up to 2 decimals. The API checks it against the invoice balance.'}
        />
        {available !== undefined && Number(available) > 0 && (
          <button type="button" className="mt-1 text-sm font-medium text-accent hover:underline" onClick={() => setValue('amount', available)}>
            Use the full available amount
          </button>
        )}
      </div>
      <SelectField
        label="Payment method"
        required
        value={values.method}
        onChange={(v) => setValue('method', v)}
        placeholder="Choose a method"
        options={methods.map((m) => ({ value: m.code, label: m.active ? m.label : `${m.label} (switched off)` }))}
      />
      <SelectField
        label="Received by"
        value={values.receivedById}
        onChange={(v) => setValue('receivedById', v)}
        placeholder="Me (the person recording it)"
        options={assignees.map((a) => ({ value: a.id, label: a.fullName }))}
      />
      <TextField label="Transaction reference" value={values.transactionReference} onChange={(v) => setValue('transactionReference', v)} maxLength={100} hint="UTR, cheque number, card approval code... Checked for duplicates." />
      <TextField label="Bank reference" value={values.bankReference} onChange={(v) => setValue('bankReference', v)} maxLength={100} />
      <div className="md:col-span-2">
        <label htmlFor="payment-notes" className="field-label">Notes</label>
        <textarea id="payment-notes" rows={3} maxLength={2000} value={values.notes} onChange={(e) => setValue('notes', e.target.value)} className="field-input" />
      </div>
      {errors.method && <p className="field-error md:col-span-2">{errors.method}</p>}
      {/* `today` limits the date picker; the API rejects future dates too. */}
      <input type="hidden" value={today} readOnly />
    </div>
  );
}

function validate(values: PaymentFieldsPayload, today: string, available?: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.paymentDate) errors.paymentDate = 'Enter the payment date.';
  else if (values.paymentDate > today) errors.paymentDate = 'The payment date cannot be in the future.';
  const amount = values.amount.trim();
  if (!amount) errors.amount = 'Enter the amount.';
  else if (!MONEY.test(amount)) errors.amount = 'Enter a number with up to 2 decimals.';
  else if (cents(amount) <= 0) errors.amount = 'The amount must be greater than zero.';
  else if (available !== undefined && cents(amount) > cents(available)) errors.amount = 'The amount is more than is available on this invoice.';
  if (!values.method) errors.method = 'Choose the payment method.';
  return errors;
}

function DuplicateWarning({ result, onConfirm, pending }: { result: PaymentActionResult; onConfirm: () => void; pending: boolean }) {
  if (!result.duplicates) return null;
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
      <p className="font-medium">{result.error}</p>
      {result.duplicates.length > 0 && (
        <ul className="space-y-1">
          {result.duplicates.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-ink">
              <Link href={`/payments/${d.id}`} target="_blank" className="font-mono font-semibold text-accent hover:underline">{d.receiptNumber}</Link>
              <span>{d.customer}</span>
              <span className="tabular-nums">{d.amount}</span>
              <PaymentStatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onConfirm} disabled={pending}>
          {pending ? 'Saving...' : 'It is a different payment: record anyway'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Record a payment: customer -> invoice -> details
// ---------------------------------------------------------------------------

export function RecordPaymentForm({
  methods,
  assignees,
  today,
  initialCustomer,
  initialInvoiceId,
}: {
  methods: PaymentMethodOption[];
  assignees: EnquiryAssignee[];
  today: string;
  initialCustomer: PaymentCustomer | null;
  initialInvoiceId: string | null;
}) {
  const [customer, setCustomer] = useState<PaymentCustomer | null>(initialCustomer);
  const [invoices, setInvoices] = useState<EligiblePaymentInvoice[] | null>(null);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(initialInvoiceId);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<PaymentActionResult>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState<PaymentFieldsPayload>({
    paymentDate: today,
    amount: '',
    method: methods.length === 1 ? methods[0].code : '',
    transactionReference: '',
    bankReference: '',
    receivedById: '',
    notes: '',
    confirmDuplicateReference: false,
  });
  const lookup = useRef(new Map<string, PaymentCustomer>());

  const customerSearch = useCallback(async (term: string): Promise<SearchOption[]> => {
    const found = await searchCustomersAction(term);
    for (const c of found) lookup.current.set(c.id, { id: c.id, name: c.name, customerCode: c.customerCode, contacts: c.contacts });
    return found.map((c) => ({ id: c.id, label: c.name, detail: `${c.customerCode}${c.contacts[0] ? ` · ${c.contacts[0].name}` : ''}` }));
  }, []);

  useEffect(() => {
    if (!customer) {
      setInvoices(null);
      return;
    }
    startLoading(async () => {
      const outcome = await eligibleInvoicesAction(customer.id);
      setInvoices(outcome.invoices ?? []);
      setInvoiceError(outcome.error ?? '');
      setInvoiceId((current) => (current && outcome.invoices?.some((i) => i.id === current) ? current : outcome.invoices?.length === 1 ? outcome.invoices[0].id : null));
    });
  }, [customer]);

  const invoice = invoices?.find((i) => i.id === invoiceId) ?? null;
  const setValue = (key: keyof PaymentFieldsPayload, value: string) => {
    setValues((v) => ({ ...v, [key]: value, ...(key === 'transactionReference' ? { confirmDuplicateReference: false } : {}) }));
    setResult({});
  };

  const submit = (confirmDuplicate: boolean) => {
    if (!customer || !invoice) return;
    const found = validate(values, today, invoice.available);
    setErrors(found);
    if (Object.keys(found).length) return;
    startSaving(async () => {
      const outcome = await createPaymentAction(customer.id, invoice.id, invoice.currency, { ...values, confirmDuplicateReference: confirmDuplicate });
      if (outcome) setResult(outcome);
    });
  };

  return (
    <div className="space-y-5">
      <section className="card">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">1. Customer</h2>
          <p className="text-sm text-ink-muted">Search by name, customer code, phone or GSTIN.</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="max-w-md">
            <SearchSelect
              label="Customer"
              hideLabel
              placeholder="Search customers"
              search={customerSearch}
              selected={customer ? [{ id: customer.id, label: customer.name, detail: customer.customerCode }] : []}
              onChange={(next) => {
                const picked = next[0];
                setCustomer(picked ? lookup.current.get(picked.id) ?? { id: picked.id, name: picked.label, customerCode: picked.detail ?? '', contacts: [] } : null);
                setInvoiceId(null);
                setResult({});
              }}
              emptyText="No active customers found"
            />
          </div>
          {customer && (
            <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm">
              <p className="font-semibold text-ink">
                {customer.name} <span className="font-mono text-xs font-normal text-ink-subtle">{customer.customerCode}</span>
              </p>
              {customer.contacts.length === 0 ? (
                <p className="mt-1 text-ink-subtle">No contact person recorded.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-ink-muted">
                  {customer.contacts.slice(0, 3).map((c, i) => (
                    <li key={`${c.name}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                      <span className="inline-flex items-center gap-1"><IconUser size={14} /> {c.name}</span>
                      {c.phone && <span className="inline-flex items-center gap-1"><IconPhone size={14} /> {formatPhone(c.phone)}</span>}
                      {c.email && <span className="inline-flex items-center gap-1"><IconMail size={14} /> {c.email}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {customer && (
        <section className="card" aria-busy={loading}>
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">2. Invoice</h2>
            <p className="text-sm text-ink-muted">Issued or sent final invoices of {customer.name} that still have a balance. A payment settles one invoice, in its currency.</p>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Loading invoices...</p>
          ) : invoiceError ? (
            <div className="p-5"><ResultAlert result={{ error: invoiceError }} /></div>
          ) : !invoices || invoices.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">This customer has no issued invoice with a balance to pay.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
                    <th scope="col">Invoice No.</th>
                    <th scope="col">Invoice Date</th>
                    <th scope="col">Due Date</th>
                    <th scope="col" className="text-right">Total</th>
                    <th scope="col" className="text-right">Received</th>
                    <th scope="col" className="text-right">Outstanding</th>
                    <th scope="col" className="text-right">Pending Verification</th>
                    <th scope="col" className="text-right">Available</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const selectable = Number(inv.available) > 0;
                    return (
                      <tr key={inv.id} className={clsx(invoiceId === inv.id && 'bg-accent-subtle/50', selectable && 'cursor-pointer')} onClick={() => selectable && setInvoiceId(inv.id)}>
                        <td>
                          <input
                            type="radio"
                            name="invoice"
                            aria-label={`Select ${inv.invoiceNumber ?? 'invoice'}`}
                            checked={invoiceId === inv.id}
                            disabled={!selectable}
                            onChange={() => setInvoiceId(inv.id)}
                            className="h-4 w-4 accent-[rgb(var(--accent))]"
                          />
                        </td>
                        <td className="whitespace-nowrap font-mono text-sm font-semibold">{inv.invoiceNumber}</td>
                        <td className="whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                        <td className={clsx('whitespace-nowrap', inv.overdue && 'font-semibold text-danger')}>
                          {inv.dueDate ? formatDate(inv.dueDate) : <span className="text-ink-subtle">&mdash;</span>}
                          {inv.overdue && <p className="text-xs font-normal">Overdue</p>}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.grandTotal, inv.currency)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.amountReceived, inv.currency)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.outstanding, inv.currency)}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(inv.pendingVerification, inv.currency)}</td>
                        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(inv.available, inv.currency)}</td>
                        <td>
                          <PaymentStateBadge state={inv.paymentState} />
                          {!selectable && <p className="mt-1 text-xs text-ink-subtle">Fully covered by pending payments</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {customer && invoice && (
        <section className="card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">3. Payment details</h2>
            <p className="text-sm text-ink-muted">
              Against invoice <span className="font-mono font-semibold text-ink">{invoice.invoiceNumber}</span> in {invoice.currency}. The payment is recorded as Pending Verification unless its method is set to verify automatically.
            </p>
          </div>
          <form
            className="space-y-4 p-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <PaymentFields values={values} setValue={setValue} errors={errors} methods={methods} assignees={assignees} today={today} currency={invoice.currency} available={invoice.available} />
            {methods.length === 0 && <p className="text-sm text-danger">No payment method is switched on. An administrator must enable one in Settings.</p>}
            {result.duplicates ? <DuplicateWarning result={result} pending={saving} onConfirm={() => submit(true)} /> : <ResultAlert result={result} />}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Link href="/payments" className="btn-secondary">Cancel</Link>
              <button type="submit" className="btn-primary" disabled={saving || methods.length === 0}>
                {saving ? 'Recording...' : 'Record payment'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit a payment pending verification (PATCH with the full field set)
// ---------------------------------------------------------------------------

export function EditPaymentForm({
  paymentId,
  receiptNumber,
  currency,
  methods,
  assignees,
  today,
  initial,
  invoiceNumber,
}: {
  paymentId: string;
  receiptNumber: string;
  currency: string;
  methods: PaymentMethodOption[];
  assignees: Array<{ id: string; fullName: string }>;
  today: string;
  initial: Omit<PaymentFieldsPayload, 'confirmDuplicateReference'>;
  invoiceNumber: string | null;
}) {
  const [values, setValues] = useState<PaymentFieldsPayload>({ ...initial, confirmDuplicateReference: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<PaymentActionResult>({});
  const [saving, startSaving] = useTransition();

  const setValue = (key: keyof PaymentFieldsPayload, value: string) => {
    setValues((v) => ({ ...v, [key]: value, ...(key === 'transactionReference' ? { confirmDuplicateReference: false } : {}) }));
    setResult({});
  };

  const submit = (confirmDuplicate: boolean) => {
    const found = validate(values, today);
    setErrors(found);
    if (Object.keys(found).length) return;
    startSaving(async () => {
      const outcome = await updatePaymentAction(paymentId, { ...values, confirmDuplicateReference: confirmDuplicate });
      if (outcome) setResult(outcome);
    });
  };

  return (
    <form
      className="card space-y-4 p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
    >
      <p className="text-sm text-ink-muted">
        Receipt <span className="font-mono font-semibold text-ink">{receiptNumber}</span> against invoice{' '}
        <span className="font-mono font-semibold text-ink">{invoiceNumber}</span>. Only a payment pending verification can be edited; the new amount must still fit in the invoice balance.
      </p>
      <PaymentFields values={values} setValue={setValue} errors={errors} methods={methods} assignees={assignees} today={today} currency={currency} />
      {result.duplicates ? <DuplicateWarning result={result} pending={saving} onConfirm={() => submit(true)} /> : <ResultAlert result={result} />}
      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
        <Link href={`/payments/${paymentId}`} className="btn-secondary"><IconChevronLeft size={16} /> Back</Link>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      </div>
      <Pill tone="neutral">{currency}</Pill>
    </form>
  );
}
