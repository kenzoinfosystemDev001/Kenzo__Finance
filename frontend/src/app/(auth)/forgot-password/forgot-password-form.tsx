'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, type PasswordResetFormState } from '@/lib/password-reset-actions';
import { IconCheckCircle, IconMail } from '@/components/icons';
import { FormAlert, SubmitButton, fieldClass } from '../auth-ui';

const FALLBACK_MESSAGE =
  'If an active account exists for that email address, a password reset link has been sent. The link expires in 30 minutes.';

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<PasswordResetFormState, FormData>(forgotPasswordAction, {});

  if (state.sent) {
    return (
      <div className="space-y-5">
        <div role="status" className="flex gap-3 rounded-xl border border-success/30 bg-success-subtle px-4 py-3 text-sm text-success">
          <IconCheckCircle size={18} className="mt-0.5 shrink-0" />
          <p>{state.message ?? FALLBACK_MESSAGE}</p>
        </div>
        <p className="text-sm text-ink-subtle">
          Didn&apos;t get it? Check your spam folder, or contact your administrator if the problem continues.
        </p>
        <Link href="/login" className="link-pill block text-center text-sm font-semibold">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert message={state.error} />

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-ink">
          Email address
        </label>
        <div className="relative">
          <IconMail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="Enter your email address"
            className={fieldClass(false)}
          />
        </div>
      </div>

      <SubmitButton label="Send reset link" pendingLabel="Sending..." />

      <Link href="/login" className="link-pill block text-center text-sm font-semibold">
        Back to sign in
      </Link>
    </form>
  );
}
