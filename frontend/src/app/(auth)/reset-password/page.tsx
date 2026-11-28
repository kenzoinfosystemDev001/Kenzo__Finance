import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../auth-card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  // The URL carries the reset token; never send it to another origin.
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password of at least 12 characters. Every signed-in session will be signed out.">
      {value ? (
        <ResetPasswordForm token={value} />
      ) : (
        <div className="space-y-5">
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger">
            This password reset link is invalid or incomplete. Request a new one.
          </div>
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-accent hover:text-accent-hover hover:underline">
            Request a new link
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
