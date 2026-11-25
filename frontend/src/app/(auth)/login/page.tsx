import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { getLoginBranding } from '@/lib/branding';
import { ApiUnavailable } from '@/components/api-unavailable';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const session = await getSession();

  // Showing the sign-in form while the backend is down would just produce a
  // confusing failure on submit.
  if (session.status === 'api-unavailable') return <ApiUnavailable detail={session.detail} />;
  if (session.status === 'authenticated') redirect('/dashboard');

  const branding = await getLoginBranding();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <section className="w-full max-w-md rounded-2xl bg-surface px-6 py-8 shadow-popover ring-1 ring-border sm:px-10 sm:py-10">
          <h2 className="text-2xl font-semibold text-ink">Sign in to your account</h2>
          <p className="mt-1 text-sm text-ink-subtle">Enter your credentials to access your workspace.</p>

          {reason === 'session-expired' && (
            <div role="status" className="mt-6 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              Your session expired. Please sign in again.
            </div>
          )}
          {reason === 'password-changed' && (
            <div role="status" className="mt-6 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
              Your password was changed and every session was signed out. Sign in with your new password.
            </div>
          )}

          <div className="mt-6">
            <LoginForm supportEmail={branding.supportEmail} />
          </div>

          <p className="mt-8 border-t border-border pt-5 text-center text-xs text-ink-subtle">
            Authorized access only.
          </p>
      </section>
    </main>
  );
}
