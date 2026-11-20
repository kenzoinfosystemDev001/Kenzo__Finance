import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-actions';
import { getLoginBranding, loginBackgroundUrl } from '@/lib/branding';
import { ApiUnavailable } from '@/components/api-unavailable';
import { IconChart, IconHandshake, IconShield } from '@/components/icons';
import { BrandLogo } from '@/components/brand-logo';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const FEATURES = [
  { icon: IconHandshake, label: 'Manage Vendors & Products' },
  { icon: IconChart, label: 'Track Business Growth' },
  { icon: IconShield, label: 'Secure & Reliable Platform' },
];

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
    <main className="relative flex min-h-screen overflow-hidden bg-[#eef3fc]">
      {/* Brand panel: configurable photo (Settings -> Sign-in page) under a navy overlay. */}
      <section
        className="relative hidden w-[58%] flex-col justify-between overflow-hidden bg-[#0b1a3d] px-12 py-12 text-white lg:flex xl:px-16"
        aria-label="Kenzo Infosystems"
      >
        {background && (
          // eslint-disable-next-line @next/next/no-img-element -- streamed from the API, not a static asset
          <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div
          aria-hidden
          className={`absolute inset-0 ${
            background
              ? 'bg-gradient-to-r from-[#071434]/95 via-[#0b1f4d]/80 to-[#0b1f4d]/30'
              : 'bg-gradient-to-br from-[#071434] via-[#0c2257] to-[#1d4fd8]'
          }`}
        />
        <div
          aria-hidden
          className="absolute -right-24 top-0 h-full w-48 -skew-x-12 bg-gradient-to-b from-[#2563eb]/60 to-transparent"
        />

        <div className="relative flex items-center gap-5">
          <BrandLogo className="h-16 w-16" priority />
          <div>
            <p className="text-4xl font-bold leading-none tracking-[0.12em]">KENZO</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.42em] text-blue-100/80">Infosystems</p>
          </div>
          <div className="ml-4 hidden border-l border-white/30 pl-5 text-lg leading-snug text-blue-50/90 xl:block">
            Smart Business.
            <br />
            Greater Growth.
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-5xl font-bold leading-tight xl:text-6xl">
            Welcome <span className="text-[#5b9dff]">Back!</span>
          </h1>
          <p className="mt-4 text-xl leading-relaxed text-blue-50/90">
            Sign in to access your business management portal
          </p>
          <ul className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-4 text-lg">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1d4fd8]/80 ring-1 ring-white/20">
                  <Icon size={22} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-blue-100/60">
          &copy; {new Date().getFullYear()} Kenzo Infosystems. All rights reserved.
        </p>
      </section>

      {/* Sign-in card */}
      <section className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#2563eb]/10" />
        <div aria-hidden className="absolute -bottom-32 right-10 h-72 w-72 rounded-full bg-[#2563eb]/10" />

        <div className="relative w-full max-w-md rounded-3xl border border-white bg-white/95 px-7 py-9 shadow-[0_24px_60px_-20px_rgba(15,40,100,0.25)] sm:px-10">
          <div className="text-center">
            <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#e8f0ff]">
              <BrandLogo className="h-16 w-16" />
            </span>
            <h2 className="mt-5 text-3xl font-bold text-[#0d162d]">Kenzo Infosystems</h2>
            <div className="mt-2 flex items-center justify-center gap-3 text-[#43516b]">
              <span aria-hidden className="h-px w-10 bg-[#c7d2e4]" />
              <span>Business Management Software</span>
              <span aria-hidden className="h-px w-10 bg-[#c7d2e4]" />
            </div>
          </div>

          {reason === 'session-expired' && (
            <div role="status" className="mt-6 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              Your session expired. Please sign in again.
            </div>
          )}

          <div className="mt-7">
            <LoginForm supportEmail={branding.supportEmail} />
          </div>
        </div>
      </section>
    </main>
  );
}
