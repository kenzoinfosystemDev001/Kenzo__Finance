'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { IconArrowRight, IconSearch } from './icons';
import { matchPages } from '@/lib/search-pages';
import { globalSearchAction, type SearchHit, type SearchResultType } from '@/lib/global-search-actions';

/** Where each kind of record opens. Brands have no detail page, so they open the filtered list. */
const RECORD_ROUTES: Record<SearchResultType, { label: string; href: (hit: SearchHit) => string }> = {
  vendor: { label: 'Vendors', href: (h) => `/vendors/${h.id}` },
  brand: { label: 'Brands', href: (h) => `/companies?search=${encodeURIComponent(h.title)}` },
  product: { label: 'Products', href: (h) => `/products/${h.id}` },
  customer: { label: 'Customers', href: (h) => `/customers/${h.id}` },
  enquiry: { label: 'Enquiries', href: (h) => `/enquiries/${h.id}` },
  quotation: { label: 'Quotations', href: (h) => `/quotations/${h.id}` },
  proforma: { label: 'Proforma invoices', href: (h) => `/proforma-invoices/${h.id}` },
  invoice: { label: 'Final invoices', href: (h) => `/final-invoices/${h.id}` },
  payment: { label: 'Payments', href: (h) => `/payments/${h.id}` },
  delivery: { label: 'Deliveries', href: (h) => `/deliveries/${h.id}` },
  user: { label: 'Users', href: (h) => `/users/${h.id}` },
};

interface Option {
  key: string;
  group: string;
  title: string;
  subtitle: string | null;
  href: string;
}

const DEBOUNCE_MS = 250;

/**
 * The header search. Pages and modules match instantly from the navigation
 * the user may open ("product management" opens Product Management); records
 * (vendors, customers, products, documents, users...) come from the API,
 * which searches only the modules the user may read.
 */
export function GlobalSearch({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [records, setRecords] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ctrl/Cmd+K focuses the search box.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  // Records: debounced; a slower earlier response never overwrites a newer one.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setRecords([]);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      const result = await globalSearchAction(q);
      if (request !== requestRef.current) return;
      setRecords(result.results);
      setError(result.error ?? null);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const options = useMemo<Option[]>(() => {
    const pages = matchPages(term, permissions).map((p) => ({
      key: `page:${p.href}`,
      group: 'Pages',
      title: p.label,
      subtitle: p.context === 'Module' ? 'Module' : p.context,
      href: p.href,
    }));
    const hits = records.map((hit) => ({
      key: `${hit.type}:${hit.id}`,
      group: RECORD_ROUTES[hit.type].label,
      title: hit.title,
      subtitle: hit.subtitle,
      href: RECORD_ROUTES[hit.type].href(hit),
    }));
    return [...pages, ...hits];
  }, [term, permissions, records]);

  useEffect(() => setHighlight(0), [options.length, term]);

  function go(option: Option | undefined) {
    if (!option) return;
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
    router.push(option.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(options[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showPanel = open && term.trim().length > 0;
  const activeId = options[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div ref={containerRef} role="search" className="relative max-w-xl flex-1">
      <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="Search pages and records"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel ? activeId : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={100}
        className="field-input h-10 rounded-full border-border bg-surface-muted pl-10"
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(28rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-border bg-surface py-1.5 shadow-popover">
          <ul id={listId} role="listbox" aria-label="Search results">
            {options.map((option, index) => {
              const firstOfGroup = index === 0 || options[index - 1].group !== option.group;
              return (
                <li key={option.key} role="presentation">
                  {firstOfGroup && (
                    <p role="presentation" className="px-4 pb-1 pt-2.5 text-[0.7rem] font-semibold uppercase tracking-wider text-ink-subtle">
                      {option.group}
                    </p>
                  )}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === highlight}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(option)}
                    className={clsx(
                      'mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                      index === highlight ? 'bg-accent-subtle' : 'hover:bg-surface-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{option.title}</span>
                      {option.subtitle && <span className="block truncate text-xs text-ink-muted">{option.subtitle}</span>}
                    </span>
                    <IconArrowRight size={14} className={clsx('shrink-0 text-ink-subtle', index !== highlight && 'opacity-0')} />
                  </div>
                </li>
              );
            })}
          </ul>

          {(searching || error || options.length === 0) && (
            <p role="status" className="px-4 py-2.5 text-sm text-ink-muted">
              {searching ? 'Searching records…' : error ? error : 'No pages or records match.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
