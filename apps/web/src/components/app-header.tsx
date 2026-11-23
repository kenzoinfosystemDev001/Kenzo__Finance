'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { IconChevronDown, IconLogout, IconSearch, IconUser } from './icons';
import { PaymentAlertBell } from './payment-alert-bell';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';

/**
 * Top bar: vendor search, payment alerts and the account menu.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
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

  // Opening moves focus into the menu; closing returns it to the trigger.
  useEffect(() => {
    if (menuOpen) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = items[(current + step + items.length) % items.length];
      next?.focus();
    }
  }

  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const roleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();
  const primaryRole = user.roles[0] ? roleLabel(user.roles[0]) : 'no role';
  const allRoles = user.roles.map(roleLabel).join(', ');

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
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Account menu for ${user.fullName}`}
            className={`group flex items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              menuOpen ? 'bg-surface-muted' : ''
            }`}
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar text-sm font-semibold tracking-wide text-white ring-2 ring-surface shadow-card"
            >
              {initials || '?'}
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-[11rem] truncate text-sm font-semibold leading-tight text-ink">{user.fullName}</span>
              <span className="mt-0.5 block truncate text-xs capitalize leading-tight text-ink-muted">{primaryRole}</span>
            </span>
            <IconChevronDown
              size={16}
              className={`text-ink-subtle transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {menuOpen && (
            <div
              ref={panelRef}
              role="menu"
              aria-label="Account"
              onKeyDown={onMenuKeyDown}
              className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-popover"
            >
              <div className="flex items-start gap-3 bg-surface-muted/60 px-4 py-4">
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sidebar text-base font-semibold text-white shadow-card"
                >
                  {initials || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-ink">{user.fullName}</p>
                  <p className="truncate text-sm text-ink-muted" title={user.email}>{user.email}</p>
                  <span className="mt-2 inline-flex max-w-full truncate rounded-full border border-accent/30 bg-accent-subtle px-2.5 py-0.5 text-xs font-semibold capitalize text-accent">
                    {allRoles || 'no role'}
                  </span>
                </div>
              </div>

              <div className="p-1.5">
                <Link
                  href="/account"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium text-ink transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                >
                  <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-ink-muted group-hover:text-accent">
                    <IconUser size={16} />
                  </span>
                  My account
                </Link>
              </div>

              <div className="border-t border-border p-1.5">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-danger transition-colors hover:bg-danger-subtle focus:bg-danger-subtle focus:outline-none"
                  >
                    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-subtle text-danger">
                      <IconLogout size={16} />
                    </span>
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
