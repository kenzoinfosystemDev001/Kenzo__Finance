'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { AccountMenu, roleLabel, type AccountUser } from './account-menu';
import { IconChevronDown, IconMenu, IconSearch } from './icons';
import { PaymentAlertBell } from './payment-alert-bell';
import { useSidebar } from './sidebar-context';
import { UserAvatar } from './user-avatar';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';

/**
 * Top bar: navigation toggle, vendor search, payment alerts and the account menu.
 *
 * The search box submits to the vendor list, whose server-side search covers
 * vendor names, contacts, phones, emails, brands, products and model numbers.
 * It is labelled as a vendor search because that is exactly what it does.
 */
export function AppHeader({
  user,
  canSearchVendors,
  logoutAction,
  alerts,
}: {
  user: AccountUser;
  canSearchVendors: boolean;
  logoutAction: () => Promise<void>;
  /** Null when the user cannot see invoices, so the bell is not shown. */
  alerts?: PaymentAlertsResponse | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { collapsed, mobileOpen, toggleNavigation } = useSidebar();

  // Ctrl/Cmd+K focuses the search box.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const primaryRole = user.roles[0] ? roleLabel(user.roles[0]) : 'no role';

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

      {canSearchVendors && (
        <form
          role="search"
          className="relative max-w-xl flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            const term = inputRef.current?.value.trim() ?? '';
            router.push(term ? `/vendors?search=${encodeURIComponent(term)}` : '/vendors');
          }}
        >
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Search vendors"
            placeholder="Search..."
            className="field-input h-10 rounded-full border-border bg-surface-muted pl-10"
          />
        </form>
      )}

      <div className="ml-auto flex items-center gap-2">
        {alerts && <PaymentAlertBell data={alerts} />}

        <AccountMenu
          user={user}
          logoutAction={logoutAction}
          panelClassName="right-0 top-full mt-2"
          triggerClassName={(open) =>
            clsx(
              'group flex items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              open && 'bg-surface-muted',
            )
          }
          trigger={({ open, photoVersion }) => (
            <>
              <UserAvatar owner="me" fullName={user.fullName} version={photoVersion} size="md" ring />
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-[11rem] truncate text-sm font-semibold leading-tight text-ink">{user.fullName}</span>
                <span className="mt-0.5 block truncate text-xs capitalize leading-tight text-ink-muted">{primaryRole}</span>
              </span>
              <IconChevronDown size={16} className={clsx('text-ink-subtle transition-transform duration-200', open && 'rotate-180')} />
            </>
          )}
        />
      </div>
    </header>
  );
}
