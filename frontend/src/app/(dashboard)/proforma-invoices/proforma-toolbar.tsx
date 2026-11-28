'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { IconDownload, IconRefresh, IconSearch } from '@/components/icons';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { PROFORMA_STATUS_GROUPS, PROFORMA_STATUS_LABELS, PROFORMA_STATUSES } from '@/lib/proforma-labels';
import type { EnquiryAssignee } from '@/lib/types';

const FILTER_KEYS = ['search', 'status', 'customerId', 'assignedToId', 'quotationId', 'dateFrom', 'dateTo', 'amountMin', 'amountMax'];
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** PI filters: written to the URL and applied by the API, so they combine and paginate correctly. */
export function ProformaToolbar({
  assignees,
  customer,
  quotationLabel,
  exportHref,
}: {
  assignees: EnquiryAssignee[];
  customer: SearchOption | null;
  quotationLabel: string | null;
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

  const statusOptions = [...PROFORMA_STATUS_GROUPS, ...PROFORMA_STATUSES.map((s) => ({ value: s, label: PROFORMA_STATUS_LABELS[s] }))];

  return (
    <div className="card space-y-3 p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_200px_auto_auto]">
        <form role="search" className="relative md:col-span-2 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); commitSearch(); }}>
          <label htmlFor="pi-search" className="sr-only">Search proforma invoices</label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="pi-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={commitSearch}
            className="field-input h-10 pl-10"
          />
        </form>
        {select('status', 'Status', statusOptions, 'Status')}
        {select('assignedToId', 'Assigned to', assignees.map((a) => ({ value: a.id, label: a.fullName })), 'Assigned To')}
        <button type="button" className="btn-secondary h-10" disabled={!FILTER_KEYS.some((k) => params.get(k)) || pending} onClick={() => startTransition(() => router.push(pathname))}>
          <IconRefresh size={16} /> Clear Filters
        </button>
        {exportHref && <a href={exportHref} className="btn-secondary h-10"><IconDownload size={16} /> Export CSV</a>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
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
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <label htmlFor="f-dateFrom">PI date from</label>
          <input id="f-dateFrom" type="date" value={params.get('dateFrom') ?? ''} max={params.get('dateTo') ?? undefined} onChange={(e) => apply({ dateFrom: e.target.value || null })} className="field-input h-10 w-auto" />
          <label htmlFor="f-dateTo">to</label>
          <input id="f-dateTo" type="date" value={params.get('dateTo') ?? ''} min={params.get('dateFrom') ?? undefined} onChange={(e) => apply({ dateTo: e.target.value || null })} className="field-input h-10 w-auto" />
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm text-ink-muted" onSubmit={(e) => { e.preventDefault(); commitAmounts(); }}>
          <label htmlFor="f-amountMin">Total from</label>
          <input id="f-amountMin" inputMode="decimal" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} onBlur={commitAmounts} className="field-input h-10 w-28" />
          <label htmlFor="f-amountMax">to</label>
          <input id="f-amountMax" inputMode="decimal" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} onBlur={commitAmounts} className="field-input h-10 w-28" />
          {amountError && <span className="text-danger">{amountError}</span>}
        </form>
        {quotationLabel && (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-sm text-ink">
            Quotation {quotationLabel}
            <button type="button" className="text-ink-muted hover:text-danger" onClick={() => apply({ quotationId: null })} aria-label="Remove quotation filter">&times;</button>
          </span>
        )}
      </div>
    </div>
  );
}
