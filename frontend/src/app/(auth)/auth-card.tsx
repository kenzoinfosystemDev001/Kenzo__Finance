import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand-logo';

/** Centered white card on the solid canvas, matching the sign-in card. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 sm:px-8">
      <div className="w-full max-w-md rounded-2xl bg-surface px-6 py-8 shadow-popover ring-1 ring-border sm:px-10 sm:py-10">
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-20 w-20" priority />
          <p className="mt-3 text-xl font-extrabold tracking-[0.16em] text-sidebar">KENZO</p>
          <p className="text-xs font-medium tracking-[0.42em] text-ink-subtle">INFOSYSTEMS</p>
        </div>

        <h1 className="mt-8 text-center text-3xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-center text-sm text-ink-subtle">{subtitle}</p>

        <div className="mt-6">{children}</div>

        <p className="mt-8 border-t border-border pt-5 text-center text-xs text-ink-subtle">
          &copy; {year} Kenzo Infosystems. All rights reserved.
        </p>
      </div>
    </main>
  );
}
