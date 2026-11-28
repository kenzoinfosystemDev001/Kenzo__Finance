'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { AccountMenu, roleLabel, type AccountUser } from './account-menu';
import { BackgroundImage } from './background-image';
import { BrandLogo } from './brand-logo';
import { useSidebar } from './sidebar-context';
import { UserAvatar } from './user-avatar';
import { IconChevronDown, IconChevronLeft, IconX } from './icons';

interface NavLink {
  label: string;
  href: string;
  /** Shown only to users holding this permission; omitted = everyone. */
  permission?: string;
}

interface NavEntry extends NavLink {
  /** Nested pages, shown indented under this entry and expandable. */
  children?: NavLink[];
  /** Starts the administration section (a divider is drawn above it). */
  adminSection?: boolean;
}

/** The single source of the main navigation: order, routes and permissions. */
const NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Vendor Management', href: '/vendors', permission: 'vendor.read' },
  {
    label: 'Product Management',
    href: '/products',
    permission: 'product.read',
    children: [
      { label: 'Brands', href: '/companies', permission: 'company.read' },
      { label: 'Inventory', href: '/inventory', permission: 'stock.read' },
    ],
  },
  { label: 'Customer Management', href: '/customers', permission: 'customer.read' },
  { label: 'Enquiry Management', href: '/enquiries', permission: 'enquiry.read' },
  { label: 'Quotation Management', href: '/quotations', permission: 'quotation.read' },
  { label: 'Proforma Invoice', href: '/proforma-invoices', permission: 'proforma.read' },
  { label: 'Final Invoice', href: '/final-invoices', permission: 'invoice.read' },
  { label: 'Payment Management', href: '/payments', permission: 'payment.read' },
  { label: 'Delivery Management', href: '/deliveries', permission: 'delivery.read' },
  { label: 'Reports & Analytics', href: '/reports', permission: 'analytics.dashboard' },
  { label: 'Sales History', href: '/sales-history', permission: 'analytics.products' },
  {
    label: 'Admin Console',
    href: '/admin',
    permission: 'settings.manage',
    adminSection: true,
    children: [{ label: 'Appearance', href: '/appearance', permission: 'settings.manage' }],
  },
  { label: 'Settings', href: '/settings' },
];

/**
 * Entries this user may see. A child the user may open stays reachable even
 * when its parent is hidden: it is promoted to a top-level entry.
 */
