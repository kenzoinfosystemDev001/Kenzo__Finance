'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type AnimationEvent, type KeyboardEvent } from 'react';
import { IconChevronDown, IconLogout, IconPencil, IconSearch, IconUser } from './icons';
import { PaymentAlertBell } from './payment-alert-bell';
import { ProfilePhotoDialog } from './profile-photo-dialog';
import { UserAvatar } from './user-avatar';
import type { PaymentAlertsResponse } from '@/lib/payment-alerts-types';

type MenuPhase = 'closed' | 'open' | 'closing';

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
  user: { id: string; fullName: string; email: string; roles: string[]; photoVersion?: string | null };
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
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  // Local copy so the avatar updates the moment the server confirms a change.
  const [photoVersion, setPhotoVersion] = useState<string | null>(user.photoVersion ?? null);

  useEffect(() => setPhotoVersion(user.photoVersion ?? null), [user.photoVersion]);

  const menuOpen = phase === 'open';

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    // pointerdown covers mouse, touch and pen.
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setPhase((p) => (p === 'open' ? 'closing' : p));
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  // Opening moves focus into the menu.
  useEffect(() => {
    if (menuOpen) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuOpen]);

  /** Starts the closing animation; the panel unmounts when it ends. */
  function closeMenu(returnFocus: boolean) {
    setPhase((p) => (p === 'open' ? 'closing' : p));
    if (returnFocus) triggerRef.current?.focus();
  }

  function onPanelAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target === panelRef.current && phase === 'closing') setPhase('closed');
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + step + items.length) % items.length]?.focus();
    }
  }

  function openPhotoDialog() {
    closeMenu(false);
    setPhotoDialogOpen(true);
  }

  const roleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();
  const primaryRole = user.roles[0] ? roleLabel(user.roles[0]) : 'no role';

  return (
    <>
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
              onClick={() => (menuOpen ? closeMenu(false) : setPhase('open'))}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account menu for ${user.fullName}`}
              className={`group flex items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                menuOpen || phase === 'closing' ? 'bg-surface-muted' : ''
              }`}
            >
              <UserAvatar owner="me" fullName={user.fullName} version={photoVersion} size="md" ring />
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-[11rem] truncate text-sm font-semibold leading-tight text-ink">{user.fullName}</span>
                <span className="mt-0.5 block truncate text-xs capitalize leading-tight text-ink-muted">{primaryRole}</span>
              </span>
              <IconChevronDown
                size={16}
                className={`text-ink-subtle transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {phase !== 'closed' && (
              <div
                ref={panelRef}
                role="menu"
                aria-label="Account"
                onKeyDown={onMenuKeyDown}
                onAnimationEnd={onPanelAnimationEnd}
                className={`absolute right-0 top-full mt-2 flex max-h-[min(36rem,calc(100vh-5rem))] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-popover ${
                  phase === 'closing' ? 'anim-menu-out' : 'anim-menu-in'
                }`}
              >
                {/* Identity: full name, full email and every role, nothing truncated. */}
                <div className="flex items-start gap-4 px-4 pb-4 pt-5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openPhotoDialog}
                    aria-label="Change profile photo"
                    className="group/avatar relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <UserAvatar owner="me" fullName={user.fullName} version={photoVersion} size="lg" ring />
                    <span
                      aria-hidden
                      className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-ink-muted shadow-card transition-colors group-hover/avatar:text-accent"
                    >
                      <IconPencil size={12} />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-semibold leading-snug text-ink">{user.fullName}</p>
                    <p className="mt-0.5 break-all text-sm leading-snug text-ink-muted">{user.email}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {user.roles.length > 0 ? (
                        user.roles.map((role) => (
                          <span key={role} className="chip capitalize" title={role}>
                            {roleLabel(role)}
                          </span>
                        ))
                      ) : (
                        <span className="chip">No role</span>
                      )}
                    </div>
                  </div>
                </div>

                <div role="separator" className="h-px bg-border" />

                <div className="p-1.5">
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => closeMenu(false)}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none active:bg-border/60"
                  >
                    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-ink-muted transition-colors group-hover:text-accent">
                      <IconUser size={16} />
                    </span>
                    My account
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openPhotoDialog}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none active:bg-border/60"
                  >
                    <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-ink-muted transition-colors group-hover:text-accent">
                      <IconPencil size={16} />
                    </span>
                    Change profile photo
                  </button>
                </div>

                <div role="separator" className="h-px bg-border" />

                <div className="p-1.5">
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-subtle focus:bg-danger-subtle focus:outline-none active:bg-danger-subtle/80"
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

      {/* Outside the header: its backdrop blur would otherwise trap the fixed dialog. */}
      <ProfilePhotoDialog
        owner="me"
        fullName={user.fullName}
        currentVersion={photoVersion}
        open={photoDialogOpen}
        onClose={() => setPhotoDialogOpen(false)}
        onSaved={(version) => setPhotoVersion(version)}
      />
    </>
  );
}
