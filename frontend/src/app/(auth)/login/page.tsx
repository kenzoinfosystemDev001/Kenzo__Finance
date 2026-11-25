import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { getLoginBranding, loginBackgroundUrl } from '@/lib/branding';
import { ApiUnavailable } from '@/components/api-unavailable';
import { BrandLogo } from '@/components/brand-logo';
import { BackgroundImage } from '@/components/background-image';
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
  const background = branding.backgroundId ? loginBackgroundUrl(branding.backgroundId) : null;

  return (
    <main className="flex min-h-screen bg-canvas">
      {/* Brand panel (desktop). Background photo is optional, set in Settings -> Sign-in page. */}
      <section
        className="relative hidden w-[52%] flex-col justify-between overflow-hidden bg-sidebar px-12 py-12 text-sidebar-ink lg:flex xl:px-16"
        aria-label="Kenzo Infosystems"
      >
        {/* Admin-chosen image (Admin -> Appearance). Falls back to the plain slate panel. */}
        <BackgroundImage src={background} overlayClassName="bg-sidebar/85" className="absolute inset-0" />

        <div className="relative flex items-center gap-4">
          <BrandLogo className="h-14 w-14" priority />
          <div>
            <p className="text-xl font-bold leading-tight tracking-[0.14em]">KENZO INFOSYSTEMS</p>
            <p className="mt-1 text-sm text-sidebar-muted">Business Management Software</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Welcome to Kenzo Infosystems
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-sidebar-ink/90">
            Manage your business operations through one connected platform.
          </p>
        </div>

        <p className="relative text-sm text-sidebar-muted">
          &copy; {new Date().getFullYear()} Kenzo Infosystems. All rights reserved.
        </p>
      </section>

      {/* Sign-in card. On small screens the brand block inside the card stands in for the panel. */}
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl bg-surface px-6 py-8 shadow-popover ring-1 ring-border sm:px-10 sm:py-10">
          <div className="flex flex-col items-center text-center">
            <BrandLogo className="h-16 w-16" priority />
            <p className="mt-4 text-base font-bold tracking-[0.14em] text-ink">KENZO INFOSYSTEMS</p>
            <p className="mt-1 text-sm text-ink-subtle">Business Management Software</p>
          </div>

          <h2 className="mt-8 text-2xl font-semibold text-ink">Sign in to your account</h2>
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
        </div>
      </section>
    </main>
  );
}
