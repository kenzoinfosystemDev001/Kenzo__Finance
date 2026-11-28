'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { IconDownload, IconRefresh, IconSearch } from '@/components/icons';
import { ENQUIRY_PRIORITIES, ENQUIRY_PRIORITY_LABELS, ENQUIRY_STATUS_GROUPS, ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS } from '@/lib/enquiry-labels';
import type { EnquiryAssignee, EnquirySource } from '@/lib/types';

const FILTER_KEYS = ['search', 'status', 'priority', 'sourceId', 'assignedToId', 'customerId', 'productId', 'dateFrom', 'dateTo', 'overdueOnly'];


/** Enquiry filters: written to the URL and applied by the API, so they combine and paginate correctly. */
export function EnquiryToolbar({
  sources,
  assignees,
  exportHref,
}: {
  sources: EnquirySource[];
  assignees: EnquiryAssignee[];
  exportHref: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState('');

  useEffect(() => setSearch(params.get('search') ?? ''), [params]);

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

  const statusOptions = [...ENQUIRY_STATUS_GROUPS, ...ENQUIRY_STATUSES.map((s) => ({ value: s, label: ENQUIRY_STATUS_LABELS[s] }))];

  return (
    <div className="card space-y-3 p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_150px_auto_auto]">
        <form role="search" className="relative md:col-span-2 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); commitSearch(); }}>
          <label htmlFor="enquiry-search" className="sr-only">Search enquiries</label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="enquiry-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={commitSearch}
            className="field-input h-10 pl-10"
          />
        </form>
        {select('status', 'Status', statusOptions, 'Status')}
        {select('priority', 'Priority', ENQUIRY_PRIORITIES.map((p) => ({ value: p, label: ENQUIRY_PRIORITY_LABELS[p] })), 'Priority')}
        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!FILTER_KEYS.some((k) => params.get(k)) || pending}
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <IconRefresh size={16} /> Clear Filters
        </button>
        {exportHref && (
          <a href={exportHref} className="btn-secondary h-10"><IconDownload size={16} /> Export</a>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(2,minmax(0,200px))_auto_auto]">
        {select('sourceId', 'Source', sources.map((s) => ({ value: s.id, label: s.isActive ? s.name : `${s.name} (inactive)` })), 'Source')}
        {select('assignedToId', 'Assigned to', assignees.map((a) => ({ value: a.id, label: a.fullName })), 'Assigned To')}
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted sm:col-span-2 xl:col-span-1">
          <label htmlFor="e-from">Enquiry date from</label>
          <input id="e-from" type="date" value={params.get('dateFrom') ?? ''} max={params.get('dateTo') ?? undefined} onChange={(e) => apply({ dateFrom: e.target.value || null })} className="field-input h-10 w-auto" />
          <label htmlFor="e-to">to</label>
          <input id="e-to" type="date" value={params.get('dateTo') ?? ''} min={params.get('dateFrom') ?? undefined} onChange={(e) => apply({ dateTo: e.target.value || null })} className="field-input h-10 w-auto" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={params.get('overdueOnly') === 'true'}
            onChange={(e) => apply({ overdueOnly: e.target.checked ? 'true' : null })}
            className="h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]"
          />
          Overdue follow-ups only
        </label>
      </div>
    </div>
  );
}
