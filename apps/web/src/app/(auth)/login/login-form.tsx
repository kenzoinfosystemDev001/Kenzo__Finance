'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/lib/auth-actions';
import { IconArrowRight, IconEye, IconMail, IconShield } from '@/components/icons';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1d4fd8] to-[#2f6ef5] text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? 'Signing in...' : (<>Sign In <IconArrowRight size={18} /></>)}
    </button>
  );
}

function IconLock({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconEyeOff({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

const inputClass =
  'h-12 w-full rounded-xl border border-[#d5ddea] bg-white pl-11 pr-4 text-base text-[#0d162d] placeholder:text-[#8a96ab] focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15';

export function LoginForm({ supportEmail }: { supportEmail: string | null }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-2 flex items-center gap-2 text-base font-semibold text-[#0d162d]">
          <IconMail size={18} /> Email Address
        </label>
        <div className="relative">
          <IconMail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a96ab]" />
          <input id="email" name="email" type="email" autoComplete="username" required placeholder="Enter your email address" className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="mb-2 flex items-center gap-2 text-base font-semibold text-[#0d162d]">
          <IconLock /> Password
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a96ab]">
            <IconLock />
          </span>
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#5b6880] hover:bg-[#eef3fc]"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? <IconEyeOff /> : <IconEye size={18} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex cursor-pointer items-center gap-2 text-[#0d162d]">
          <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded accent-[#1d4fd8]" />
          Remember Me
        </label>
        <button type="button" onClick={() => setShowHelp((value) => !value)} className="font-medium text-[#1d4fd8] hover:underline" aria-expanded={showHelp}>
          Forgot Password?
        </button>
      </div>

      {showHelp && (
        <p role="status" className="rounded-xl border border-[#c9daff] bg-[#eef4ff] px-3 py-2.5 text-sm text-[#28406e]">
          Passwords are reset by your administrator.
          {supportEmail ? (
            <>
              {' '}Email{' '}
              <a href={`mailto:${supportEmail}?subject=${encodeURIComponent('Password reset request')}`} className="font-medium text-[#1d4fd8] underline">
                {supportEmail}
              </a>{' '}
              with the address you sign in with.
            </>
          ) : (
            ' Please contact them to have it reset.'
          )}
        </p>
      )}

      <SubmitButton />

      {supportEmail && (
        <>
          <div className="flex items-center gap-3 text-sm text-[#5b6880]">
            <span aria-hidden className="h-px flex-1 bg-[#dbe2ee]" />
            Need access or help?
            <span aria-hidden className="h-px flex-1 bg-[#dbe2ee]" />
          </div>
          <a
            href={`mailto:${supportEmail}`}
            className="mx-auto flex w-fit items-center gap-2 rounded-full border border-[#d5ddea] bg-[#f4f7fc] px-6 py-2.5 text-sm font-medium text-[#0d162d] transition hover:border-[#2563eb] hover:bg-white"
          >
            <IconShield size={16} className="text-[#1d4fd8]" />
            Contact Administrator
          </a>
        </>
      )}
    </form>
  );
}
