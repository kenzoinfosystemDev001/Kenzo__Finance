'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  mapCompanyAction,
  mapProductAction,
  type MappingState,
} from '@/lib/vendor-actions';
import type { Company, Product } from '@/lib/types';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving...' : label}
    </button>
  );
}

function Feedback({ state }: { state: MappingState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="text-sm text-success">
        {state.success}
      </p>
    );
  }
  return null;
}

export function MapBrandForm({
  vendorId,
  companies,
}: {
  vendorId: string;
  companies: Company[];
}) {
  const [state, formAction] = useActionState<MappingState, FormData>(
    mapCompanyAction,
    {},
  );

  if (companies.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Every available brand is already mapped to this vendor.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="companyId" className="field-label">
            Add a brand
          </label>
          <select id="companyId" name="companyId" required className="field-input">
            <option value="">Select a brand</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-base">
          <input
            type="checkbox"
            name="isAuthorized"
            className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
          />
          Authorised partner
        </label>

        <input type="hidden" name="vendorId" value={vendorId} />
        <SubmitButton label="Map brand" />
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function MapProductForm({
  vendorId,
  products,
}: {
  vendorId: string;
  products: Product[];
}) {
  const [state, formAction] = useActionState<MappingState, FormData>(
    mapProductAction,
    {},
  );

  if (products.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No unmapped products available. Add products in the catalogue first.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="productId" className="field-label">
            Add a product
          </label>
          <select id="productId" name="productId" required className="field-input">
            <option value="">Select a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.company.name} &mdash; {product.name} ({product.modelNumber})
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label htmlFor="vendorSku" className="field-label">
            Vendor SKU
          </label>
          <input id="vendorSku" name="vendorSku" className="field-input" />
        </div>

        <div className="w-32">
          <label htmlFor="leadTimeDays" className="field-label">
            Lead time
          </label>
          <input
            id="leadTimeDays"
            name="leadTimeDays"
            type="number"
            min={0}
            max={3650}
            className="field-input"
            placeholder="Days"
          />
        </div>

        <label className="flex items-center gap-2 pb-2.5 text-base">
          <input
            type="checkbox"
            name="isPreferred"
            className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent"
          />
          Preferred
        </label>

        <input type="hidden" name="vendorId" value={vendorId} />
        <SubmitButton label="Map product" />
      </div>

      <p className="text-sm text-ink-subtle">
        The product&rsquo;s brand is mapped to this vendor automatically.
      </p>
      <Feedback state={state} />
    </form>
  );
}
