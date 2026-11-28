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
import {
  IconBarChart,
  IconCard,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconCube,
  IconDocument,
  IconHandshake,
  IconHelpBubble,
  IconHome,
  IconInfo,
  IconPalette,
  IconSettings,
  IconShield,
  IconTag,
  IconTruck,
  IconUsers,
  IconX,
} from './icons';

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

interface NavLink {
  label: string;
  href: string;
  icon: IconComponent;
  /** Shown only to users holding this permission; omitted = everyone. */
  permission?: string;
}

interface NavEntry extends NavLink {
  /** Nested pages, shown indented under this entry and expandable. */
  children?: NavLink[];
  /** Starts the administration section (a divider is drawn above it). */
  adminSection?: boolean;
}

/** The single source of the main navigation: order, routes, icons and permissions. */
const NAV: NavEntry[] = [
  { label: 'Dashboard', href: '/dashboard', icon: IconHome },
  { label: 'Vendor Management', href: '/vendors', icon: IconHandshake, permission: 'vendor.read' },
  {
    label: 'Product Management',
    href: '/products',
    icon: IconCube,
    permission: 'product.read',
    children: [
      { label: 'Brands', href: '/companies', icon: IconTag, permission: 'company.read' },
      { label: 'Inventory', href: '/inventory', icon: IconCube, permission: 'stock.read' },
    ],
  },
  { label: 'Customer Management', href: '/customers', icon: IconUsers, permission: 'customer.read' },
  { label: 'Enquiry Management', href: '/enquiries', icon: IconHelpBubble, permission: 'enquiry.read' },
  { label: 'Quotation Management', href: '/quotations', icon: IconDocument, permission: 'quotation.read' },
  { label: 'Proforma Invoice', href: '/proforma-invoices', icon: IconDocument, permission: 'proforma.read' },
  { label: 'Final Invoice', href: '/final-invoices', icon: IconDocument, permission: 'invoice.read' },
  { label: 'Payment Management', href: '/payments', icon: IconCard, permission: 'payment.read' },
  { label: 'Delivery Management', href: '/deliveries', icon: IconTruck, permission: 'delivery.read' },
  { label: 'Reports & Analytics', href: '/reports', icon: IconBarChart, permission: 'analytics.dashboard' },
  { label: 'Sales History', href: '/sales-history', icon: IconClock, permission: 'analytics.products' },
  {
    label: 'Admin Console',
    href: '/admin',
    icon: IconShield,
    permission: 'settings.manage',
    adminSection: true,
    children: [{ label: 'Appearance', href: '/appearance', icon: IconPalette, permission: 'settings.manage' }],
  },
  { label: 'Settings', href: '/settings', icon: IconSettings },
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
  /** Desktop rail: icons only. The mobile drawer is always full width. */
  const rail = collapsed;

  const rowBase = clsx(
    'relative flex items-center gap-3.5 rounded-xl px-3.5 font-semibold transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70',
    rail && 'lg:justify-center lg:gap-0 lg:px-0',
  );
  const labelClass = clsx('min-w-0 flex-1 truncate', rail && 'lg:sr-only');

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-sidebar/60 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <aside
        id="sidebar"
        aria-label="Sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[85vw] shrink-0 flex-col text-sidebar-ink',
          'bg-[linear-gradient(180deg,rgb(var(--sidebar))_0%,rgb(var(--sidebar))_55%,rgb(var(--sidebar-deep))_100%)]',
          'transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:max-w-none lg:transform-none',
          rail ? 'lg:w-[4.75rem]' : 'lg:w-[18rem]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Admin-chosen image under a solid tint, then a faint blue light from the lower edge. */}
        <BackgroundImage src={backgroundUrl} overlayClassName="bg-sidebar/85" className="absolute inset-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_45%_at_100%_100%,rgb(var(--sidebar-indicator)/0.10),transparent_70%)]"
        />

        {/* Brand */}
        <div
          className={clsx(
            'relative flex shrink-0 items-center gap-3 border-b border-sidebar-border/60 px-5 pb-5 pt-6',
            rail && 'lg:flex-col lg:gap-3 lg:px-0 lg:pb-4',
          )}
        >
          <Link
            href="/dashboard"
            aria-label="Kenzo Infosystems - go to dashboard"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70 lg:flex-none"
          >
            <BrandLogo className="h-12 w-12" />
            <span className={clsx('min-w-0 leading-none', rail && 'lg:hidden')}>
              <span className="block text-[1.15rem] font-extrabold tracking-[0.08em] text-white">KENZO</span>
              <span className="mt-1 block text-[0.78rem] font-semibold tracking-[0.12em] text-sidebar-muted">INFOSYSTEMS</span>
              <span className="mt-1 block text-[0.68rem] font-semibold tracking-[0.14em] text-sidebar-muted/75">PVT LTD</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-controls="sidebar"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-surface/70 text-sidebar-ink transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70 lg:inline-flex"
          >
            {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-surface/70 text-sidebar-ink transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70 lg:hidden"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Signed-in user */}
        <div className={clsx('relative shrink-0 px-4 pt-4', rail && 'lg:px-2.5')}>
          <AccountMenu
            user={user}
            logoutAction={logoutAction}
            panelClassName={clsx('left-0 top-full mt-2 !origin-top-left', rail && 'lg:left-full lg:top-0 lg:ml-3 lg:mt-0')}
            triggerClassName={(open) =>
              clsx(
                'flex w-full items-center gap-3 rounded-2xl border border-sidebar-border/80 bg-sidebar-surface/70 p-3 text-left transition-colors',
                'hover:bg-sidebar-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70',
                open && 'bg-sidebar-hover/70',
                rail && 'lg:justify-center lg:border-transparent lg:bg-transparent lg:p-1.5',
              )
            }
            trigger={({ open, photoVersion }) => (
              <>
                <span className="relative shrink-0">
                  <UserAvatar owner="me" fullName={user.fullName} version={photoVersion} size="card" ring />
                  {/* This session is signed in. */}
                  <span aria-hidden className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success ring-2 ring-sidebar" />
                </span>
                <span className={clsx('min-w-0 flex-1', rail && 'lg:hidden')}>
                  <span className="block truncate text-[0.92rem] font-semibold leading-tight text-white">{user.fullName}</span>
                  <span className="mt-1 block truncate text-xs capitalize leading-tight text-sidebar-muted">{primaryRole}</span>
                </span>
                <IconChevronDown
                  size={18}
                  className={clsx('shrink-0 text-sidebar-ink transition-transform duration-200', open && 'rotate-180', rail && 'lg:hidden')}
                />
              </>
            )}
          />
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className={clsx('sidebar-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-4 py-4', rail && 'lg:px-2.5')}>
          <ul className="space-y-1">
            {entries.map((entry) => {
              const children = entry.children ?? [];
              const selfActive = matches(pathname, entry.href);
              const childActive = children.some((child) => matches(pathname, child.href));
              const open = children.length > 0 && !folded[entry.label];
              const Icon = entry.icon;

              return (
                <li key={entry.href}>
                  {entry.adminSection && <div role="presentation" className="mb-3 mt-2 border-t border-sidebar-border/70" />}

                  <div className="group/row relative">
                    <Link
                      href={entry.href}
                      aria-current={selfActive ? 'page' : undefined}
                      title={rail ? entry.label : undefined}
                      className={clsx(
                        rowBase,
                        'h-11 text-[0.92rem]',
                        children.length > 0 && 'pr-11',
                        rail && 'lg:pr-0',
                        selfActive
                          ? 'bg-gradient-to-r from-sidebar-active to-sidebar-active/80 text-white shadow-[0_6px_18px_-10px_rgb(var(--sidebar-active))]'
                          : childActive
                            ? 'bg-sidebar-hover/70 text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-indicator'
                            : 'text-sidebar-ink/90 hover:bg-sidebar-hover/70 hover:text-white',
                      )}
                    >
                      <Icon size={20} className="shrink-0" />
                      <span className={labelClass}>{entry.label}</span>
                    </Link>

                    {children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFolded((f) => ({ ...f, [entry.label]: open }))}
                        aria-expanded={open}
                        aria-controls={`nav-group-${entry.href.slice(1)}`}
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${entry.label}`}
                        className={clsx(
                          'absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-sidebar-ink/90 transition-colors hover:bg-white/10 hover:text-white',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-indicator/70',
                          rail && 'lg:hidden',
                        )}
                      >
                        <IconChevronDown size={16} className={clsx('transition-transform duration-200', !open && '-rotate-90')} />
                      </button>
                    )}
                  </div>

                  {children.length > 0 && (
                    <ul
                      id={`nav-group-${entry.href.slice(1)}`}
                      className={clsx(
                        'ml-[1.6rem] mt-1 space-y-0.5 border-l border-sidebar-border pl-3',
                        // The rail has no chevrons, so its child icons are always shown.
                        !open && 'hidden',
                        rail && 'lg:ml-0 lg:block lg:border-l-0 lg:pl-0',
                      )}
                    >
                      {children.map((child) => {
                        const active = matches(pathname, child.href);
                        const ChildIcon = child.icon;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              aria-current={active ? 'page' : undefined}
                              title={rail ? child.label : undefined}
                              className={clsx(
                                rowBase,
                                'h-10 text-[0.88rem]',
                                active
                                  ? 'bg-sidebar-active/20 text-white'
                                  : 'text-sidebar-ink/85 hover:bg-sidebar-hover/60 hover:text-white',
                              )}
                            >
                              <ChildIcon size={18} className={clsx('shrink-0', active && 'text-sidebar-indicator')} />
                              <span className={labelClass}>{child.label}</span>
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
        <div className={clsx('relative shrink-0 px-4 pb-4 pt-2', rail && 'lg:px-2.5')}>
          <div
            title={rail ? 'Kenzo Infosystems - Business Management' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-2xl border border-sidebar-border/80 bg-sidebar-surface/70 px-4 py-3',
              rail && 'lg:justify-center lg:px-0',
            )}
          >
            <IconInfo size={20} className="shrink-0 text-sidebar-ink" />
            <span className={clsx('min-w-0 leading-tight', rail && 'lg:sr-only')}>
              <span className="block truncate text-sm font-semibold text-white">Kenzo Infosystems</span>
              <span className="mt-0.5 block truncate text-xs text-sidebar-muted">Business Management</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
