'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, type FormEvent } from 'react';
import { resetPasswordAction, type PasswordResetFormState } from '@/lib/password-reset-actions';
import { FormAlert, PasswordField, SubmitButton } from '../auth-ui';

interface FieldErrors {
  newPassword?: string;
  confirmPassword?: string;
}

function validate(newPassword: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  if (newPassword.length < 12) errors.newPassword = 'Use at least 12 characters.';
  else if (newPassword.length > 256) errors.newPassword = 'Use at most 256 characters.';
  if (!confirmPassword) errors.confirmPassword = 'Re-enter the new password.';
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The passwords do not match.';
  return errors;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<PasswordResetFormState, FormData>(resetPasswordAction, {});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // The token now lives in the form; drop it from the address bar and the
  // history entry so it is not left behind or shared by copying the URL.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', '/reset-password');
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const errors = validate(String(data.get('newPassword') ?? ''), String(data.get('confirmPassword') ?? ''));
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) event.preventDefault();
  }

  function clear(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormAlert message={state.error} />
      <input type="hidden" name="token" value={token} />

      <PasswordField
        id="newPassword"
        label="New password"
        autoComplete="new-password"
        placeholder="At least 12 characters"
        autoFocus
        error={fieldErrors.newPassword}
        onChange={() => clear('newPassword')}
      />
      <PasswordField
        id="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Re-enter the new password"
        error={fieldErrors.confirmPassword}
        onChange={() => clear('confirmPassword')}
      />

      <SubmitButton label="Reset password" pendingLabel="Resetting..." />

      <div className="flex justify-between text-sm">
        <Link href="/forgot-password" className="font-semibold text-accent hover:text-accent-hover hover:underline">
          Request a new link
        </Link>
        <Link href="/login" className="font-semibold text-accent hover:text-accent-hover hover:underline">
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
