'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createCompanyAction,
  type CatalogueFormState,
} from '@/lib/catalogue-actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Adding...' : 'Add brand'}
    </button>
  );
}

export function CreateCompanyForm() {
  const [state, formAction] = useActionState<CatalogueFormState, FormData>(
    createCompanyAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="name" className="field-label">
            Brand name
          </label>
          <input
            id="name"
            name="name"
            required
            className="field-input"
            placeholder="Dell"
          />
        </div>

        <div className="w-32">
          <label htmlFor="code" className="field-label">
            Short code
          </label>
          <input id="code" name="code" className="field-input" placeholder="DELL" />
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
