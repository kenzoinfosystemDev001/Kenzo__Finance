'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createStockLocationAction,
  type StockFormState,
} from '@/lib/inventory-actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Adding...' : 'Add location'}
    </button>
  );
}

export function CreateLocationForm() {
  const [state, formAction] = useActionState<StockFormState, FormData>(
    createStockLocationAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="name" className="field-label">
            Location name
          </label>
          <input
            id="name"
            name="name"
            required
            className="field-input"
            placeholder="Main Store"
          />
        </div>

        <div className="w-32">
          <label htmlFor="code" className="field-label">
            Code
          </label>
          <input
            id="code"
            name="code"
            required
            className="field-input"
            placeholder="MAIN"
          />
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
