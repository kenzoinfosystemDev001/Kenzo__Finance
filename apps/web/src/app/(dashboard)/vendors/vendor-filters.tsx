'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { VendorCategory } from '@/lib/types';

/**
 * Filter bar. Filters are written to the URL and applied by the server, so a
 * filtered view is shareable and pagination stays consistent with the filters.
 */
export function VendorFilters({ categories }: { categories: VendorCategory[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      searchParams.get('companyName') ||
        searchParams.get('productName') ||
        searchParams.get('modelNumber') ||
        searchParams.get('city') ||
        searchParams.get('categoryIds') ||
        searchParams.get('status') ||
        searchParams.get('includeArchived'),
    ),
  );

  const submit = (formData: FormData): void => {
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }

    // Any filter change returns to page 1; staying on page 7 of a new result
    // set would show an empty table.
    params.delete('page');
    router.push(`/vendors?${params.toString()}`);
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
            placeholder="Vendor name, code, contact, email, phone, city or GSTIN"
          />
        </div>

        <button type="submit" className="btn-primary">
          Search
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? 'Hide filters' : 'More filters'}
        </button>

        {searchParams.size > 0 && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => router.push('/vendors')}
          >
            Clear
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="companyName" className="field-label">
              Brand
            </label>
            <input
              id="companyName"
              name="companyName"
              defaultValue={current('companyName')}
              className="field-input"
              placeholder="Dell, HP, Lenovo"
            />
          </div>

          <div>
            <label htmlFor="productName" className="field-label">
              Product
            </label>
            <input
              id="productName"
              name="productName"
              defaultValue={current('productName')}
              className="field-input"
              placeholder="Laptop, monitor"
            />
          </div>

          <div>
            <label htmlFor="modelNumber" className="field-label">
              Model / design number
            </label>
            <input
              id="modelNumber"
              name="modelNumber"
              defaultValue={current('modelNumber')}
              className="field-input"
              placeholder="LAT-3540"
            />
          </div>

          <div>
            <label htmlFor="city" className="field-label">
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={current('city')}
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="categoryIds" className="field-label">
              Category
            </label>
            <select
              id="categoryIds"
              name="categoryIds"
              defaultValue={current('categoryIds')}
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
            <label htmlFor="status" className="field-label">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={current('status')}
              className="field-input"
            >
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <input
              id="includeArchived"
              name="includeArchived"
              type="checkbox"
              value="true"
              defaultChecked={current('includeArchived') === 'true'}
              className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
            />
            <label htmlFor="includeArchived" className="text-base text-ink">
              Include archived vendors
            </label>
          </div>
        </div>
      )}
    </form>
  );
}
