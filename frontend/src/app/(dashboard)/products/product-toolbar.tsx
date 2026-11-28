'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { IconDownload, IconRefresh, IconSearch } from '@/components/icons';
import { searchBrandsAction } from '@/lib/vendor-actions';
import { searchVendorsAction } from '@/lib/product-actions';
import type { ProductCategory } from '@/lib/types';

const FILTER_KEYS = ['search', 'companyId', 'categoryId', 'isActive', 'vendorId', 'createdFrom', 'createdTo', 'includeArchived'];

/** Product filters. Written to the URL and applied server-side, so they combine and paginate correctly. */
export function ProductToolbar({
  categories,
  selectedBrand,
  selectedVendor,
  exportHref,
}: {
  categories: ProductCategory[];
  selectedBrand: SearchOption | null;
  selectedVendor: SearchOption | null;
  exportHref: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get('search') ?? '');

  useEffect(() => setSearch(params.get('search') ?? ''), [params]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete('page');
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  const brandSearch = useCallback(async (term: string) => (await searchBrandsAction(term)).map((b) => ({ id: b.id, label: b.name })), []);
  const vendorSearch = useCallback((term: string) => searchVendorsAction(term), []);
  const hasFilters = FILTER_KEYS.some((key) => params.get(key));
  const status = params.get('includeArchived') === 'true' ? 'ARCHIVED' : params.get('isActive') === 'true' ? 'ACTIVE' : params.get('isActive') === 'false' ? 'INACTIVE' : '';

  return (
    <div className="card space-y-3 p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_190px_170px_auto_auto]">
        <form
          role="search"
          className="relative md:col-span-2 xl:col-span-1"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ search: search.trim() || null });
          }}
        >
          <label htmlFor="product-search" className="sr-only">Search products</label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="product-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if ((params.get('search') ?? '') !== search.trim()) apply({ search: search.trim() || null });
            }}
            className="field-input h-10 pl-10"
          />
        </form>

        <SearchSelect
          label="Brand"
          hideLabel
          compact
          placeholder="All Brands"
          search={brandSearch}
          selected={selectedBrand ? [selectedBrand] : []}
          onChange={([brand]) => apply({ companyId: brand?.id ?? null })}
          emptyText="No brands found"
        />

        <div>
          <label htmlFor="category-filter" className="sr-only">Category</label>
          <select id="category-filter" value={params.get('categoryId') ?? ''} onChange={(event) => apply({ categoryId: event.target.value || null })} className="field-input h-10">
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status-filter" className="sr-only">Status</label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              apply(
                value === 'ARCHIVED'
                  ? { isActive: null, includeArchived: 'true' }
                  : { isActive: value === 'ACTIVE' ? 'true' : value === 'INACTIVE' ? 'false' : null, includeArchived: null },
              );
            }}
            className="field-input h-10"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Include archived</option>
          </select>
        </div>

        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!hasFilters || pending}
          onClick={() => {
            setSearch('');
            startTransition(() => router.push(pathname));
          }}
        >
          <IconRefresh size={16} /> Clear Filters
        </button>

        {exportHref && (
          <a href={exportHref} className="btn-secondary h-10">
            <IconDownload size={16} /> Export
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
        <SearchSelect
          label="Vendor"
          hideLabel
          compact
          placeholder="Any vendor"
          search={vendorSearch}
          selected={selectedVendor ? [selectedVendor] : []}
          onChange={([vendor]) => apply({ vendorId: vendor?.id ?? null })}
          emptyText="No vendors found"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <label htmlFor="created-from">Created from</label>
          <input id="created-from" type="date" value={params.get('createdFrom') ?? ''} max={params.get('createdTo') ?? undefined} onChange={(event) => apply({ createdFrom: event.target.value || null })} className="field-input h-10 w-auto" />
          <label htmlFor="created-to">to</label>
          <input id="created-to" type="date" value={params.get('createdTo') ?? ''} min={params.get('createdFrom') ?? undefined} onChange={(event) => apply({ createdTo: event.target.value || null })} className="field-input h-10 w-auto" />
        </div>
      </div>
    </div>
  );
}
