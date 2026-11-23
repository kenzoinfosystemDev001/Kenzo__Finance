'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { IconRefresh } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { searchProductsAction } from '@/lib/vendor-actions';
import { DEFAULT_PRESET, RANGE_PRESETS } from '@/lib/analytics';

type FilterKey = 'customerId' | 'productId' | 'assignedToId' | 'buckets';

/**
 * Shared report filters, kept in the URL so every view is linkable. Only the
 * filters the current report uses are shown (and sent to the API).
 */
export function ReportFilters({
  filters,
  customer,
  product,
  assignees,
}: {
  filters: FilterKey[];
  customer: SearchOption | null;
  product: SearchOption | null;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const preset = params.get('preset') ?? DEFAULT_PRESET;
  const [from, setFrom] = useState(params.get('dateFrom') ?? '');
  const [to, setTo] = useState(params.get('dateTo') ?? '');
  const [buckets, setBuckets] = useState(params.get('buckets') ?? '');
  const [customPicked, setCustomPicked] = useState(preset === 'custom');

  useEffect(() => {
    setFrom(params.get('dateFrom') ?? '');
    setTo(params.get('dateTo') ?? '');
    setBuckets(params.get('buckets') ?? '');
    setCustomPicked((params.get('preset') ?? DEFAULT_PRESET) === 'custom');
  }, [params]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (next.get('preset') === DEFAULT_PRESET) next.delete('preset');
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router],
  );

  const customerSearch = useCallback(async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })), []);
  const productSearch = useCallback(async (term: string) => (await searchProductsAction(term)).map((p) => ({ id: p.id, label: p.name, detail: p.productCode })), []);

  const showCustom = customPicked || preset === 'custom';
  const active = ['preset', 'dateFrom', 'dateTo', 'customerId', 'productId', 'assignedToId', 'buckets'].some((k) => params.get(k));

  return (
    <div className="card flex flex-wrap items-end gap-3 p-3" aria-busy={pending}>
      <label className="flex flex-col gap-1 text-sm text-ink-muted">
        Period
        <select
          className="field-input h-10 w-auto"
          value={showCustom ? 'custom' : preset}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'custom') {
              // Wait for both dates before asking the API (it requires both).
              setCustomPicked(true);
              return;
            }
            setCustomPicked(false);
            apply({ preset: value, dateFrom: null, dateTo: null });
          }}
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {showCustom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ preset: 'custom', dateFrom: from || null, dateTo: to || null });
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            From
            <input type="date" required value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="field-input h-10 w-auto" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            To
            <input type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="field-input h-10 w-auto" />
          </label>
          <button type="submit" className="btn-secondary h-10" disabled={pending}>
            Apply
          </button>
        </form>
      )}

      {filters.includes('customerId') && (
        <div className="flex w-full flex-col gap-1 text-sm text-ink-muted sm:w-64">
          <span>Customer</span>
          <SearchSelect
            label="Customer"
            hideLabel
            compact
            placeholder="All customers"
            search={customerSearch}
            selected={customer && params.get('customerId') === customer.id ? [customer] : []}
            onChange={(next) => apply({ customerId: next[0]?.id ?? null })}
            emptyText="No customers found"
          />
        </div>
      )}

      {filters.includes('productId') && (
        <div className="flex w-full flex-col gap-1 text-sm text-ink-muted sm:w-64">
          <span>Product</span>
          <SearchSelect
            label="Product"
            hideLabel
            compact
            placeholder="All products"
            search={productSearch}
            selected={product && params.get('productId') === product.id ? [product] : []}
            onChange={(next) => apply({ productId: next[0]?.id ?? null })}
            emptyText="No products found"
          />
        </div>
      )}

      {filters.includes('assignedToId') && (
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Employee
          <select className="field-input h-10 w-auto" value={params.get('assignedToId') ?? ''} onChange={(e) => apply({ assignedToId: e.target.value || null })}>
            <option value="">All employees</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </label>
      )}

      {filters.includes('buckets') && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ buckets: buckets.replace(/\s+/g, '') || null });
          }}
        >
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            Ageing buckets (days)
            <input value={buckets} onChange={(e) => setBuckets(e.target.value)} placeholder="Enter days, comma-separated" pattern="\s*\d{1,4}(\s*,\s*\d{1,4})*\s*" className="field-input h-10 w-36" />
          </label>
          <button type="submit" className="btn-secondary h-10" disabled={pending}>
            Apply
          </button>
        </form>
      )}

      <button type="button" className="btn-secondary h-10" disabled={!active || pending} onClick={() => startTransition(() => router.push(pathname))}>
        <IconRefresh size={16} /> Reset
      </button>
    </div>
  );
}
