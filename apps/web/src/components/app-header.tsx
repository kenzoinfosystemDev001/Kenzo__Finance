'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IconChevronDown, IconLogout, IconSearch, IconUser } from './icons';
import { PaymentAlertBell } from './payment-alert-bell';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';

/**
 * Top bar: vendor search and the user menu.
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
  user: { fullName: string; email: string; roles: string[] };
  canSearchVendors: boolean;
  logoutAction: () => Promise<void>;
  /** Null when the user cannot see invoices, so the bell is not shown. */
  alerts?: PaymentAlertsResponse | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const role = user.roles[0]?.replace(/_/g, ' ').toLowerCase() ?? 'no role';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 pl-14 backdrop-blur lg:px-6">
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
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            ref={inputRef}
            type="search"
            aria-label="Search vendors"
            className="field-input h-10 rounded-lg bg-surface-muted pl-10"
          />
        </form>
      )}

      <div className="ml-auto flex items-center gap-2">
        {alerts && <PaymentAlertBell data={alerts} />}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
          >
            {initials || '?'}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-tight text-ink">{user.fullName}</span>
            <span className="block text-xs capitalize leading-tight text-ink-subtle">{role}</span>
          </span>
          <IconChevronDown size={16} className="text-ink-subtle" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-popover"
          >
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-xs text-ink-subtle">{user.email}</p>
              {user.roles.length > 1 && (
                <p className="mt-1 text-xs capitalize text-ink-muted">
                  {user.roles.join(', ').replace(/_/g, ' ').toLowerCase()}
                </p>
              )}
            </div>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-muted"
            >
              <IconUser size={16} />
              My account
            </Link>
            <form action={logoutAction} className="border-t border-border">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-surface-muted"
              >
                <IconLogout size={16} />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
