import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { getLoginBranding, loginBackgroundUrl } from '@/lib/branding';
import { ApiUnavailable } from '@/components/api-unavailable';
import { BrandLogo } from '@/components/brand-logo';
import { BackgroundImage } from '@/components/background-image';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const HIGHLIGHTS = [
  { label: 'Boost Productivity', icon: 'M4 17l5-5 4 4 7-8M15 8h5v5' },
  { label: 'Ensure Security', icon: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3zM9 12l2 2 4-4' },
  { label: 'Grow Your Business', icon: 'M3 18h18M6 18V11M11 18V6M16 18v-9M21 18v-4' },
] as const;

function Highlight({ label, icon }: { label: string; icon: string }) {
  return (
    <li className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-sidebar-ink">
          <path d={icon} />
        </svg>
      </span>
      <span className="text-sm font-medium text-sidebar-ink">{label}</span>
    </li>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const session = await getSession();

  // Showing the sign-in form while the backend is down would just produce a
  // confusing failure on submit.
  if (session.status === 'api-unavailable') return <ApiUnavailable detail={session.detail} />;
  if (session.status === 'authenticated') redirect('/dashboard');

  const branding = await getLoginBranding();
  // Admin-chosen image (Admin -> Appearance, stored in the database). Without one, the navy gradient shows.
  const background = branding.backgroundId ? loginBackgroundUrl(branding.backgroundId) : null;
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      {/* Brand panel, desktop and laptop. */}
      <section
        aria-label="Kenzo Infosystems"
        className="relative hidden overflow-hidden bg-gradient-to-br from-sidebar via-sidebar to-[#0b2a6b] text-sidebar-ink lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16"
      >
        <BackgroundImage src={background} overlayClassName="bg-sidebar/85" className="absolute inset-0" />
        {/* Subtle royal-blue glow over the navy base. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.35),transparent_55%)]" />

        <div className="relative flex items-center gap-4">
          <BrandLogo className="h-16 w-16 shrink-0" priority />
          <div>
            <p className="text-2xl font-bold leading-tight tracking-[0.14em]">KENZO</p>
            <p className="text-xs font-medium tracking-[0.42em] text-sidebar-muted">INFOSYSTEMS</p>
          </div>
        </div>

        <div className="relative max-w-xl">
          <p className="text-base font-medium text-sidebar-muted">Innovative Solutions. Smarter Business.</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Business Management <span className="text-sky-300">Software</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-sidebar-ink/90">
            Streamline your business operations with powerful, integrated solutions.
          </p>
          <ul className="mt-10 grid grid-cols-3 gap-4">
            {HIGHLIGHTS.map((item) => (
              <Highlight key={item.label} label={item.label} icon={item.icon} />
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-sidebar-muted">&copy; {year} Kenzo Infosystems. All rights reserved.</p>
      </section>

      {/* Sign-in card. On small screens it carries the logo and name itself. */}
      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl bg-surface px-6 py-8 shadow-popover ring-1 ring-border sm:px-10 sm:py-10">
          <div className="flex flex-col items-center text-center">
            <BrandLogo className="h-20 w-20" priority />
            <p className="mt-3 text-xl font-extrabold tracking-[0.16em] text-sidebar">KENZO</p>
            <p className="text-xs font-medium tracking-[0.42em] text-ink-subtle">INFOSYSTEMS</p>
          </div>

          <h2 className="mt-8 text-center text-3xl font-semibold text-ink">Welcome Back!</h2>
          <p className="mt-2 text-center text-sm text-ink-subtle">Sign in to your account to continue.</p>

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
            &copy; {year} Kenzo Infosystems. All rights reserved.
          </p>
        </div>
      </section>
    </main>
  );
}
