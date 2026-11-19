'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  IconBox,
  IconChart,
  IconHandshake,
  IconHome,
  IconInbox,
  IconInvoice,
  IconMenu,
  IconQuote,
  IconSettings,
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
  /** Nested under the previous top-level item (shown smaller). */
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
  { label: 'Proforma Invoice', href: '/proforma-invoices', icon: IconInvoice, comingSoon: true },
  { label: 'Payment Management', href: '/payments', icon: IconWallet, comingSoon: true },
  { label: 'Delivery Management', href: '/deliveries', icon: IconTruck, comingSoon: true },
  { label: 'Reports & Analytics', href: '/reports', icon: IconChart, comingSoon: true },
  { label: 'Settings', href: '/settings', icon: IconSettings },
];

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  const visible = NAV.filter((item) => !item.permission || permissions.includes(item.permission));

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink shadow-card lg:hidden"
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
          'fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-ink',
          'transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <svg viewBox="0 0 40 32" className="h-8 w-10 shrink-0" aria-hidden>
            <path d="M20 2 36 30h-8L20 15 12 30H4Z" fill="rgb(var(--accent))" />
            <path d="M20 15 28 30h-7.5L17 23.5Z" fill="#60a5fa" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight tracking-wide text-white">KENZO</p>
            <p className="truncate text-[0.65rem] font-medium uppercase leading-tight tracking-[0.2em] text-sidebar-muted">
              Infosystems
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
          <ul className="space-y-0.5">
            {visible.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              if (item.comingSoon) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted/70"
                      title="Available in a later phase"
                    >
                      <Icon size={18} />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      item.child && 'ml-5 py-1.5 text-[0.8rem]',
                      active
                        ? 'bg-accent font-semibold text-white shadow-sm'
                        : 'text-sidebar-ink/85 hover:bg-sidebar-hover hover:text-white',
                    )}
                  >
                    <Icon size={item.child ? 16 : 18} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="m-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-sidebar-muted">
          <p className="font-medium text-sidebar-ink">Kenzo Infosystems</p>
          <p>Business Management</p>
        </div>
      </aside>
    </>
  );
}
