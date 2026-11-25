'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { IconRefresh } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';

/** Report filters (DeliveryReportQueryDto: date range, customer, transporter), kept in the URL. */
export function DeliveryReportFilters({ customer }: { customer: SearchOption | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [transporter, setTransporter] = useState(params.get('transporter') ?? '');

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

  const customerSearch = useCallback(async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })), []);
  const active = ['dateFrom', 'dateTo', 'customerId', 'transporter'].some((k) => params.get(k));

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <label htmlFor="dr-from">Date from</label>
        <input id="dr-from" type="date" value={params.get('dateFrom') ?? ''} max={params.get('dateTo') ?? undefined} onChange={(e) => apply({ dateFrom: e.target.value || null })} className="field-input h-10 w-auto" />
        <label htmlFor="dr-to">to</label>
        <input id="dr-to" type="date" value={params.get('dateTo') ?? ''} min={params.get('dateFrom') ?? undefined} onChange={(e) => apply({ dateTo: e.target.value || null })} className="field-input h-10 w-auto" />
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
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ transporter: transporter.trim() || null });
        }}
      >
        <label htmlFor="dr-transporter" className="sr-only">Transporter or courier</label>
        <input id="dr-transporter" value={transporter} maxLength={200} onChange={(e) => setTransporter(e.target.value)} placeholder="Transporter / courier" className="field-input h-10 w-52" />
        <button type="submit" className="btn-secondary h-10" disabled={pending}>Apply</button>
      </form>
      <button type="button" className="btn-secondary h-10" disabled={!active || pending} onClick={() => { setTransporter(''); startTransition(() => router.push(pathname)); }}>
        <IconRefresh size={16} /> Clear
      </button>
    </div>
  );
}