function visibleNav(permissions: string[]): NavEntry[] {
  const allowed = (item: NavLink) => !item.permission || permissions.includes(item.permission);
  const result: NavEntry[] = [];
  for (const entry of NAV) {
    const children = (entry.children ?? []).filter(allowed);
    if (allowed(entry)) result.push({ ...entry, children });
    else result.push(...children.map((child, i) => ({ ...child, adminSection: entry.adminSection && i === 0 })));
  }
  return result;
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function Sidebar({
  permissions,
  user,
  logoutAction,
  backgroundUrl = null,
}: {
  permissions: string[];
  user: AccountUser;
  logoutAction: () => Promise<void>;
  /** Admin-chosen sidebar image (Admin -> Appearance), or null for the default colours. */
  backgroundUrl?: string | null;
}) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  // Groups start expanded; the user can fold them. Keyed by label.
  const [folded, setFolded] = useState<Record<string, boolean>>({});

  const entries = visibleNav(permissions);
  const primaryRole = user.roles[0] ? roleLabel(user.roles[0]) : 'no role';

  const rowBase =
    'relative flex items-center rounded-lg px-4 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70';
  // The selected page: a solid royal panel with a gold edge.
  const activeRow =
    'bg-sidebar-active text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-indicator';

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-sidebar/60 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <aside
        id="sidebar"
        aria-label="Sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] max-w-[85vw] shrink-0 flex-col text-sidebar-ink',
          'bg-[linear-gradient(180deg,rgb(var(--sidebar))_0%,rgb(var(--sidebar))_55%,rgb(var(--sidebar-deep))_100%)]',
          'transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:max-w-none lg:transform-none',
          // Desktop: collapsing hides the sidebar; the header's menu button brings it back.
          collapsed && 'lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Admin-chosen image under a solid tint. */}
        <BackgroundImage src={backgroundUrl} overlayClassName="bg-sidebar/85" className="absolute inset-0" />

        {/* Brand */}
        <div className="relative flex shrink-0 items-center border-b border-sidebar-border/70 px-5 pb-5 pt-6">
          <Link
            href="/dashboard"
            aria-label="Kenzo Infosystems - go to dashboard"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70"
          >
            <BrandLogo className="h-10 w-10" />
            <span className="min-w-0 whitespace-nowrap text-[0.9rem] font-semibold leading-none tracking-[0.01em]">
              <span className="text-white">Kenzo Infosystems</span>{' '}
              <span className="text-sidebar-indicator">Pvt Ltd</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-controls="sidebar"
            aria-expanded={!collapsed}
            aria-label="Hide navigation"
            title="Hide navigation"
            className="absolute -right-3.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-ink shadow-card transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70 lg:inline-flex"
          >
            <IconChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="absolute -right-3.5 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-ink shadow-card transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70 lg:hidden"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Signed-in user */}
        <div className="relative shrink-0 px-4 pt-4">
          <AccountMenu
            user={user}
            logoutAction={logoutAction}
            panelClassName="left-0 top-full mt-2 !origin-top-left"
            triggerClassName={(open) =>
              clsx(
                'flex w-full items-center gap-3 rounded-xl border border-sidebar-border/80 bg-sidebar-surface/70 p-3 text-left transition-colors',
                'hover:bg-sidebar-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70',
                open && 'bg-sidebar-hover/70',
              )
            }
            trigger={({ open, photoVersion }) => (
              <>
                <span className="relative shrink-0">
                  <UserAvatar owner="me" fullName={user.fullName} version={photoVersion} size="card" ring />
                  {/* This session is signed in. */}
                  <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success ring-2 ring-sidebar" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.92rem] font-semibold leading-tight text-white">{user.fullName}</span>
                  <span className="mt-1 block truncate text-xs capitalize leading-tight text-sidebar-muted">{primaryRole}</span>
                </span>
                <IconChevronDown size={18} className={clsx('shrink-0 text-sidebar-ink transition-transform duration-200', open && 'rotate-180')} />
              </>
            )}
          />
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="sidebar-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
          <ul className="space-y-0.5">
            {entries.map((entry) => {
              const children = entry.children ?? [];
              const selfActive = matches(pathname, entry.href);
              const childActive = children.some((child) => matches(pathname, child.href));
              const open = children.length > 0 && !folded[entry.label];

              return (
                <li key={entry.href}>
                  {entry.adminSection && <div role="presentation" className="mb-3 mt-3 border-t border-sidebar-border/70" />}

                  <div className="relative">
                    <Link
                      href={entry.href}
                      aria-current={selfActive ? 'page' : undefined}
                      className={clsx(
                        rowBase,
                        'h-10 text-[0.92rem]',
                        children.length > 0 && 'pr-11',
                        selfActive
                          ? activeRow
                          : childActive
                            ? 'bg-sidebar-hover/70 text-white'
                            : 'text-sidebar-ink/85 hover:bg-sidebar-hover/70 hover:text-white',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    </Link>

                    {children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFolded((f) => ({ ...f, [entry.label]: open }))}
                        aria-expanded={open}
                        aria-controls={`nav-group-${entry.href.slice(1)}`}
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${entry.label}`}
                        className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-ink/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70"
                      >
                        <IconChevronDown size={16} className={clsx('transition-transform duration-200', !open && '-rotate-90')} />
                      </button>
                    )}
                  </div>

                  {children.length > 0 && (
                    <ul
                      id={`nav-group-${entry.href.slice(1)}`}
                      className={clsx('ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2', !open && 'hidden')}
                    >
                      {children.map((child) => {
                        const active = matches(pathname, child.href);
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={active ? 'page' : undefined}
                              className={clsx(
                                rowBase,
                                'h-9 text-[0.88rem]',
                                active ? activeRow : 'text-sidebar-ink/80 hover:bg-sidebar-hover/60 hover:text-white',
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="relative shrink-0 border-t border-sidebar-border/70 px-5 py-4">
          <p className="text-sm font-semibold text-white">Kenzo Infosystems</p>
          <p className="mt-0.5 text-xs text-sidebar-muted">Business Management</p>
        </div>
      </aside>
    </>
  );
}
