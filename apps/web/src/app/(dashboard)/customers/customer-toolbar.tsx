'use client';
import { ExportButton } from '@/components/export-button';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { IconRefresh, IconSearch } from '@/components/icons';
import type { CustomerCategory } from '@/lib/types';

const FILTER_KEYS = ['search', 'customerType', 'categoryId', 'industry', 'status', 'country', 'state', 'createdFrom', 'createdTo'];

/** Customer filters: written to the URL and applied by the API, so they combine and paginate correctly. */
export function CustomerToolbar({ categories, exportHref }: { categories: CustomerCategory[]; exportHref: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState({ search: '', industry: '', country: '', state: '' });

  useEffect(() => {
    setText({
      search: params.get('search') ?? '',
      industry: params.get('industry') ?? '',
      country: params.get('country') ?? '',
      state: params.get('state') ?? '',
    });
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

  const commitText = (field: keyof typeof text) => {
    const value = text[field].trim();
    if ((params.get(field) ?? '') !== value) apply({ [field]: value || null });
  };

  const textInput = (field: keyof typeof text, label: string, placeholder: string) => (
    <div>
      <label htmlFor={`f-${field}`} className="sr-only">{label}</label>
      <input
        id={`f-${field}`}
        value={text[field]}
        onChange={(e) => setText((t) => ({ ...t, [field]: e.target.value }))}
        onBlur={() => commitText(field)}
        onKeyDown={(e) => e.key === 'Enter' && commitText(field)}
        placeholder={placeholder}
        className="field-input h-10"
      />
    </div>
  );

  const select = (field: string, label: string, options: Array<{ value: string; label: string }>, all: string) => (
    <div>
      <label htmlFor={`f-${field}`} className="sr-only">{label}</label>
      <select id={`f-${field}`} value={params.get(field) ?? ''} onChange={(e) => apply({ [field]: e.target.value || null })} className="field-input h-10">
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="card space-y-3 p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_150px_auto_auto]">
        <form role="search" className="relative md:col-span-2 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); commitText('search'); }}>
          <label htmlFor="customer-search" className="sr-only">Search customers</label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="customer-search"
            type="search"
            value={text.search}
            onChange={(e) => setText((t) => ({ ...t, search: e.target.value }))}
            onBlur={() => commitText('search')}
            placeholder="Name, code, contact, phone, email, GSTIN, city"
            className="field-input h-10 pl-10"
          />
        </form>
        {select('customerType', 'Customer type', [{ value: 'BUSINESS', label: 'Business' }, { value: 'INDIVIDUAL', label: 'Individual' }], 'Customer Type')}
        {select('categoryId', 'Category', categories.map((c) => ({ value: c.id, label: c.name })), 'Category')}
        {select('status', 'Status', [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }], 'Status')}
        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!FILTER_KEYS.some((k) => params.get(k)) || pending}
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <IconRefresh size={16} /> Clear Filters
        </button>
        {exportHref && (
          <>
          <ExportButton href={exportHref} label="CSV" />
          <ExportButton href={`${exportHref}${exportHref.includes('?') ? '&' : '?'}format=xlsx`} label="Excel (.xlsx)" />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(3,minmax(0,180px))_auto]">
        {textInput('industry', 'Industry', 'Industry')}
        {textInput('country', 'Country', 'Country')}
        {textInput('state', 'State', 'State')}
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted sm:col-span-3 xl:col-span-1">
          <label htmlFor="c-from">Created from</label>
          <input id="c-from" type="date" value={params.get('createdFrom') ?? ''} max={params.get('createdTo') ?? undefined} onChange={(e) => apply({ createdFrom: e.target.value || null })} className="field-input h-10 w-auto" />
          <label htmlFor="c-to">to</label>
          <input id="c-to" type="date" value={params.get('createdTo') ?? ''} min={params.get('createdFrom') ?? undefined} onChange={(e) => apply({ createdTo: e.target.value || null })} className="field-input h-10 w-auto" />
        </div>
      </div>
    </div>
  );
}
