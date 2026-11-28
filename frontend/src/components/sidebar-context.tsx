'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Desktop preference only (not a credential). Read after mount so server and client markup match. */
const COLLAPSED_KEY = 'kenzo.sidebar.collapsed';
/** Tailwind's lg breakpoint: at and above it the sidebar is docked, below it is a drawer. */
const DESKTOP_QUERY = '(min-width: 1024px)';

interface SidebarState {
  /** Desktop: icon-only rail. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Mobile/tablet: slide-out drawer. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  /** The header's menu button: collapses on desktop, opens the drawer below it. */
  toggleNavigation: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Storage unavailable (private mode, blocked): stay expanded.
    }
  }, []);

  // Navigating closes the drawer.
  useEffect(() => setMobileOpen(false), [pathname]);

  // While the drawer is open: Escape closes it and the page behind does not scroll.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen]);

  // Growing past the breakpoint with the drawer open would leave the scroll lock on.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (query.matches) setMobileOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Preference simply will not persist.
      }
      return next;
    });
  }, []);

  const toggleNavigation = useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) toggleCollapsed();
    else setMobileOpen((open) => !open);
  }, [toggleCollapsed]);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen, toggleNavigation }),
    [collapsed, toggleCollapsed, mobileOpen, toggleNavigation],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarState {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used inside SidebarProvider');
  return context;
}
