'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { Company, ProductCategory } from '@/lib/types';

/**
 * Catalogue search. Filters live in the URL and are applied by the server, so
 * results stay correct across pages and a filtered view is shareable.
 */
export function ProductFilters({
  companies,
  categories,
  showStockFilters,
}: {
  companies: Company[];
  categories: ProductCategory[];
  showStockFilters: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      searchParams.get('categoryId') ||
        searchParams.get('modelNumber') ||
        searchParams.get('designNumber') ||
        searchParams.get('lowStockOnly') ||
        searchParams.get('outOfStockOnly') ||
        searchParams.get('includeArchived'),
    ),
  );

  const submit = (formData: FormData): void => {
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }
    // A filter change returns to page 1; page 7 of a new result set is empty.
    params.delete('page');
    router.push(`/products?${params.toString()}`);
  };

  const current = (key: string): string => searchParams.get(key) ?? '';

  return (
    <form action={submit} className="card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="search" className="field-label">
            Search
          </label>
          <input
            id="search"
            name="search"
            type="search"
            defaultValue={current('search')}
            className="field-input"
            placeholder="Name, code, model, design number or description"
          />
        </div>

        <div className="w-48">
          <label htmlFor="companyId" className="field-label">
            Brand
          </label>
          <select
            id="companyId"
            name="companyId"
            defaultValue={current('companyId')}
            className="field-input"
          >
            <option value="">All brands</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn-primary">
          Search
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? 'Hide filters' : 'More filters'}
        </button>

        {searchParams.size > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/products')}
          >
            Clear
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="categoryId" className="field-label">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={current('categoryId')}
              className="field-input"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="modelNumber" className="field-label">
              Model number
            </label>
            <input
              id="modelNumber"
              name="modelNumber"
              defaultValue={current('modelNumber')}
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="designNumber" className="field-label">
              Design number
            </label>
            <input
              id="designNumber"
              name="designNumber"
              defaultValue={current('designNumber')}
              className="field-input"
            />
          </div>

          <div className="flex flex-wrap items-center gap-5 sm:col-span-2 lg:col-span-3">
            {showStockFilters && (
              <>
                <label className="flex items-center gap-2 text-base">
                  <input
                    name="lowStockOnly"
                    type="checkbox"
                    value="true"
                    defaultChecked={current('lowStockOnly') === 'true'}
                    className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
                  />
                  Low stock only
                </label>

                <label className="flex items-center gap-2 text-base">
                  <input
                    name="outOfStockOnly"
                    type="checkbox"
                    value="true"
                    defaultChecked={current('outOfStockOnly') === 'true'}
                    className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
                  />
                  Out of stock only
                </label>
              </>
            )}

            <label className="flex items-center gap-2 text-base">
              <input
                name="includeArchived"
                type="checkbox"
                value="true"
                defaultChecked={current('includeArchived') === 'true'}
                className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
              />
              Include archived products
            </label>
          </div>
        </div>
      )}
    </form>
  );
}
