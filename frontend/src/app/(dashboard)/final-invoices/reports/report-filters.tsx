'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import { IconRefresh } from '@/components/icons';

/** Report filters (invoice date range and customer), kept in the URL. */
export function InvoiceReportFilters({ customer }: { customer: SearchOption | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  const customerSearch = useCallback(
    async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })),
    [],
  );

  const active = ['dateFrom', 'dateTo', 'customerId'].some((k) => params.get(k));

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <label htmlFor="r-from">Invoice date from</label>
        <input id="r-from" type="date" value={params.get('dateFrom') ?? ''} max={params.get('dateTo') ?? undefined} onChange={(e) => apply({ dateFrom: e.target.value || null })} className="field-input h-10 w-auto" />
        <label htmlFor="r-to">to</label>
        <input id="r-to" type="date" value={params.get('dateTo') ?? ''} min={params.get('dateFrom') ?? undefined} onChange={(e) => apply({ dateTo: e.target.value || null })} className="field-input h-10 w-auto" />
      </div>
      <div className="w-full sm:w-64">
        <SearchSelect
          label="Customer"
          hideLabel
          compact
          placeholder="All customers"
          search={customerSearch}
          selected={customer && params.get('customerId') === customer.id ? [customer] : []}
          onChange={(next) => apply({ customerId: next[0]?.id ?? null })}
          emptyText="No active customers found"
        />
      </div>
      <button type="button" className="btn-secondary h-10" disabled={!active || pending} onClick={() => startTransition(() => router.push(pathname))}>
        <IconRefresh size={16} /> Clear
      </button>
    </div>
  );
}
