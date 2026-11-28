'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  createQuotationAction,
  updateQuotationDraftAction,
  type QuotationContentPayload,
  type QuotationHeaderPayload,
  type QuotationLinePayload,
} from '@/lib/quotation-actions';
import { getCustomerForEnquiryAction, searchCustomersAction } from '@/lib/enquiry-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import { calculateLine, calculateTotals, hundredthsToString, MONEY_PATTERN, RATE_PATTERN, type CalcLineResult } from '@/lib/quotation-calc';
import { DISCOUNT_TYPE_LABELS, formatAmount, formatRate } from '@/lib/quotation-labels';
import { CUSTOMER_TYPE_LABELS } from '@/lib/customer-labels';
import { formatPhone } from '@/lib/vendor-labels';
import type { DiscountType, EnquiryAssignee, EnquiryItem, QuotationEnquiryHandoff } from '@/lib/types';
import { ResultAlert, SelectField, TextField } from './client-ui';
import { SearchSelect, type SearchOption } from './search-select';
import { CustomerSummaryCard, emptyRequirement, RequirementFields, type CustomerCardData, type RequirementRow } from './enquiry-form';
import { IconArrowRight, IconPlus, IconTrash } from './icons';

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export interface QuotationLineRow {
  key: string;
  /** Brand -> product -> model picker state (shared with Enquiry Management). */
  req: RequirementRow;
  enquiryItemId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxLabel: string;
  taxRate: string;
  remarks: string;
}

export interface QuotationFormContent {
  quotationDate: string;
  validUntil: string;
  additionalDiscount: string;
  otherChargesLabel: string;
  otherCharges: string;
  termsAndConditions: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  notes: string;
  internalRemarks: string;
}

export interface QuotationFormInitial {
  header: QuotationHeaderPayload;
  content: QuotationFormContent;
  lines: QuotationLineRow[];
}

const emptyContent = (): QuotationFormContent => ({
  quotationDate: '',
  validUntil: '',
  additionalDiscount: '',
  otherChargesLabel: '',
  otherCharges: '',
  termsAndConditions: '',
  paymentTerms: '',
  deliveryTerms: '',
  warrantyTerms: '',
  notes: '',
  internalRemarks: '',
});

export const emptyLine = (): QuotationLineRow => ({
  key: emptyRequirement().key,
  req: emptyRequirement(),
  enquiryItemId: '',
  description: '',
  quantity: '',
  unit: 'Nos',
  unitPrice: '',
  discountType: 'NONE',
  discountValue: '',
  taxLabel: '',
  taxRate: '',
  remarks: '',
});

/** A line pre-filled from an enquiry requirement: product, model, quantity and unit. Prices stay empty. */
export function lineFromEnquiryItem(item: EnquiryItem): QuotationLineRow {
  const brand = { id: item.product.company.id, label: item.product.company.name };
  return {
    ...emptyLine(),
    req: {
      ...emptyRequirement(),
      brand: [brand],
      product: [{ id: item.product.id, label: item.product.name, detail: item.product.productCode, meta: brand }],
      productCode: item.product.productCode,
      productModelId: item.productModelId ?? '',
    },
    enquiryItemId: item.id,
    quantity: String(item.quantity),
    unit: item.unit,
  };
}

const LIMITS = {
  subject: 300,
  referenceNumber: 100,
  termsAndConditions: 8000,
  paymentTerms: 2000,
  deliveryTerms: 2000,
  warrantyTerms: 2000,
  notes: 4000,
  internalRemarks: 4000,
};

function validateLine(line: QuotationLineRow): Record<string, string> {
  const e: Record<string, string> = {};
  if (!line.req.product[0]) e.product = 'Select a product.';
  if (!/^\d+$/.test(line.quantity.trim()) || Number(line.quantity) < 1) e.quantity = 'Whole number of at least 1.';
  else if (Number(line.quantity) > 10_000_000) e.quantity = 'Quantity is too large.';
  if (line.unit.trim().length > 20) e.unit = 'At most 20 characters.';
  if (!line.unitPrice.trim()) e.unitPrice = 'Enter the unit price.';
  else if (!MONEY_PATTERN.test(line.unitPrice.trim())) e.unitPrice = 'A number with up to 2 decimals.';
  if (line.discountType !== 'NONE') {
    if (!line.discountValue.trim()) e.discountValue = 'Enter the discount.';
    else if (!MONEY_PATTERN.test(line.discountValue.trim())) e.discountValue = 'A number with up to 2 decimals.';
  }
  if (line.taxRate.trim() && !RATE_PATTERN.test(line.taxRate.trim())) e.taxRate = 'A percentage with up to 2 decimals.';
  if (line.taxLabel.trim().length > 40) e.taxLabel = 'At most 40 characters.';
  if (line.description.length > 4000) e.description = 'At most 4000 characters.';
  if (line.remarks.length > 1000) e.remarks = 'At most 1000 characters.';
  return e;
}

