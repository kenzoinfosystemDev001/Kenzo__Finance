'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { BrandLogo } from './brand-logo';
import {
  IconBox,
  IconChart,
  IconChevronLeft,
  IconChevronRight,
  IconHandshake,
  IconFile,
  IconHome,
  IconInbox,
  IconInvoice,
  IconImage,
  IconMenu,
  IconQuote,
  IconSettings,
  IconShield,
  IconTag,
  IconTruck,
  IconUsers,
  IconWallet,
  IconWarehouse,
  IconX,
} from './icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  permission?: string;
  /** Modules that arrive in later phases are listed but not navigable. */
  comingSoon?: boolean;
  /** Nested under the previous top-level item (indented). */
  child?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: IconHome },
  { label: 'Vendor Management', href: '/vendors', icon: IconHandshake, permission: 'vendor.read' },
  { label: 'Product Management', href: '/products', icon: IconBox, permission: 'product.read' },
  { label: 'Brands', href: '/companies', icon: IconTag, permission: 'company.read', child: true },
  { label: 'Inventory', href: '/inventory', icon: IconWarehouse, permission: 'stock.read', child: true },
  { label: 'Customer Management', href: '/customers', icon: IconUsers, permission: 'customer.read' },
  { label: 'Enquiry Management', href: '/enquiries', icon: IconInbox, permission: 'enquiry.read' },
  { label: 'Quotation Management', href: '/quotations', icon: IconQuote, permission: 'quotation.read' },
  { label: 'Proforma Invoice', href: '/proforma-invoices', icon: IconInvoice, permission: 'proforma.read' },
  { label: 'Final Invoice', href: '/final-invoices', icon: IconFile, permission: 'invoice.read' },
  { label: 'Payment Management', href: '/payments', icon: IconWallet, permission: 'payment.read' },
  { label: 'Delivery Management', href: '/deliveries', icon: IconTruck, permission: 'delivery.read' },
  { label: 'Reports & Analytics', href: '/reports', icon: IconChart, permission: 'analytics.dashboard' },
  { label: 'Sales History', href: '/sales-history', icon: IconChart, permission: 'analytics.products' },
  { label: 'Admin Console', href: '/admin', icon: IconShield, permission: 'settings.manage' },
  { label: 'Appearance', href: '/appearance', icon: IconImage, permission: 'settings.manage' },
  { label: 'Settings', href: '/settings', icon: IconSettings },
];

/** Desktop preference only (not a credential). Read after mount so server and client markup match. */
const COLLAPSED_KEY = 'kenzo.sidebar.collapsed';

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage unavailable (private mode, blocked): stay expanded.
    }
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Preference simply will not persist.
      }
      return next;
    });
  }

  const visible = NAV.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-ink shadow-card lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="sidebar"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
      >
        {open ? <IconX /> : <IconMenu />}
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-sidebar/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}

      <aside
        id="sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-ink',
          'transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={clsx(
            'flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4',
            collapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <BrandLogo className="h-9 w-9 shrink-0" />
          <div className={clsx('min-w-0 leading-tight', collapsed && 'lg:hidden')}>
            <p className="truncate text-sm font-bold text-white">Kenzo Infosystems</p>
            <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">Pvt Ltd</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
          <ul className="space-y-1">
            {visible.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              const content = (
                <>
                  <Icon size={18} className="shrink-0" />
                  <span className={clsx('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
                </>
              );
              const rowClass = clsx(
                'relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                item.child && !collapsed && 'pl-9',
                collapsed && 'lg:justify-center lg:px-0',
              );

              if (item.comingSoon) {
                return (
                  <li key={item.href}>
                    <span className={clsx(rowClass, 'cursor-not-allowed text-sidebar-muted')} title="Available in a later phase">
                      {content}
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      rowClass,
                      active
                        ? 'bg-sidebar-active text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-sidebar-indicator'
                        : 'text-sidebar-ink hover:bg-sidebar-hover hover:text-white',
                    )}
                  >
                    {content}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-2 py-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : undefined}
            className={clsx(
              'hidden h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-bold text-sidebar-ink transition-colors hover:bg-sidebar-hover hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 lg:flex',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            {collapsed ? <IconChevronRight size={18} className="shrink-0" /> : <IconChevronLeft size={18} className="shrink-0" />}
            <span className={clsx(collapsed && 'lg:sr-only')}>Collapse</span>
          </button>
          <p className={clsx('px-3 pb-1 pt-2 text-xs text-sidebar-muted', collapsed && 'lg:hidden')}>
            Kenzo Infosystems &middot; Business Management
          </p>
        </div>
      </aside>
    </>
  );
}
