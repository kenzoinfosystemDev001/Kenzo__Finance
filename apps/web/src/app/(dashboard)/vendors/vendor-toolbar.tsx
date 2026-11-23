'use client';
import { ExportButton } from '@/components/export-button';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { IconRefresh, IconSearch } from '@/components/icons';
import { searchBrandsAction, searchProductsAction } from '@/lib/vendor-actions';

/**
 * Filter bar. Every filter is written to the URL and applied by the API, so
 * results are correct across pages and a filtered view can be shared.
 */
export function VendorToolbar({
  selectedBrand,
  selectedProduct,
  exportHref,
}: {
  selectedBrand: SearchOption | null;
  selectedProduct: SearchOption | null;
  exportHref: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');

  // Keep the box in sync when the header search changes the URL.
  useEffect(() => setSearch(searchParams.get('search') ?? ''), [searchParams]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // A new filter starts from page 1; page 7 of a smaller result is empty.
      params.delete('page');
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  const brandSearch = useCallback(
    async (term: string) =>
      (await searchBrandsAction(term)).map((brand) => ({ id: brand.id, label: brand.name })),
    [],
  );

  const productSearch = useCallback(
    async (term: string) =>
      (await searchProductsAction(term)).map((product) => ({
        id: product.id,
        label: product.name,
        detail: `${product.company.name} · ${product._count.models} model(s)`,
      })),
    [],
  );

  const hasFilters = ['search', 'status', 'companyId', 'productId', 'includeArchived'].some((key) =>
    searchParams.get(key),
  );

  return (
    <div className="card p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_200px_220px_auto_auto]">
        <form
          role="search"
          className="relative md:col-span-2 xl:col-span-1"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ search: search.trim() || null });
          }}
        >
          <label htmlFor="vendor-search" className="sr-only">
            Search vendors
          </label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="vendor-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if ((searchParams.get('search') ?? '') !== search.trim()) apply({ search: search.trim() || null });
            }}
            className="field-input h-10 pl-10"
          />
        </form>

        <div>
          <label htmlFor="status-filter" className="sr-only">
            Status
          </label>
          <select
            id="status-filter"
            value={searchParams.get('includeArchived') === 'true' ? 'ARCHIVED' : searchParams.get('status') ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              apply(
                value === 'ARCHIVED'
                  ? { status: null, includeArchived: 'true' }
                  : { status: value || null, includeArchived: null },
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

        <SearchSelect
          label="Product"
          hideLabel
          compact
          placeholder="All Products"
          search={productSearch}
          selected={selectedProduct ? [selectedProduct] : []}
          onChange={([product]) => apply({ productId: product?.id ?? null })}
          emptyText="No products found"
        />

        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!hasFilters || pending}
          onClick={() => {
            setSearch('');
            startTransition(() => router.push(pathname));
          }}
        >
          <IconRefresh size={16} />
          Clear Filters
        </button>

        {exportHref && (
          <>
            <ExportButton href={exportHref} label="CSV" />
            <ExportButton href={`${exportHref}${exportHref.includes('?') ? '&' : '?'}format=xlsx`} label="Excel (.xlsx)" />
          </>
        )}
      </div>
    </div>
  );
}

export function PageSizeSelect({ value, options = [10, 25, 50, 100] }: { value: number; options?: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Rows per page
      <select
        value={value}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('pageSize', event.target.value);
          params.delete('page');
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="field-input h-8 w-auto py-0 pr-8"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
