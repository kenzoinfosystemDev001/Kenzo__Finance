'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IconEye } from '@/components/icons';

/** Pieces shared by the sign-in, forgot-password and reset-password forms. */

export function IconLock({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconEyeOff({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function fieldClass(hasError: boolean): string {
  return [
    'h-12 w-full rounded-xl border bg-white pl-11 text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-4',
    hasError
      ? 'border-danger focus:border-danger focus:ring-danger/15'
      : 'border-border focus:border-accent focus:ring-accent/20',
  ].join(' ');
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function FormAlert({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger">
      {message}
    </div>
  );
}

export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:bg-border disabled:text-ink-subtle"
    >
      {pending ? (
        <>
          <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** Password input with the same show/hide toggle as the sign-in form. */
export function PasswordField({
  id,
  label,
  autoComplete,
  placeholder,
  error,
  autoFocus,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  placeholder: string;
  error?: string;
  autoFocus?: boolean;
  onChange?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
          <IconLock />
        </span>
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${fieldClass(Boolean(error))} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <IconEyeOff /> : <IconEye size={18} />}
        </button>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
