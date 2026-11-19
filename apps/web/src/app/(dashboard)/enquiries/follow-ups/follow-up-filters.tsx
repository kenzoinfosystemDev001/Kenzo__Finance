'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { SearchSelect } from '@/components/search-select';
import { IconRefresh } from '@/components/icons';
import { searchCustomersAction } from '@/lib/enquiry-actions';
import type { EnquiryAssignee } from '@/lib/types';

const FILTER_KEYS = ['assignedToId', 'customerId', 'dateFrom', 'dateTo'];

/** Follow-up board filters, kept in the URL alongside the selected view. */
export function FollowUpFilters({ assignees, customer }: { assignees: EnquiryAssignee[]; customer: { id: string; name: string } | null }) {
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
      next.delete('page');
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  const customerSearch = useCallback(
    async (term: string) => (await searchCustomersAction(term)).map((c) => ({ id: c.id, label: c.name, detail: c.customerCode })),
    [],
  );

  const view = params.get('view');

  return (
    <div className="card grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,280px)_auto_auto]" aria-busy={pending}>
      <div>
        <label htmlFor="fu-assigned" className="sr-only">Assigned employee</label>
        <select id="fu-assigned" value={params.get('assignedToId') ?? ''} onChange={(e) => apply({ assignedToId: e.target.value || null })} className="field-input h-10">
          <option value="">All employees</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
        </select>
      </div>
      <SearchSelect
        label="Customer"
        hideLabel
        compact
        placeholder="All customers"
        search={customerSearch}
        selected={customer ? [{ id: customer.id, label: customer.name }] : []}
        onChange={(next) => apply({ customerId: next[0]?.id ?? null })}
        emptyText="No customers found"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted md:col-span-2 xl:col-span-1">
        <label htmlFor="fu-from">{view === 'completed' ? 'Follow-up date' : 'Next follow-up'} from</label>
        <input id="fu-from" type="date" value={params.get('dateFrom') ?? ''} max={params.get('dateTo') ?? undefined} onChange={(e) => apply({ dateFrom: e.target.value || null })} className="field-input h-10 w-auto" />
        <label htmlFor="fu-to">to</label>
        <input id="fu-to" type="date" value={params.get('dateTo') ?? ''} min={params.get('dateFrom') ?? undefined} onChange={(e) => apply({ dateTo: e.target.value || null })} className="field-input h-10 w-auto" />
      </div>
      <button
        type="button"
        className="btn-secondary h-10"
        disabled={!FILTER_KEYS.some((k) => params.get(k)) || pending}
        onClick={() => startTransition(() => router.push(view ? `${pathname}?view=${view}` : pathname))}
      >
        <IconRefresh size={16} /> Clear Filters
      </button>
    </div>
  );
}
