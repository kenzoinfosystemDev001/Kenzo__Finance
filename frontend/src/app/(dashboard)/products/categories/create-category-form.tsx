'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createProductCategoryAction,
  type StockFormState,
} from '@/lib/inventory-actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Adding...' : 'Add category'}
    </button>
  );
}

export function CreateCategoryForm() {
  const [state, formAction] = useActionState<StockFormState, FormData>(
    createProductCategoryAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="name" className="field-label">
            Category name
          </label>
          <input
            id="name"
            name="name"
            required
            className="field-input"
            placeholder="Enter category name"
          />
        </div>

        <div className="min-w-[220px] flex-1">
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
