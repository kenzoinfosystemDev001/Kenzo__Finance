'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/lib/auth-actions';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in...' : 'Sign in'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="field-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="field-input"
          placeholder="you@kenzoinfosystems.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field-input"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
