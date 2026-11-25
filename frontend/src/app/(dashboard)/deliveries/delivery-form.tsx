'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import { ResultAlert, TextField } from '@/components/client-ui';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { InvoiceDeliveryStateBadge } from '@/components/delivery-badges';
import { IconChevronLeft } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import {
  createDeliveryAction,
  deliveryCustomerInfoAction,
  deliveryInvoiceItemsAction,
  eligibleDeliveryInvoicesAction,
  updateDeliveryAction,
  type DeliveryCustomerInfo,
  type DeliveryHeaderPayload,
  type DeliveryItemPayload,
} from '@/lib/delivery-actions';
import { formatDate } from '@/lib/vendor-labels';
import type { ActionResult } from '@/lib/vendor-actions';
import type { DeliveryInvoiceItem, EligibleDeliveryInvoice, QuotationAddressSnapshot } from '@/lib/types';

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

interface LineDraft {
  quantity: string;
  packageCount: string;
  remarks: string;
}

const EMPTY_LINE: LineDraft = { quantity: '', packageCount: '', remarks: '' };

/** Item picker: one row per invoice line with the quantity still available to this delivery. */
function ItemsTable({
  items,
  maxOf,
  lines,
  setLine,
  readOnly = false,
}: {
  items: DeliveryInvoiceItem[];
  maxOf: (item: DeliveryInvoiceItem) => number;
  lines: Record<string, LineDraft>;
  setLine: (invoiceItemId: string, change: Partial<LineDraft>) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="text-right">Invoiced</th>
            <th scope="col" className="text-right">Confirmed delivered</th>
            <th scope="col" className="text-right">Available</th>
            <th scope="col" className="w-32">Quantity</th>
            <th scope="col" className="w-28">Packages</th>
            <th scope="col">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const max = maxOf(item);
            const line = lines[item.invoiceItemId] ?? { quantity: '', packageCount: '', remarks: '' };
            const qty = Number(line.quantity);
            const over = line.quantity !== '' && (!Number.isInteger(qty) || qty < 0 || qty > max);
            return (
              <tr key={item.invoiceItemId} className={clsx(max === 0 && !line.quantity && 'opacity-60')}>
                <td>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-ink-subtle">{[item.brandName, item.modelName, item.modelNumber].filter(Boolean).join(' · ')}</p>
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">{item.invoicedQuantity} {item.unit}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{item.confirmedDeliveredQuantity}</td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums">{max}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step={1}
                    inputMode="numeric"
                    disabled={readOnly || (max === 0 && !line.quantity)}
                    aria-label={`Quantity of ${item.productName}`}
                    aria-invalid={over}
                    value={line.quantity}
                    placeholder="0"
                    onChange={(e) => setLine(item.invoiceItemId, { quantity: e.target.value })}
                    className={clsx('field-input', over && 'border-danger')}
                  />
                  {over && <p className="field-error">At most {max}</p>}
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    disabled={readOnly || !line.quantity || line.quantity === '0'}
                    aria-label={`Package count of ${item.productName}`}
                    value={line.packageCount}
                    onChange={(e) => setLine(item.invoiceItemId, { packageCount: e.target.value })}
                    className="field-input"
                  />
                </td>
                <td>
                  <input
                    maxLength={2000}
                    disabled={readOnly || !line.quantity || line.quantity === '0'}
                    aria-label={`Remarks for ${item.productName}`}
                    value={line.remarks}
                    onChange={(e) => setLine(item.invoiceItemId, { remarks: e.target.value })}
                    className="field-input"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Validates the lines and returns the payload, or an error. */
function collectLines(items: DeliveryInvoiceItem[], lines: Record<string, LineDraft>, maxOf: (i: DeliveryInvoiceItem) => number): { items?: DeliveryItemPayload[]; error?: string } {
  const out: DeliveryItemPayload[] = [];
  for (const item of items) {
    const line = lines[item.invoiceItemId];
    const raw = line?.quantity.trim() ?? '';
    if (!raw || raw === '0') continue;
    if (!/^\d+$/.test(raw)) return { error: `${item.productName}: enter a whole quantity.` };
    const qty = Number(raw);
    if (qty > maxOf(item)) return { error: `${item.productName}: ${qty} ${item.unit} exceeds the ${maxOf(item)} ${item.unit} available.` };
    if (line.packageCount.trim() && !/^[1-9]\d*$/.test(line.packageCount.trim())) return { error: `${item.productName}: the package count must be a whole number of 1 or more.` };
    out.push({ invoiceItemId: item.invoiceItemId, quantity: qty, packageCount: line.packageCount, remarks: line.remarks });
  }
  if (out.length === 0) return { error: 'Enter a quantity for at least one item.' };
  return { items: out };
}

function HeaderFields({
  values,
  set,
  today,
  addressOptions,
  contacts,
  dateHint,
}: {
  dateHint?: string;
  values: DeliveryHeaderPayload;
  set: (key: keyof DeliveryHeaderPayload, value: string) => void;
  today: string;
  addressOptions: Array<{ key: string; label: string; text: string }>;
  contacts: Array<{ name: string; phone: string | null }>;
}) {
  const addressId = useId();
  const remarksId = useId();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Delivery date" type="date" value={values.deliveryDate} onChange={(v) => set('deliveryDate', v)} hint={dateHint ?? `Leave blank to use today's date (${formatDate(today)}).`} />
        <TextField label="Expected delivery date" type="date" value={values.expectedDate} onChange={(v) => set('expectedDate', v)} hint="Not before the delivery date. Used to flag delays." />
      </div>
      <div>
        <label htmlFor={addressId} className="field-label">Delivery address<span className="text-danger"> *</span></label>
        {addressOptions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {addressOptions.map((a) => (
              <button key={a.key} type="button" className={clsx('chip capitalize', values.deliveryAddress === a.text && 'border-accent text-accent')} onClick={() => set('deliveryAddress', a.text)} title={a.text}>
                Use {a.label}
              </button>
            ))}
          </div>
        )}
        <textarea id={addressId} rows={4} maxLength={2000} value={values.deliveryAddress} onChange={(e) => set('deliveryAddress', e.target.value)} className="field-input" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <TextField label="Contact person" maxLength={200} value={values.contactPerson} onChange={(v) => set('contactPerson', v)} />
          {contacts.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {contacts.slice(0, 4).map((c, i) => (
                <button
                  key={`${c.name}-${i}`}
                  type="button"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={() => {
                    set('contactPerson', c.name);
                    if (c.phone) set('contactNumber', c.phone);
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <TextField label="Contact number" maxLength={50} value={values.contactNumber} onChange={(v) => set('contactNumber', v)} />
      </div>
      <div>
        <label htmlFor={remarksId} className="field-label">Notes / internal remarks</label>
        <textarea id={remarksId} rows={2} maxLength={2000} value={values.internalRemarks} onChange={(e) => set('internalRemarks', e.target.value)} className="field-input" />
      </div>
    </div>
  );
}

function headerProblem(h: DeliveryHeaderPayload): string | null {
  if (!h.deliveryAddress.trim()) return 'Delivery address is required.';
  if (h.expectedDate && h.deliveryDate && h.expectedDate < h.deliveryDate) return 'The expected delivery date cannot be before the delivery date.';
  return null;
}

const snapshotText = (a: QuotationAddressSnapshot | null | undefined) =>
  a ? [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(', ') + (a.postalCode ? ` - ${a.postalCode}` : ''), a.country].filter((l) => l && l.trim()).join('\n') : '';

// ---------------------------------------------------------------------------
// Create: customer -> invoice -> items -> details
// ---------------------------------------------------------------------------

export interface RedeliveryPrefill {
  id: string;
  deliveryNumber: string;
  deliveryAddress: string;
  contactPerson: string | null;
  contactNumber: string | null;
  quantities: Record<string, number>;
}

export function CreateDeliveryForm({
  today,
  initialCustomer,
  initialInvoiceId,
  redelivery,
  canReadCustomers,
}: {
  today: string;
  initialCustomer: SearchOption | null;
  initialInvoiceId: string | null;
  redelivery: RedeliveryPrefill | null;
  canReadCustomers: boolean;
}) {
  const [customer, setCustomer] = useState<SearchOption | null>(initialCustomer);
  const [invoices, setInvoices] = useState<EligibleDeliveryInvoice[] | null>(null);
  const [invoiceError, setInvoiceError] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(initialInvoiceId);
  const [items, setItems] = useState<DeliveryInvoiceItem[] | null>(null);
  const [itemsError, setItemsError] = useState('');
  const [info, setInfo] = useState<DeliveryCustomerInfo | null>(null);
  const [infoError, setInfoError] = useState('');
  const [lines, setLines] = useState<Record<string, LineDraft>>({});
  const [header, setHeader] = useState<DeliveryHeaderPayload>({
    deliveryDate: '',
    expectedDate: '',
    deliveryAddress: redelivery?.deliveryAddress ?? '',
    contactPerson: redelivery?.contactPerson ?? '',
    contactNumber: redelivery?.contactNumber ?? '',
    internalRemarks: '',
  });
  const [loadingInvoices, startInvoices] = useTransition();
  const [loadingItems, startItems] = useTransition();
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const firstLoad = useRef(true);

  const customerSearch = useCallback(async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })), []);

  useEffect(() => {
    if (!customer) {
      setInvoices(null);
      setInfo(null);
      return;
    }
    startInvoices(async () => {
      const outcome = await eligibleDeliveryInvoicesAction(customer.id);
      setInvoices(outcome.invoices ?? []);
      setInvoiceError(outcome.error ?? '');
      setInvoiceId((current) => (current && outcome.invoices?.some((i) => i.id === current) ? current : outcome.invoices?.length === 1 ? outcome.invoices[0].id : null));
    });
    if (canReadCustomers) {
      deliveryCustomerInfoAction(customer.id).then((r) => {
        setInfo(r.info ?? null);
        setInfoError(r.error ?? '');
      });
    }
  }, [customer, canReadCustomers]);

  useEffect(() => {
    if (!invoiceId) {
      setItems(null);
      return;
    }
    startItems(async () => {
      const outcome = await deliveryInvoiceItemsAction(invoiceId);
      setItems(outcome.items ?? []);
      setItemsError(outcome.error ?? '');
      // Prefill the returned delivery's quantities once (capped at what is available now).
      if (firstLoad.current && redelivery && outcome.items) {
        setLines(Object.fromEntries(outcome.items.map((i) => [i.invoiceItemId, { quantity: redelivery.quantities[i.invoiceItemId] ? String(Math.min(redelivery.quantities[i.invoiceItemId], i.remainingQuantity)) : '', packageCount: '', remarks: '' }])));
      } else {
        setLines({});
      }
      firstLoad.current = false;
    });
  }, [invoiceId, redelivery]);

  const invoice = invoices?.find((i) => i.id === invoiceId) ?? null;
  const setLine = (key: string, change: Partial<LineDraft>) => {
    setLines((l) => ({ ...l, [key]: { ...EMPTY_LINE, ...l[key], ...change } }));
    setResult({});
  };
  const setHeaderValue = (key: keyof DeliveryHeaderPayload, value: string) => {
    setHeader((h) => ({ ...h, [key]: value }));
    setResult({});
  };
  const maxOf = (i: DeliveryInvoiceItem) => i.remainingQuantity;

  const addressOptions = [
    ...(invoice?.customerSnapshot?.shippingAddress ? [{ key: 'inv-ship', label: 'invoice shipping address', text: snapshotText(invoice.customerSnapshot.shippingAddress) }] : []),
    ...(invoice?.customerSnapshot?.billingAddress ? [{ key: 'inv-bill', label: 'invoice billing address', text: snapshotText(invoice.customerSnapshot.billingAddress) }] : []),
    ...(info?.addresses ?? []).map((a) => ({ key: a.id, label: `${a.label} address`, text: a.text })),
  ].filter((a, idx, all) => a.text && all.findIndex((b) => b.text === a.text) === idx);

  // Prefill the address once an invoice is chosen (shipping address first), unless one was entered.
  useEffect(() => {
    if (!header.deliveryAddress && addressOptions.length > 0) setHeader((h) => (h.deliveryAddress ? h : { ...h, deliveryAddress: addressOptions[0].text }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, info]);

  const contacts = [
    ...(invoice?.customerSnapshot?.contactName ? [{ name: invoice.customerSnapshot.contactName, phone: invoice.customerSnapshot.phone }] : []),
    ...(info?.contacts ?? []),
  ].filter((c, idx, all) => all.findIndex((b) => b.name === c.name) === idx);

  const submit = () => {
    if (!customer || !invoice || !items) return;
    const collected = collectLines(items, lines, maxOf);
    if (collected.error) return setResult({ error: collected.error });
    const problem = headerProblem(header);
    if (problem) return setResult({ error: problem });
    startSaving(async () => {
      const outcome = await createDeliveryAction({ customerId: customer.id, finalInvoiceId: invoice.id, redeliveryOfId: redelivery?.id ?? null, header, items: collected.items! });
      if (outcome) setResult(outcome);
    });
  };

  return (
    <div className="space-y-5">
      {redelivery && (
        <p role="status" className="rounded-lg border border-accent/30 bg-accent-subtle px-4 py-2.5 text-sm text-accent">
          Redelivery of returned delivery <Link href={`/deliveries/${redelivery.id}`} className="font-mono font-semibold underline">{redelivery.deliveryNumber}</Link>. Its quantities and address are prefilled; change them as needed.
        </p>
      )}
      <section className="card">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">1. Customer</h2>
          <p className="text-sm text-ink-muted">Search by name, customer code, phone or GSTIN.</p>
        </div>
        <div className="max-w-md p-5">
          <SearchSelect
            label="Customer"
            hideLabel
            placeholder="Search customers"
            search={customerSearch}
            selected={customer ? [customer] : []}
            onChange={(next) => {
              if (redelivery) return;
              setCustomer(next[0] ?? null);
              setInvoiceId(null);
              setResult({});
            }}
            emptyText="No active customers found"
          />
          {redelivery && <p className="field-hint">A redelivery stays with the customer and invoice of the returned delivery.</p>}
        </div>
      </section>

      {customer && (
        <section className="card" aria-busy={loadingInvoices}>
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">2. Invoice</h2>
            <p className="text-sm text-ink-muted">Issued or sent final invoices of {customer.label} with quantity not yet on a delivery. Payment is not required to deliver.</p>
          </div>
          {loadingInvoices ? (
            <p className="p-5 text-sm text-ink-muted">Loading invoices...</p>
          ) : invoiceError ? (
            <div className="p-5"><ResultAlert result={{ error: invoiceError }} /></div>
          ) : !invoices || invoices.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">This customer has no issued invoice with quantity left to deliver.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
                    <th scope="col">Invoice No.</th>
                    <th scope="col">Invoice Date</th>
                    <th scope="col" className="text-right">Invoiced qty</th>
                    <th scope="col" className="text-right">On deliveries</th>
                    <th scope="col" className="text-right">Confirmed delivered</th>
                    <th scope="col" className="text-right">Left to deliver</th>
                    <th scope="col">Delivery state</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={clsx('cursor-pointer', invoiceId === inv.id && 'bg-accent-subtle/50')}
                      onClick={() => !redelivery && setInvoiceId(inv.id)}
                    >
                      <td>
                        <input type="radio" name="invoice" aria-label={`Select ${inv.invoiceNumber ?? 'invoice'}`} checked={invoiceId === inv.id} disabled={Boolean(redelivery) && invoiceId !== inv.id} onChange={() => setInvoiceId(inv.id)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                      </td>
                      <td className="whitespace-nowrap font-mono text-sm font-semibold">{inv.invoiceNumber}</td>
                      <td className="whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                      <td className="text-right tabular-nums">{inv.invoicedQuantity}</td>
                      <td className="text-right tabular-nums">{inv.allocatedQuantity}</td>
                      <td className="text-right tabular-nums">{inv.deliveredQuantity}</td>
                      <td className="text-right font-semibold tabular-nums">{inv.remainingQuantity}</td>
                      <td><InvoiceDeliveryStateBadge state={inv.deliveryState} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {invoiceId && invoices && !invoices.some((i) => i.id === invoiceId) && !loadingInvoices && (
            <p className="px-5 pb-4 text-sm text-warning">The requested invoice is not deliverable for this customer (not issued, or nothing left to deliver).</p>
          )}
        </section>
      )}

      {customer && invoice && (
        <section className="card" aria-busy={loadingItems}>
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">3. Items</h2>
            <p className="text-sm text-ink-muted">Quantities for this delivery. Available = invoiced less what other open deliveries already hold. The API re-checks under a lock, so two users cannot take the same quantity.</p>
          </div>
          {loadingItems ? (
            <p className="p-5 text-sm text-ink-muted">Loading items...</p>
          ) : itemsError ? (
            <div className="p-5"><ResultAlert result={{ error: itemsError }} /></div>
          ) : items && items.length > 0 ? (
            <>
              <ItemsTable items={items} maxOf={maxOf} lines={lines} setLine={setLine} />
              <div className="flex justify-end border-t border-border px-5 py-3">
                <button
                  type="button"
                  className="text-sm font-medium text-accent hover:underline"
                  onClick={() => setLines(Object.fromEntries(items.map((i) => [i.invoiceItemId, { quantity: i.remainingQuantity > 0 ? String(i.remainingQuantity) : '', packageCount: lines[i.invoiceItemId]?.packageCount ?? '', remarks: lines[i.invoiceItemId]?.remarks ?? '' }])))}
                >
                  Deliver everything available
                </button>
              </div>
            </>
          ) : (
            <p className="p-5 text-sm text-ink-muted">This invoice has no items.</p>
          )}
        </section>
      )}

      {customer && invoice && items && items.length > 0 && (
        <section className="card">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-lg font-semibold text-ink">4. Delivery details</h2>
            <p className="text-sm text-ink-muted">The delivery is saved as a draft; schedule and dispatch it from its profile.</p>
          </div>
          <form
            className="space-y-4 p-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <HeaderFields values={header} set={setHeaderValue} today={today} addressOptions={addressOptions} contacts={contacts} />
            {infoError && <p className="text-xs text-warning">The customer&apos;s saved addresses could not be loaded ({infoError}); the invoice addresses are still offered.</p>}
            <ResultAlert result={result} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Link href="/deliveries" className="btn-secondary">Cancel</Link>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create delivery'}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit (DRAFT / SCHEDULED / READY_FOR_DISPATCH, before dispatch documents)
// ---------------------------------------------------------------------------

export function EditDeliveryForm({
  deliveryId,
  deliveryNumber,
  today,
  initial,
  positions,
  current,
  canEditItems,
  hasPackages,
}: {
  deliveryId: string;
  deliveryNumber: string;
  today: string;
  initial: DeliveryHeaderPayload;
  positions: DeliveryInvoiceItem[];
  /** invoiceItemId -> the line currently on this delivery. */
  current: Record<string, { quantity: number; packageCount: number | null; remarks: string | null }>;
  canEditItems: boolean;
  hasPackages: boolean;
}) {
  const [header, setHeader] = useState<DeliveryHeaderPayload>(initial);
  const [lines, setLines] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(Object.entries(current).map(([k, v]) => [k, { quantity: String(v.quantity), packageCount: v.packageCount ? String(v.packageCount) : '', remarks: v.remarks ?? '' }])),
  );
  const [itemsChanged, setItemsChanged] = useState(false);
  const [result, setResult] = useState<ActionResult>({});
  const [saving, startSaving] = useTransition();

  // positions[].remainingQuantity excludes this delivery's own reservation, so add it back.
  const maxOf = (i: DeliveryInvoiceItem) => Math.max(i.remainingQuantity, 0) + (current[i.invoiceItemId]?.quantity ?? 0);

  const submit = () => {
    const problem = headerProblem(header);
    if (problem) return setResult({ error: problem });
    let items: DeliveryItemPayload[] | null = null;
    if (itemsChanged) {
      const collected = collectLines(positions, lines, maxOf);
      if (collected.error) return setResult({ error: collected.error });
      items = collected.items!;
    }
    startSaving(async () => {
      const outcome = await updateDeliveryAction(deliveryId, header, items);
      if (outcome) setResult(outcome);
    });
  };

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <section className="card">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">Items</h2>
          <p className="text-sm text-ink-muted">
            {canEditItems
              ? `Available = what is left on the invoice plus what ${deliveryNumber} already holds.${hasPackages ? ' Changing items clears the packages; record them again afterwards.' : ''}`
              : 'Items can no longer be changed on this delivery.'}
          </p>
        </div>
        <ItemsTable
          items={positions}
          maxOf={maxOf}
          lines={lines}
          readOnly={!canEditItems}
          setLine={(key, change) => {
            setLines((l) => ({ ...l, [key]: { ...EMPTY_LINE, ...l[key], ...change } }));
            setItemsChanged(true);
            setResult({});
          }}
        />
      </section>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold text-ink">Delivery details</h2>
        <HeaderFields
          values={header}
          set={(k, v) => {
            setHeader((h) => ({ ...h, [k]: v }));
            setResult({});
          }}
          today={today}
          addressOptions={[]}
          contacts={[]}
          dateHint="The date this delivery was raised."
        />
        <ResultAlert result={result} />
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          <Link href={`/deliveries/${deliveryId}`} className="btn-secondary"><IconChevronLeft size={16} /> Back</Link>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </section>
    </form>
  );
}
