'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createProductAction,
  type CatalogueFormState,
} from '@/lib/catalogue-actions';
import type { Company } from '@/lib/types';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Adding...' : 'Add product'}
    </button>
  );
}

export function CreateProductForm({
  companies,
  categories,
}: {
  companies: Company[];
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState<CatalogueFormState, FormData>(
    createProductAction,
    {},
  );

  if (companies.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add a brand before creating products &mdash; every product belongs to one.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="name" className="field-label">
            Product name
          </label>
          <input
            id="name"
            name="name"
            required
            className="field-input"
            placeholder="Latitude 3540 Business Laptop"
          />
        </div>

        <div>
          <label htmlFor="companyId" className="field-label">
            Brand
          </label>
          <select id="companyId" name="companyId" required className="field-input">
            <option value="">Select</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
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
            required
            className="field-input"
            placeholder="LAT-3540-I5"
          />
        </div>

        <div>
          <label htmlFor="categoryId" className="field-label">
            Category
          </label>
          <select id="categoryId" name="categoryId" className="field-input">
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label htmlFor="designNumber" className="field-label">
            Design number
          </label>
          <input id="designNumber" name="designNumber" className="field-input" />
        </div>

        <div className="min-w-[240px] flex-1">
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <input id="description" name="description" className="field-input" />
        </div>

        <SubmitButton />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-success">
          {state.success}
        </p>
      )}
    </form>
  );
}
