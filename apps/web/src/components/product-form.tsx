'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from '@/lib/inventory-actions';
import type { Company, ProductCategory } from '@/lib/types';

interface SpecRow {
  id: number;
  key: string;
  value: string;
}

interface Props {
  companies: Company[];
  categories: ProductCategory[];
  stockTrackingEnabled: boolean;
  initialValues?: Record<string, string>;
  initialSpecifications?: Record<string, string> | null;
  /** Present when editing an existing product. */
  productId?: string;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving...' : label}
    </button>
  );
}

export function ProductForm({
  companies,
  categories,
  stockTrackingEnabled,
  initialValues = {},
  initialSpecifications,
  productId,
}: Props) {
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    productId ? updateProductAction.bind(null, productId) : createProductAction,
    {},
  );

  const [specs, setSpecs] = useState<SpecRow[]>(() => {
    const entries = Object.entries(initialSpecifications ?? {});
    if (entries.length === 0) return [{ id: 0, key: '', value: '' }];
    return entries.map(([key, value], index) => ({ id: index, key, value }));
  });

  const initial = (field: string): string =>
    state.values?.[field] ?? initialValues[field] ?? '';

  const addSpecRow = (): void =>
    setSpecs((rows) => [...rows, { id: Date.now(), key: '', value: '' }]);

  const removeSpecRow = (id: number): void =>
    setSpecs((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.id !== id)));

  const updateSpec = (id: number, field: 'key' | 'value', next: string): void =>
    setSpecs((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: next } : row)),
    );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5"
        >
          <p className="text-sm font-medium text-danger">{state.error}</p>
          {state.fieldErrors && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-danger/90">
              {state.fieldErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-ink">Product details</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="field-label">
              Product name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={initial('name')}
              className="field-input"
              placeholder="Latitude 3540 Business Laptop"
            />
          </div>

          <div>
            <label htmlFor="companyId" className="field-label">
              Brand <span className="text-danger">*</span>
            </label>
            <select
              id="companyId"
              name="companyId"
              required
              defaultValue={initial('companyId')}
              className="field-input"
              // The brand determines model-number uniqueness, so it is fixed
              // once the product exists.
              disabled={Boolean(productId)}
            >
              <option value="">Select a brand</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            {productId && (
              <p className="field-hint">
                The brand cannot be changed after creation.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="modelNumber" className="field-label">
              Model number <span className="text-danger">*</span>
            </label>
            <input
              id="modelNumber"
              name="modelNumber"
              required
              defaultValue={initial('modelNumber')}
              className="field-input"
              placeholder="LAT-3540-I5"
            />
            <p className="field-hint">Must be unique within the brand.</p>
          </div>

          <div>
            <label htmlFor="designNumber" className="field-label">
              Design / reference number
            </label>
            <input
              id="designNumber"
              name="designNumber"
              defaultValue={initial('designNumber')}
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="categoryId" className="field-label">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={initial('categoryId')}
              className="field-input"
            >
              <option value="">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="description" className="field-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={initial('description')}
              className="field-input"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-border pt-5">
        <legend className="text-lg font-semibold text-ink">
          Technical specifications
        </legend>
        <p className="text-sm text-ink-muted">
          Name and value pairs, for example &ldquo;Processor&rdquo; /
          &ldquo;Intel i5-1335U&rdquo;. Rows left blank are ignored.
        </p>

        <div className="space-y-2">
          {specs.map((row) => (
            <div key={row.id} className="flex flex-wrap items-start gap-2">
              <input
                name="specKey"
                value={row.key}
                onChange={(e) => updateSpec(row.id, 'key', e.target.value)}
                className="field-input w-full sm:w-56"
                placeholder="Specification"
                aria-label="Specification name"
              />
              <input
                name="specValue"
                value={row.value}
                onChange={(e) => updateSpec(row.id, 'value', e.target.value)}
                className="field-input w-full flex-1 sm:w-auto"
                placeholder="Value"
                aria-label="Specification value"
              />
              <button
                type="button"
                onClick={() => removeSpecRow(row.id)}
                className="btn-secondary"
                disabled={specs.length === 1}
                aria-label="Remove this specification"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addSpecRow} className="btn-secondary">
          Add specification
        </button>
      </fieldset>

      {stockTrackingEnabled && (
        <fieldset className="space-y-4 border-t border-border pt-5">
          <legend className="text-lg font-semibold text-ink">Stock</legend>
          <div className="max-w-xs">
            <label htmlFor="reorderLevel" className="field-label">
              Reorder level
            </label>
            <input
              id="reorderLevel"
              name="reorderLevel"
              type="number"
              min={0}
              defaultValue={initial('reorderLevel')}
              className="field-input"
            />
            <p className="field-hint">
              Flagged as low stock at or below this quantity. Leave blank to
              skip reorder reporting for this product.
            </p>
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <SubmitButton label={productId ? 'Save changes' : 'Save product'} />
        <Link
          href={productId ? `/products/${productId}` : '/products'}
          className="btn-secondary"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
