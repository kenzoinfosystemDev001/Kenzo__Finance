'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';

interface NavItem {
  label: string;
  href: string;
  permission?: string;
  /** Modules that arrive in later phases are shown but not navigable. */
  comingSoon?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard' }],
  },
  {
    title: 'Supply',
    items: [
      { label: 'Vendors', href: '/vendors', permission: 'vendor.read' },
      { label: 'Brands', href: '/companies', permission: 'company.read' },
      { label: 'Products', href: '/products', permission: 'product.read' },
      { label: 'Inventory', href: '/inventory', permission: 'stock.read' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Customers', href: '/customers', comingSoon: true },
      { label: 'Enquiries', href: '/enquiries', comingSoon: true },
      { label: 'Quotations', href: '/quotations', comingSoon: true },
      { label: 'Proforma Invoices', href: '/proforma-invoices', comingSoon: true },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Payments', href: '/payments', comingSoon: true },
      { label: 'Deliveries', href: '/deliveries', comingSoon: true },
      { label: 'Reports', href: '/reports', comingSoon: true },
    ],
  },
  {
    title: 'Administration',
    items: [{ label: 'Settings', href: '/settings' }],
  },
];

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const canSee = (item: NavItem): boolean =>
    !item.permission || permissions.includes(item.permission);

  const navigation = (
    <nav className="flex flex-col gap-6 p-4" aria-label="Main">
      {SECTIONS.map((section) => {
        const visible = section.items.filter(canSee);
        if (visible.length === 0) return null;

        return (
          <div key={section.title}>
            <p className="mb-2 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {visible.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                if (item.comingSoon) {
                  return (
                    <li key={item.href}>
                      <span
                        className="flex cursor-not-allowed items-center justify-between rounded-md px-2.5 py-1.5 text-base text-ink-subtle"
                        title="Available in a later phase"
                      >
                        {item.label}
                        <span className="text-xs text-ink-subtle">Soon</span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'block rounded-md px-2.5 py-1.5 text-base transition-colors',
                        active
                          ? 'bg-accent-subtle font-medium text-accent'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        type="button"
        className="btn-secondary fixed left-4 top-3 z-40 lg:hidden"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="sidebar"
      >
        Menu
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-60 shrink-0 overflow-y-auto border-r border-border bg-surface',
          'transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-semibold text-white"
          >
            KI
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">
              Kenzo Infosystems
            </p>
            <p className="truncate text-xs leading-tight text-ink-subtle">ERP</p>
          </div>
        </div>
        {navigation}
      </aside>
    </>
  );
}
