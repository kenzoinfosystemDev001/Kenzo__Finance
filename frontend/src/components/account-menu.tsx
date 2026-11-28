'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type AnimationEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { IconLogout, IconPencil, IconUser } from './icons';
import { ProfilePhotoDialog } from './profile-photo-dialog';
import { UserAvatar } from './user-avatar';

type MenuPhase = 'closed' | 'open' | 'closing';

export interface AccountUser {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
  photoVersion?: string | null;
}

export const roleLabel = (role: string) => role.replace(/_/g, ' ').toLowerCase();

/**
 * The signed-in user's menu: identity, My account, profile photo, sign out.
 *
 * One implementation shared by the header and the sidebar profile card, so
 * both behave the same. Identity and photo come from the authenticated user's
 * record; the photo is stored in the database, and saving it revalidates the
 * layout so every avatar on the page updates.
 */
export function AccountMenu({
  user,
  logoutAction,
  trigger,
  triggerClassName,
  panelClassName,
}: {
  user: AccountUser;
  logoutAction: () => Promise<void>;
  /** Contents of the trigger button; receives the open state and current photo version. */
  trigger: (state: { open: boolean; photoVersion: string | null }) => ReactNode;
  triggerClassName: (open: boolean) => string;
  /** Positioning of the dropdown panel relative to the trigger's wrapper. */
  panelClassName: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  // Local copy so the avatar updates the moment the server confirms a change.
  const [photoVersion, setPhotoVersion] = useState<string | null>(user.photoVersion ?? null);
  // The photo dialog is portalled to <body>, which exists only after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setPhotoVersion(user.photoVersion ?? null), [user.photoVersion]);
  useEffect(() => setMounted(true), []);

  const menuOpen = phase === 'open';

  useEffect(() => {
    // pointerdown covers mouse, touch and pen.
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setPhase((p) => (p === 'open' ? 'closing' : p));
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
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

  const itemClass =
    'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none active:bg-border/60';
  const itemIconClass =
    'flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-ink-muted transition-colors group-hover:text-accent';

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (menuOpen ? closeMenu(false) : setPhase('open'))}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${user.fullName}`}
          className={triggerClassName(menuOpen || phase === 'closing')}
        >
          {trigger({ open: menuOpen, photoVersion })}
        </button>

        {phase !== 'closed' && (
          <div
            ref={panelRef}
            role="menu"
            aria-label="Account"
            onKeyDown={onMenuKeyDown}
            onAnimationEnd={onPanelAnimationEnd}
            className={clsx(
              'absolute z-50 flex max-h-[min(36rem,calc(100vh-5rem))] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-popover',
              panelClassName,
              phase === 'closing' ? 'anim-menu-out' : 'anim-menu-in',
            )}
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
              <Link href="/account" role="menuitem" onClick={() => closeMenu(false)} className={itemClass}>
                <span aria-hidden className={itemIconClass}>
                  <IconUser size={16} />
                </span>
                My account
              </Link>
              <button type="button" role="menuitem" onClick={openPhotoDialog} className={itemClass}>
                <span aria-hidden className={itemIconClass}>
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

      {/* Portalled to <body>: the header's backdrop blur and the sidebar's
          slide transform would otherwise trap the full-screen fixed dialog. */}
      {mounted &&
        createPortal(
          <ProfilePhotoDialog
            owner="me"
            fullName={user.fullName}
            currentVersion={photoVersion}
            open={photoDialogOpen}
            onClose={() => setPhotoDialogOpen(false)}
            onSaved={(version) => setPhotoVersion(version)}
          />,
          document.body,
        )}
    </>
  );
}
