import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { ApiUnavailable } from '@/components/api-unavailable';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const session = await getSession();

  // Showing the sign-in form while the backend is down would just produce a
  // confusing failure on submit.
  if (session.status === 'api-unavailable') {
    return <ApiUnavailable detail={session.detail} />;
  }

  if (session.status === 'authenticated') {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-6 flex items-center gap-2.5">
            <svg viewBox="0 0 40 32" className="h-9 w-11" aria-hidden>
              <path d="M20 2 36 30h-8L20 15 12 30H4Z" fill="rgb(var(--accent))" />
              <path d="M20 15 28 30h-7.5L17 23.5Z" fill="#60a5fa" />
            </svg>
            <div>
              <p className="text-base font-bold leading-tight tracking-wide text-ink">
                KENZO INFOSYSTEMS
              </p>
              <p className="text-xs leading-tight text-ink-subtle">
                Business Management
              </p>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-base text-ink-muted">
            Use the credentials issued by your administrator.
          </p>
        </div>

        {reason === 'session-expired' && (
          <div
            role="status"
            className="mb-4 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning"
          >
            Your session expired. Please sign in again.
          </div>
        )}

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
