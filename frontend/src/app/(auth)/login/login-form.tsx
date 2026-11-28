'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/lib/auth-actions';
import Link from 'next/link';
import { IconArrowRight, IconEye, IconMail } from '@/components/icons';
import { IconEyeOff, IconLock } from '../auth-ui';

function SubmitButton() {
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
          Signing in...
        </>
      ) : (
        <>
          Sign In <IconArrowRight size={18} />
        </>
      )}
    </button>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

/** Checks what can be known without the server. The server still decides whether the credentials are right. */
function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

function fieldClass(hasError: boolean): string {
  return [
    'h-12 w-full rounded-xl border bg-white pl-11 text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-4',
    hasError
      ? 'border-danger focus:border-danger focus:ring-danger/15'
      : 'border-border focus:border-accent focus:ring-accent/20',
  ].join(' ');
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Controlled so a failed sign-in keeps the address. The password is
  // deliberately left uncontrolled; React resets it after a form action.
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const errors = validate(String(data.get('email') ?? '').trim(), String(data.get('password') ?? ''));
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) event.preventDefault();
  }

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5" noValidate>
      {state.error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger">
          {state.error}
        </div>
      )}

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
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={fieldClass(Boolean(fieldErrors.email))}
          />
        </div>
        <FieldError id="email-error" message={fieldErrors.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-ink">
          Password
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle">
            <IconLock />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            onChange={() => clearFieldError('password')}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={`${fieldClass(Boolean(fieldErrors.password))} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? <IconEyeOff /> : <IconEye size={18} />}
          </button>
        </div>
        <FieldError id="password-error" message={fieldErrors.password} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
          Remember me
        </label>
        <Link href="/forgot-password" className="text-sm font-semibold text-accent hover:text-accent-hover hover:underline">
          Forgot password?
        </Link>
      </div>

      <SubmitButton />
    </form>
  );
}
