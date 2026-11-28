import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { getLoginBranding, loginBackgroundUrl } from '@/lib/branding';
import { ApiUnavailable } from '@/components/api-unavailable';
import { BackgroundImage } from '@/components/background-image';
import { BrandLogo } from '@/components/brand-logo';
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
  // Admin-chosen image (Admin -> Appearance, stored durably). Without one, the solid panel shows.
  const background = branding.backgroundId ? loginBackgroundUrl(branding.backgroundId) : null;
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Brand panel, desktop and laptop. */}
      <section
        aria-label="Kenzo Infosystems"
        className="relative hidden overflow-hidden bg-sidebar text-sidebar-ink lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16"
      >
        <BackgroundImage src={background} overlayClassName="bg-sidebar/85" className="absolute inset-0" />

        <div className="relative flex items-center gap-3">
          <BrandLogo className="h-14 w-14 shrink-0" priority />
          <p className="text-xl font-semibold tracking-[0.01em]">
            Kenzo Infosystems <span className="text-sidebar-indicator">Pvt Ltd</span>
          </p>
        </div>

        <div className="relative max-w-xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Business Management Software</h1>
        </div>

        <p className="relative text-sm text-sidebar-muted">&copy; {year} Kenzo Infosystems. All rights reserved.</p>
      </section>

      {/* Sign-in card. On small screens it carries the logo and name itself. */}
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl bg-surface px-6 py-8 shadow-popover ring-1 ring-border sm:px-10 sm:py-10">
          <div className="flex flex-col items-center text-center">
            <BrandLogo className="h-16 w-16" priority />
            <p className="mt-3 text-lg font-semibold text-ink">
              Kenzo Infosystems <span className="text-highlight">Pvt Ltd</span>
            </p>
          </div>

          <h2 className="mt-8 text-center text-2xl font-semibold text-ink">Sign in</h2>

          {reason === 'session-expired' && (
            <div role="status" className="mt-6 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              Your session expired. Please sign in again.
            </div>
          )}
          {reason === 'password-reset' && (
            <div role="status" className="mt-6 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
              Your password was reset and every session was signed out. Sign in with your new password.
            </div>
          )}
          {reason === 'password-changed' && (
            <div role="status" className="mt-6 rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
              Your password was changed and every session was signed out. Sign in with your new password.
            </div>
          )}

          <div className="mt-6">
            <LoginForm />
          </div>

          <p className="mt-8 border-t border-border pt-5 text-center text-xs text-ink-subtle">
            &copy; {year} Kenzo Infosystems. All rights reserved.
          </p>
        </div>
      </section>
    </main>
  );
}
