'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { IconDownload, IconRefresh, IconSearch } from '@/components/icons';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { QUOTATION_STATUS_GROUPS, QUOTATION_STATUS_LABELS, QUOTATION_STATUSES } from '@/lib/quotation-labels';
import type { EnquiryAssignee } from '@/lib/types';

const FILTER_KEYS = ['search', 'status', 'customerId', 'assignedToId', 'enquiryId', 'dateFrom', 'dateTo', 'validFrom', 'validTo', 'amountMin', 'amountMax', 'revisedOnly'];
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** Quotation filters: written to the URL and applied by the API, so they combine and paginate correctly. */
export function QuotationToolbar({
  assignees,
  customer,
  enquiryLabel,
  exportHref,
}: {
  assignees: EnquiryAssignee[];
  /** The customer currently filtered on, for the picker's label. */
  customer: SearchOption | null;
  enquiryLabel: string | null;
  exportHref: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    setSearch(params.get('search') ?? '');
    setAmountMin(params.get('amountMin') ?? '');
    setAmountMax(params.get('amountMax') ?? '');
  }, [params]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete('page');
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  const commitSearch = () => {
    const value = search.trim();
    if ((params.get('search') ?? '') !== value) apply({ search: value || null });
  };

  const commitAmounts = () => {
    const min = amountMin.trim();
    const max = amountMax.trim();
    if ((min && !MONEY.test(min)) || (max && !MONEY.test(max))) {
      setAmountError('Enter amounts as numbers with up to 2 decimals.');
      return;
    }
    setAmountError('');
    if ((params.get('amountMin') ?? '') !== min || (params.get('amountMax') ?? '') !== max) apply({ amountMin: min || null, amountMax: max || null });
  };

  const customerSearch = useCallback(
    async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })),
    [],
  );

  const select = (field: string, label: string, options: Array<{ value: string; label: string }>, all: string) => {
    const value = params.get(field) ?? '';
    const known = !value || options.some((o) => o.value === value);
    return (
      <div>
        <label htmlFor={`f-${field}`} className="sr-only">{label}</label>
        <select id={`f-${field}`} value={value} onChange={(e) => apply({ [field]: e.target.value || null })} className="field-input h-10">
          <option value="">{all}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {!known && <option value={value}>Selected filter</option>}
        </select>
      </div>
    );
  };

  const statusOptions = [...QUOTATION_STATUS_GROUPS, ...QUOTATION_STATUSES.map((s) => ({ value: s, label: QUOTATION_STATUS_LABELS[s] }))];
  const dateRange = (fromKey: string, toKey: string, label: string) => (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
      <label htmlFor={`f-${fromKey}`}>{label}</label>
      <input id={`f-${fromKey}`} type="date" value={params.get(fromKey) ?? ''} max={params.get(toKey) ?? undefined} onChange={(e) => apply({ [fromKey]: e.target.value || null })} className="field-input h-10 w-auto" />
      <label htmlFor={`f-${toKey}`}>to</label>
      <input id={`f-${toKey}`} type="date" value={params.get(toKey) ?? ''} min={params.get(fromKey) ?? undefined} onChange={(e) => apply({ [toKey]: e.target.value || null })} className="field-input h-10 w-auto" />
    </div>
  );

  return (
    <div className="card space-y-3 p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto_auto]">
        <form role="search" className="relative md:col-span-2 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); commitSearch(); }}>
          <label htmlFor="quotation-search" className="sr-only">Search quotations</label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="quotation-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={commitSearch}
            className="field-input h-10 pl-10"
          />
        </form>
        {select('status', 'Status', statusOptions, 'Status')}
        {select('assignedToId', 'Assigned to', assignees.map((a) => ({ value: a.id, label: a.fullName })), 'Assigned To')}
        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!FILTER_KEYS.some((k) => params.get(k)) || pending}
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <IconRefresh size={16} /> Clear Filters
        </button>
        {exportHref && (
          <a href={exportHref} className="btn-secondary h-10"><IconDownload size={16} /> Export CSV</a>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[260px_auto_auto]">
        <SearchSelect
          label="Customer"
          hideLabel
          compact
          placeholder="Customer"
          search={customerSearch}
          selected={customer && params.get('customerId') === customer.id ? [customer] : []}
          onChange={(next) => apply({ customerId: next[0]?.id ?? null })}
          emptyText="No active customers found"
        />
        {dateRange('dateFrom', 'dateTo', 'Created from')}
        {dateRange('validFrom', 'validTo', 'Valid until from')}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex flex-wrap items-center gap-2 text-sm text-ink-muted" onSubmit={(e) => { e.preventDefault(); commitAmounts(); }}>
          <label htmlFor="f-amountMin">Total from</label>
          <input id="f-amountMin" inputMode="decimal" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} onBlur={commitAmounts} className="field-input h-10 w-32" />
          <label htmlFor="f-amountMax">to</label>
          <input id="f-amountMax" inputMode="decimal" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} onBlur={commitAmounts} className="field-input h-10 w-32" />
          {amountError && <span className="text-danger">{amountError}</span>}
        </form>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={params.get('revisedOnly') === 'true'}
            onChange={(e) => apply({ revisedOnly: e.target.checked ? 'true' : null })}
            className="h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]"
          />
          Revised quotations only
        </label>
        {enquiryLabel && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-sm text-ink">
            Enquiry {enquiryLabel}
            <button type="button" className="text-ink-muted hover:text-danger" onClick={() => apply({ enquiryId: null })} aria-label="Remove enquiry filter">&times;</button>
          </span>
        )}
      </div>
    </div>
  );
}
