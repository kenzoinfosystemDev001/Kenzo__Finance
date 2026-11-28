'use client';

import { GlobalSearch } from './global-search';
import { IconMenu } from './icons';
import { PaymentAlertBell } from './payment-alert-bell';
import { useSidebar } from './sidebar-context';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';

/**
 * Top bar: navigation toggle, global search (pages and records across every
 * module the user may read) and payment alerts. The signed-in user's menu
 * lives in the sidebar profile card.
 */
export function AppHeader({
  permissions,
  alerts,
}: {
  /** The signed-in user's permissions; scope what the search offers. */
  permissions: string[];
  /** Null when the user cannot see invoices, so the bell is not shown. */
  alerts?: PaymentAlertsResponse | null;
}) {
  const { collapsed, mobileOpen, toggleNavigation } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={toggleNavigation}
        aria-controls="sidebar"
        aria-expanded={mobileOpen || !collapsed}
        aria-label="Toggle navigation"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <IconMenu size={22} />
      </button>
      <span aria-hidden className="hidden h-8 w-px bg-border sm:block" />

      <GlobalSearch permissions={permissions} />

      {alerts && (
        <div className="ml-auto flex items-center">
          <PaymentAlertBell data={alerts} />
        </div>
      )}
    </header>
  );
}
