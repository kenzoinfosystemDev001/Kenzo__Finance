'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { IconRefresh, IconSearch } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { DELIVERY_SORT_FIELDS, DELIVERY_STATUS_LABELS, DELIVERY_STATUSES } from '@/lib/delivery-labels';

const RANGES = [
  ['dateFrom', 'dateTo', 'Delivery date'],
  ['dispatchFrom', 'dispatchTo', 'Dispatch date'],
  ['expectedFrom', 'expectedTo', 'Expected date'],
  ['deliveredFrom', 'deliveredTo', 'Delivered on'],
] as const;

const KEYS = ['search', 'status', 'customerId', 'transporter', 'location', 'delayedOnly', 'sortBy', 'sortDir', 'pageSize', ...RANGES.flatMap(([a, b]) => [a, b])];

/** Register filters, kept in the URL (each maps to a QueryDeliveriesDto field). */
export function DeliveryFilters({ customer }: { customer: SearchOption | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])));
  const [picked, setPicked] = useState<SearchOption | null>(customer && params.get('customerId') === customer.id ? customer : null);
  const [more, setMore] = useState(() => RANGES.some(([a, b]) => params.get(a) || params.get(b)) || Boolean(params.get('transporter') || params.get('location')));

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const customerSearch = useCallback(
    async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })),
    [],
  );

  const apply = (next: Record<string, string>) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) search.set(k, v);
    const qs = search.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  const active = KEYS.some((k) => params.get(k));

  return (
    <form
      className="card space-y-3 p-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        apply({ ...values, customerId: picked?.id ?? '' });
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <label htmlFor="d-search" className="field-label">Search</label>
          <div className="relative">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input id="d-search" value={values.search} onChange={(e) => set('search', e.target.value)} maxLength={200} className="field-input pl-9" />
          </div>
        </div>
        <div>
          <label htmlFor="d-status" className="field-label">Status</label>
          <select id="d-status" value={values.status} onChange={(e) => set('status', e.target.value)} className="field-input">
            <option value="">All statuses</option>
            <option value="DISPATCHED,IN_TRANSIT">On the way (dispatched / in transit)</option>
            <option value="DRAFT,SCHEDULED,READY_FOR_DISPATCH">Not yet dispatched</option>
            {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <span className="field-label">Customer</span>
          <SearchSelect
            label="Customer"
            hideLabel
            compact
            placeholder="All customers"
            search={customerSearch}
            selected={picked ? [picked] : []}
            onChange={(next) => setPicked(next[0] ?? null)}
            emptyText="No active customers found"
          />
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={values.delayedOnly === 'true'} onChange={(e) => set('delayedOnly', e.target.checked ? 'true' : '')} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Delayed only
          </label>
        </div>
      </div>

      {more && (
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 md:grid-cols-4">
          {RANGES.map(([from, to, label]) => (
            <fieldset key={from} className="min-w-0">
              <legend className="field-label">{label}</legend>
              <div className="flex items-center gap-2">
                <input type="date" aria-label={`${label} from`} value={values[from]} max={values[to] || undefined} onChange={(e) => set(from, e.target.value)} className="field-input" />
                <span className="text-sm text-ink-subtle">to</span>
                <input type="date" aria-label={`${label} to`} value={values[to]} min={values[from] || undefined} onChange={(e) => set(to, e.target.value)} className="field-input" />
              </div>
            </fieldset>
          ))}
          <div>
            <label htmlFor="d-transporter" className="field-label">Transporter / courier</label>
            <input id="d-transporter" value={values.transporter} onChange={(e) => set('transporter', e.target.value)} maxLength={200} className="field-input" />
          </div>
          <div>
            <label htmlFor="d-location" className="field-label">Location (part of address)</label>
            <input id="d-location" value={values.location} onChange={(e) => set('location', e.target.value)} maxLength={200} className="field-input" />
          </div>
          <div>
            <label htmlFor="d-sort" className="field-label">Sort by</label>
            <select id="d-sort" value={values.sortBy || 'createdAt'} onChange={(e) => set('sortBy', e.target.value)} className="field-input">
              {DELIVERY_SORT_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="d-dir" className="field-label">Order</label>
            <select id="d-dir" value={values.sortDir || 'desc'} onChange={(e) => set('sortDir', e.target.value)} className="field-input">
              <option value="desc">Newest / highest first</option>
              <option value="asc">Oldest / lowest first</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setMore((m) => !m)}>
          {more ? 'Fewer filters' : 'More filters (dates, transporter, location, sorting)'}
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={!active || pending} onClick={() => startTransition(() => router.push(pathname))}>
            <IconRefresh size={16} /> Clear
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Filtering...' : 'Apply filters'}</button>
        </div>
      </div>
    </form>
  );
}