const toLinePayload = (line: QuotationLineRow): QuotationLinePayload => ({
  productId: line.req.product[0]?.id ?? '',
  productModelId: line.req.productModelId,
  enquiryItemId: line.enquiryItemId,
  description: line.description,
  quantity: line.quantity.trim(),
  unit: line.unit,
  unitPrice: line.unitPrice,
  discountType: line.discountType,
  discountValue: line.discountType === 'NONE' ? '' : line.discountValue,
  taxLabel: line.taxLabel,
  taxRate: line.taxRate,
  remarks: line.remarks,
});

/** What changed on a line compared with the enquiry requirement it answers. */
function enquiryDifferences(line: QuotationLineRow, ref: EnquiryItem): string[] {
  const changes: string[] = [];
  if ((line.req.product[0]?.id ?? '') !== ref.productId) changes.push(`Product: ${ref.product.name} → ${line.req.product[0]?.label ?? 'none'}`);
  else if (line.req.productModelId !== (ref.productModelId ?? '')) {
    changes.push(`Model: ${ref.productModel ? `${ref.productModel.modelName} (${ref.productModel.modelNumber})` : 'not specified'} → ${line.req.productModelId ? 'another model' : 'not specified'}`);
  }
  if (line.quantity.trim() !== String(ref.quantity)) changes.push(`Quantity: ${ref.quantity} → ${line.quantity.trim() || 'blank'}`);
  if ((line.unit.trim() || 'Nos') !== ref.unit) changes.push(`Unit: ${ref.unit} → ${line.unit.trim() || 'Nos'}`);
  return changes;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export function QuotationForm({
  mode,
  quotationId,
  quotationNumber,
  revisionNumber,
  handoff,
  enquiryRef,
  initial,
  initialCustomer,
  fixedCustomerName,
  currency: fixedCurrency,
  assignees,
  defaultTerms,
  canCreateProduct,
}: {
  mode: 'create' | 'edit';
  quotationId?: string;
  quotationNumber?: string;
  revisionNumber?: number;
  /** Creating from an enquiry: what the API handed over. */
  handoff?: QuotationEnquiryHandoff | null;
  /** Editing a quotation made from an enquiry: its requirements, to show differences. */
  enquiryRef?: { enquiryNumber: string; items: EnquiryItem[] } | null;
  initial?: QuotationFormInitial;
  initialCustomer?: CustomerCardData | null;
  /** Customer shown when its full details cannot be loaded. */
  fixedCustomerName?: string;
  /** Editing: the quotation's current currency (changeable while the revision is a draft). */
  currency?: string;
  assignees: EnquiryAssignee[];
  /** Default terms from settings, copied in only when an administrator set them. */
  defaultTerms: string | null;
  canCreateProduct: boolean;
}) {
  const creating = mode === 'create';
  const fromEnquiry = Boolean(handoff);
  const manual = creating && !fromEnquiry;
  const enquiryNumber = handoff?.enquiryNumber ?? enquiryRef?.enquiryNumber ?? null;
  const enquiryItems = useMemo(() => handoff?.enquiry.items ?? enquiryRef?.items ?? [], [handoff, enquiryRef]);

  const [customer, setCustomer] = useState<CustomerCardData | null>(initialCustomer ?? null);
  const [customerOption, setCustomerOption] = useState<SearchOption[]>(
    initialCustomer && manual ? [{ id: initialCustomer.id, label: initialCustomer.name, detail: initialCustomer.customerCode }] : [],
  );
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [customerId, setCustomerId] = useState(handoff?.customerId ?? initialCustomer?.id ?? '');
  const [header, setHeader] = useState<QuotationHeaderPayload>(() =>
    initial?.header ?? {
      contactId: handoff ? handoff.customerContactId ?? '' : (initialCustomer?.contacts.find((c) => c.isPrimary) ?? initialCustomer?.contacts[0])?.id ?? '',
      assignedToId: handoff?.enquiry.assignedTo?.id ?? '',
      subject: '',
      referenceNumber: '',
    },
  );
  const [currency, setCurrency] = useState(fixedCurrency ?? handoff?.currency ?? 'INR');
  const [content, setContent] = useState<QuotationFormContent>(() =>
    initial?.content ?? { ...emptyContent(), termsAndConditions: defaultTerms && defaultTerms.trim() ? defaultTerms : '' },
  );
  const [lines, setLines] = useState<QuotationLineRow[]>(() =>
    initial?.lines ?? (handoff ? handoff.enquiry.items.map(lineFromEnquiryItem) : [emptyLine()]),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);

  const setH = <K extends keyof QuotationHeaderPayload>(field: K, value: QuotationHeaderPayload[K]) => {
    setHeader((h) => ({ ...h, [field]: value }));
    setErrors(({ [field]: _r, ...rest }) => rest);
  };
  const setC = <K extends keyof QuotationFormContent>(field: K, value: QuotationFormContent[K]) => {
    setContent((c) => ({ ...c, [field]: value }));
    setErrors(({ [field]: _r, ...rest }) => rest);
  };
  const updateLine = (key: string, change: Partial<QuotationLineRow>) => {
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...change } : l)));
    setLineErrors(({ [key]: _r, ...rest }) => rest);
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
    setHeader((h) => ({ ...h, contactId: '' }));
    if (!picked) {
      setCustomer(null);
      setCustomerId('');
      return;
    }
    setCustomerId(picked.id);
    setLoadingCustomer(true);
    getCustomerForEnquiryAction(picked.id).then((detail) => {
      setLoadingCustomer(false);
      setCustomer(detail);
      if (!detail) {
        setResult({ error: 'The customer details could not be loaded.' });
        return;
      }
      const primary = detail.contacts.find((c) => c.isPrimary) ?? detail.contacts[0];
      setHeader((h) => ({ ...h, contactId: primary?.id ?? '' }));
    });
  };

  // Live preview with the same arithmetic as the API (which recalculates on save).
  const preview = useMemo(() => {
    const computed: Array<{ key: string; result?: CalcLineResult; error?: string }> = lines.map((line, index) => ({ key: line.key, ...calculateLine(line, index) }));
    const ok = lines
      .map((line, index) => ({ input: line, result: computed[index].result }))
      .filter((l): l is { input: QuotationLineRow; result: CalcLineResult } => Boolean(l.result));
    const { totals, error } = calculateTotals(ok, content.additionalDiscount, content.otherCharges);
    return { byKey: new Map(computed.map((c) => [c.key, c])), totals, totalsError: error, incomplete: ok.length < lines.length };
  }, [lines, content.additionalDiscount, content.otherCharges]);

  const submit = () => {
    if (submitting.current) return;
    const found: Record<string, string> = {};
    if (manual && !customerId) found.customer = 'Select a customer.';
    if (lines.length === 0) found.items = 'Add at least one item.';
    if (!content.quotationDate) found.quotationDate = 'Quotation date is required.';
    if (content.validUntil && content.quotationDate && content.validUntil < content.quotationDate) found.validUntil = 'The validity date cannot be before the quotation date.';
    if (content.additionalDiscount.trim() && !MONEY_PATTERN.test(content.additionalDiscount.trim())) found.additionalDiscount = 'A number with up to 2 decimals.';
    if (content.otherCharges.trim() && !MONEY_PATTERN.test(content.otherCharges.trim())) found.otherCharges = 'A number with up to 2 decimals.';
    if (content.otherChargesLabel.length > 80) found.otherChargesLabel = 'At most 80 characters.';
    if (currency.trim() && !/^[A-Za-z]{3}$/.test(currency.trim())) found.currency = 'Use a 3-letter currency code.';
    for (const [field, max] of Object.entries(LIMITS)) {
      const value = field in header ? header[field as keyof QuotationHeaderPayload] : content[field as keyof QuotationFormContent];
      if (value.length > max) found[field] = `At most ${max} characters.`;
    }
    const foundLines: Record<string, Record<string, string>> = {};
    for (const line of lines) {
      const e = validateLine(line);
      const calc = preview.byKey.get(line.key);
      if (!Object.keys(e).length && calc?.error) e.calc = calc.error;
      if (Object.keys(e).length) foundLines[line.key] = e;
    }
    if (preview.totalsError) found.totals = preview.totalsError;
    setErrors(found);
    setLineErrors(foundLines);
    if (Object.keys(found).length || Object.keys(foundLines).length) {
      setResult({ error: 'Please correct the highlighted fields.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const contentPayload: QuotationContentPayload = { ...content, items: lines.map(toLinePayload) };
    submitting.current = true;
    startTransition(async () => {
      let outcome: ActionResult;
      try {
        outcome =
          !creating && quotationId
            ? await updateQuotationDraftAction(quotationId, { ...contentPayload, ...header, currency })
            : await createQuotationAction({
                ...contentPayload,
                ...header,
                enquiryId: handoff?.enquiryId ?? '',
                customerId: handoff ? '' : customerId,
                currency,
              });
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

  const area = (field: keyof typeof LIMITS & keyof QuotationFormContent, label: string, rows: number, hint?: string, extra?: React.ReactNode) => (
    <div className="md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`q-${field}`} className="field-label">{label}</label>
        {extra}
      </div>
      <textarea id={`q-${field}`} rows={rows} maxLength={LIMITS[field]} value={content[field]} onChange={(e) => setC(field, e.target.value)} className={clsx('field-input', errors[field] && 'border-danger')} />
      {errors[field] ? <p className="field-error">{errors[field]}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  );

  const fromEnquiryNote = (show: boolean) =>
    show && enquiryNumber ? <p className="mt-1 text-xs font-medium text-accent">From enquiry {enquiryNumber}</p> : null;

  const contacts = customer?.contacts ?? [];
  const quotedEnquiryItems = new Set(lines.map((l) => l.enquiryItemId).filter(Boolean));
  const notQuoted = enquiryItems.filter((item) => !quotedEnquiryItems.has(item.id));
  const money = (value: bigint) => `${currency} ${formatAmount(hundredthsToString(value))}`;
  const t = preview.totals;
  const copyButton = (label: string, value: string | null | undefined, field: 'paymentTerms' | 'deliveryTerms') =>
    value ? (
      <button type="button" className="link-pill text-xs font-medium" onClick={() => setC(field, content[field] ? `${content[field]}\n${value}` : value)}>
        {label}
      </button>
    ) : null;

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-5">
      <ResultAlert result={result} />

      {section('A', 'Customer & Reference',
        creating ? (fromEnquiry ? `Customer and contact come from enquiry ${enquiryNumber}. The quotation number is generated on save.` : 'Manual quotation without an enquiry. The quotation number is generated on save.') : `Quotation ${quotationNumber ?? ''}, draft revision ${revisionNumber ?? ''}`,
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <span className="field-label">Quotation Number</span>
              <p className="field-input flex items-center bg-surface-muted font-mono text-ink-muted">{quotationNumber ?? 'Generated on save'}</p>
            </div>
            {manual ? (
              <div>
                <SearchSelect
                  label="Customer *"
                  search={customerSearch}
                  selected={customerOption}
                  onChange={pickCustomer}
                  emptyText="No active customers found"
                />
                {errors.customer && <p className="field-error">{errors.customer}</p>}
              </div>
            ) : (
              <div>
                <span className="field-label">Customer</span>
                <p className="field-input flex items-center bg-surface-muted text-ink">{customer?.name ?? handoff?.enquiry.customer.name ?? fixedCustomerName}</p>
                {fromEnquiryNote(fromEnquiry)}
              </div>
            )}
            <div>
              <SelectField
                label="Contact Person"
                value={header.contactId}
                onChange={(v) => setH('contactId', v)}
                placeholder={manual && !customerId ? 'Select a customer first' : contacts.length ? 'Primary contact' : customer ? 'This customer has no contacts' : 'Not specified'}
                options={
                  contacts.length
                    ? contacts.map((c) => ({ value: c.id, label: `${c.name}${c.isPrimary ? ' (primary)' : ''}${c.designation ? ` - ${c.designation}` : ''}` }))
                    : handoff?.enquiry.customerContact
                      ? [{ value: handoff.enquiry.customerContact.id, label: handoff.enquiry.customerContact.name }]
                      : []
                }
              />
              {fromEnquiryNote(fromEnquiry && Boolean(handoff?.customerContactId) && header.contactId === handoff?.customerContactId)}
            </div>
            <div>
              <SelectField label="Assigned Employee" value={header.assignedToId} onChange={(v) => setH('assignedToId', v)} placeholder="Unassigned" options={assignees.map((a) => ({ value: a.id, label: a.fullName }))} />
              {fromEnquiryNote(fromEnquiry && Boolean(handoff?.enquiry.assignedTo) && header.assignedToId === handoff?.enquiry.assignedTo?.id)}
            </div>
            <TextField label="Quotation Date" type="date" required value={content.quotationDate} onChange={(v) => setC('quotationDate', v)} error={errors.quotationDate} />
            <TextField label="Valid Until" type="date" value={content.validUntil} onChange={(v) => setC('validUntil', v)} error={errors.validUntil} hint="Optional. A quotation cannot be marked sent after this date." />
            <TextField label="Subject" value={header.subject} onChange={(v) => setH('subject', v)} error={errors.subject} maxLength={LIMITS.subject} />
            <TextField label="Customer Reference No." value={header.referenceNumber} onChange={(v) => setH('referenceNumber', v)} error={errors.referenceNumber} maxLength={LIMITS.referenceNumber} hint="Your customer's own reference for this order (optional)" />
            {creating || (quotationId && (revisionNumber ?? 1) <= 1) ? (
              <div>
                <TextField label="Currency" value={currency} onChange={(v) => { setCurrency(v.toUpperCase()); setErrors(({ currency: _c, ...rest }) => rest); }} error={errors.currency} maxLength={3} />
                {fromEnquiryNote(fromEnquiry && currency === handoff?.currency)}
              </div>
            ) : (
              <div>
                <span className="field-label">Currency</span>
                <p className="field-input flex items-center bg-surface-muted text-ink-muted">{currency}</p>
                {quotationId && (
                  <p className="field-hint">Fixed after revision 1: earlier revisions are priced in {currency}.</p>
                )}
              </div>
            )}
          </div>
          {loadingCustomer && <p className="text-sm text-ink-subtle">Loading customer details...</p>}
          {customer && !loadingCustomer && <CustomerSummaryCard customer={customer} />}
          {customer && (
            <Link href={`/customers/${customer.id}`} target="_blank" className="link-pill text-sm font-medium">
              View customer <IconArrowRight size={14} />
            </Link>
          )}
        </div>,
      )}

      {section('B', 'Products', fromEnquiry || enquiryRef ? `Lines from enquiry ${enquiryNumber} are marked; changes from the requirement are highlighted. Prices, discounts and tax are entered per line.` : 'Existing products and models from Product Management. Prices, discounts and tax are entered per line.',
        <div className="space-y-4">
          {errors.items && <p className="field-error">{errors.items}</p>}
          {lines.map((line, index) => {
            const ref = line.enquiryItemId ? enquiryItems.find((i) => i.id === line.enquiryItemId) : undefined;
            const changes = ref ? enquiryDifferences(line, ref) : [];
            const calc = preview.byKey.get(line.key);
            const e = lineErrors[line.key] ?? {};
            return (
              <fieldset key={line.key} className={clsx('rounded-xl border p-4', changes.length ? 'border-warning/50' : 'border-border')}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <legend className="text-sm font-semibold text-ink">Item {index + 1}</legend>
                    {ref && <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">From enquiry requirement</span>}
                    {!ref && enquiryNumber && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">Added (not in the enquiry)</span>}
                  </div>
                  {lines.length > 1 && (
                    <button type="button" className="link-pill-danger text-sm" onClick={() => setLines((list) => list.filter((l) => l.key !== line.key))}>
                      <IconTrash size={14} /> Remove
                    </button>
                  )}
                </div>
                {changes.length > 0 && (
                  <div className="mb-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
                    <p className="font-medium">Changed from the enquiry requirement:</p>
                    <ul className="list-inside list-disc">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                )}
                {ref?.technicalRequirements && (
                  <p className="mb-3 whitespace-pre-line rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                    <span className="font-medium text-ink">Customer requirement:</span> {ref.technicalRequirements}
                  </p>
                )}
                <RequirementFields pickerOnly row={line.req} onChange={(change) => updateLine(line.key, { req: { ...line.req, ...change } })} errors={e} />
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
                  <TextField label="Quantity" required value={line.quantity} onChange={(v) => updateLine(line.key, { quantity: v })} error={e.quantity} inputMode="numeric" />
                  <TextField label="Unit" value={line.unit} onChange={(v) => updateLine(line.key, { unit: v })} error={e.unit} maxLength={20} placeholder="Enter unit" />
                  <TextField label={`Unit Price (${currency})`} required value={line.unitPrice} onChange={(v) => updateLine(line.key, { unitPrice: v })} error={e.unitPrice} inputMode="decimal" />
                  <SelectField label="Discount" value={line.discountType} onChange={(v) => updateLine(line.key, { discountType: v as DiscountType })} options={(Object.keys(DISCOUNT_TYPE_LABELS) as DiscountType[]).map((d) => ({ value: d, label: DISCOUNT_TYPE_LABELS[d] }))} />
                  {line.discountType !== 'NONE' ? (
                    <TextField label={line.discountType === 'PERCENT' ? 'Discount (%)' : `Discount (${currency})`} value={line.discountValue} onChange={(v) => updateLine(line.key, { discountValue: v })} error={e.discountValue} inputMode="decimal" />
                  ) : (
                    <div aria-hidden className="hidden xl:block" />
                  )}
                  <TextField label="Tax Label" value={line.taxLabel} onChange={(v) => updateLine(line.key, { taxLabel: v })} error={e.taxLabel} maxLength={40} placeholder="Enter charge label" />
                  <TextField label="Tax Rate (%)" value={line.taxRate} onChange={(v) => updateLine(line.key, { taxRate: v })} error={e.taxRate} inputMode="decimal" hint="Blank means no tax" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor={`${line.key}-desc`} className="field-label">Description</label>
                    <textarea id={`${line.key}-desc`} rows={2} maxLength={4000} value={line.description} onChange={(ev) => updateLine(line.key, { description: ev.target.value })} className="field-input" />
                    {e.description ? <p className="field-error">{e.description}</p> : <p className="field-hint">Printed on the quotation. Blank uses the model or product description.</p>}
                  </div>
                  <TextField label="Remarks" value={line.remarks} onChange={(v) => updateLine(line.key, { remarks: v })} error={e.remarks} maxLength={1000} />
                </div>
                <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                  {calc?.result ? (
                    <p className="flex flex-wrap gap-x-5 gap-y-1 text-ink-muted">
                      <span>Amount <span className="tabular-nums text-ink">{money(calc.result.gross)}</span></span>
                      <span>Discount <span className="tabular-nums text-ink">{money(calc.result.discountAmount)}</span></span>
                      <span>Taxable <span className="tabular-nums text-ink">{money(calc.result.taxable)}</span></span>
                      <span>Tax <span className="tabular-nums text-ink">{money(calc.result.taxAmount)}</span></span>
                      <span className="font-semibold text-ink">Line total <span className="tabular-nums">{money(calc.result.lineTotal)}</span></span>
                    </p>
                  ) : (
                    <p className={e.calc ? 'text-danger' : 'text-ink-subtle'}>{calc?.error ?? 'Enter quantity and unit price to calculate this line.'}</p>
                  )}
                </div>
              </fieldset>
            );
          })}
          {notQuoted.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
              <p className="font-medium text-ink">Enquiry requirements not on this quotation:</p>
              <ul className="mt-1 space-y-1">
                {notQuoted.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{item.product.name}{item.productModel ? ` - ${item.productModel.modelName}` : ''} &middot; {item.quantity} {item.unit}</span>
                    <button type="button" className="link-pill text-xs font-medium" onClick={() => setLines((list) => [...list, lineFromEnquiryItem(item)])}>Add back</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="btn-secondary" onClick={() => setLines((list) => [...list, emptyLine()])}><IconPlus size={16} /> Add item</button>
            {canCreateProduct && (
              <Link href="/products/new" target="_blank" className="link-pill text-sm font-medium">
                Product missing? Open Product Management <IconArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>,
      )}

      {section('C', 'Pricing Summary', 'Calculated as you type with the same rules the server uses; the server recalculates every amount when you save.',
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Other Charges Label" value={content.otherChargesLabel} onChange={(v) => setC('otherChargesLabel', v)} error={errors.otherChargesLabel} maxLength={80} placeholder="Enter charge label" />
            <TextField label={`Other Charges (${currency})`} value={content.otherCharges} onChange={(v) => setC('otherCharges', v)} error={errors.otherCharges} inputMode="decimal" />
            <TextField
              label={`Additional Discount (${currency})`}
              value={content.additionalDiscount}
              onChange={(v) => setC('additionalDiscount', v)}
              error={errors.additionalDiscount}
              inputMode="decimal"
              hint="A flat reduction of the grand total, applied after tax and shown separately."
              className="sm:col-span-2"
            />
          </div>
          <dl className="space-y-1.5 rounded-xl border border-border bg-surface-muted p-4 text-sm">
            {[
              ['Subtotal', t.subtotal],
              ['Item discounts', t.itemDiscountTotal],
              ['Taxable amount', t.taxableAmount],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-4">
                <dt className="text-ink-muted">{label as string}</dt>
                <dd className="tabular-nums text-ink">{label === 'Item discounts' && (value as bigint) > BigInt(0) ? '- ' : ''}{money(value as bigint)}</dd>
              </div>
            ))}
            {t.taxBreakdown.map((g) => (
              <div key={`${g.label}-${g.rate}`} className="flex justify-between gap-4 pl-3">
                <dt className="text-ink-muted">{g.label} {formatRate(g.rate)}% on {currency} {formatAmount(g.taxable)}</dt>
                <dd className="tabular-nums text-ink">{currency} {formatAmount(g.tax)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Tax total</dt>
              <dd className="tabular-nums text-ink">{money(t.taxTotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">{content.otherChargesLabel.trim() || 'Other charges'}</dt>
              <dd className="tabular-nums text-ink">{money(t.otherCharges)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Additional discount</dt>
              <dd className="tabular-nums text-ink">{t.additionalDiscount > BigInt(0) ? '- ' : ''}{money(t.additionalDiscount)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
              <dt className="text-ink">Grand total</dt>
              <dd className={clsx('tabular-nums', preview.totalsError ? 'text-danger' : 'text-ink')}>{money(t.grandTotal)}</dd>
            </div>
            {preview.incomplete && <p className="pt-1 text-xs text-warning">Some items are incomplete and are not included yet.</p>}
            {(errors.totals || preview.totalsError) && <p className="pt-1 text-xs text-danger">{errors.totals ?? preview.totalsError}</p>}
          </dl>
        </div>,
      )}

      {section('D', 'Terms', defaultTerms && creating ? 'Terms and conditions start from the default set in Settings; edit them for this quotation.' : 'Printed on the quotation.',
        <div className="space-y-4">
          {handoff && (handoff.enquiry.expectedDeliveryTimeline || handoff.enquiry.paymentPreference || handoff.enquiry.commercialNotes) && (
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
              <p className="font-medium text-ink">Customer expectations recorded on enquiry {enquiryNumber} (not copied automatically):</p>
              {handoff.enquiry.expectedDeliveryTimeline && <p>Delivery timeline: <span className="text-ink">{handoff.enquiry.expectedDeliveryTimeline}</span></p>}
              {handoff.enquiry.paymentPreference && <p>Payment preference: <span className="text-ink">{handoff.enquiry.paymentPreference}</span></p>}
              {handoff.enquiry.commercialNotes && <p className="whitespace-pre-line">Commercial notes: <span className="text-ink">{handoff.enquiry.commercialNotes}</span></p>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {area('termsAndConditions', 'Terms and Conditions', 5, !defaultTerms ? 'No default terms are set in Settings.' : undefined)}
            {area('paymentTerms', 'Payment Terms', 2, undefined, copyButton('Copy payment preference from enquiry', handoff?.enquiry.paymentPreference, 'paymentTerms'))}
            {area('deliveryTerms', 'Delivery Terms', 2, undefined, copyButton('Copy delivery timeline from enquiry', handoff?.enquiry.expectedDeliveryTimeline, 'deliveryTerms'))}
            {area('warrantyTerms', 'Warranty Terms', 2)}
            {area('notes', 'Notes', 2, 'Printed on the quotation.')}
          </div>
        </div>,
      )}

      {section('E', 'Internal Remarks', 'Visible to staff only. Not printed on the quotation.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{area('internalRemarks', 'Internal Remarks', 3)}</div>,
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <p className="text-sm text-ink-muted">Grand total <span className="font-semibold tabular-nums text-ink">{money(t.grandTotal)}</span></p>
        <div className="flex flex-wrap gap-3">
          <Link href={quotationId ? `/quotations/${quotationId}` : handoff ? `/enquiries/${handoff.enquiryId}` : '/quotations'} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-primary px-5" disabled={pending}>
            {pending ? 'Saving...' : creating ? 'Save as Draft' : 'Save Draft'}
          </button>
        </div>
      </div>
    </form>
  );
}
