'use client';

import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { IconCheck, IconChevronDown, IconPlus, IconSearch, IconX } from './icons';

export interface SearchOption {
  id: string;
  label: string;
  /** Secondary text under the label, e.g. brand and model number. */
  detail?: string;
}

/**
 * Type-ahead picker over a server search (brands, products). Results always
 * come from the shared master data, so picking never creates a duplicate.
 * An optional `onCreate` offers to register a missing entry through the same
 * master-data API (shown only when the caller has permission).
 */
export function SearchSelect({
  label,
  placeholder = 'Search...',
  search,
  selected,
  onChange,
  multiple = false,
  onCreate,
  createLabel = (term: string) => `Create "${term}"`,
  disabledIds = [],
  emptyText = 'No matches',
  compact = false,
  hideLabel = false,
}: {
  label: string;
  placeholder?: string;
  search: (term: string) => Promise<SearchOption[]>;
  selected: SearchOption[];
  onChange: (selected: SearchOption[]) => void;
  multiple?: boolean;
  onCreate?: (term: string) => Promise<SearchOption | null>;
  createLabel?: (term: string) => string;
  /** Options that cannot be picked, e.g. brands already mapped. */
  disabledIds?: string[];
  emptyText?: string;
  /** Toolbar style: looks like a select box. */
  compact?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  // Debounced server search; stale responses are dropped by request id.
  useEffect(() => {
    if (!open) return;
    const request = ++requestRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const results = await search(term).catch(() => []);
      if (request === requestRef.current) {
        setOptions(results);
        setHighlight(0);
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [term, open, search]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectedIds = new Set(selected.map((option) => option.id));

  const pick = (option: SearchOption) => {
    if (disabledIds.includes(option.id)) return;
    if (multiple) {
      onChange(
        selectedIds.has(option.id)
          ? selected.filter((item) => item.id !== option.id)
          : [...selected, option],
      );
      setTerm('');
      inputRef.current?.focus();
    } else {
      onChange([option]);
      setOpen(false);
      setTerm('');
    }
  };

  const exactMatch = options.some((option) => option.label.toLowerCase() === term.trim().toLowerCase());
  const canCreate = Boolean(onCreate && term.trim().length >= 2 && !exactMatch && !loading);

  const create = async () => {
    if (!onCreate) return;
    setCreating(true);
    const created = await onCreate(term.trim());
    setCreating(false);
    if (created) pick(created);
  };

  const triggerText = multiple
    ? selected.length
      ? `${selected.length} selected`
      : placeholder
    : selected[0]?.label ?? placeholder;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>

      {!open ? (
        <button
          id={id}
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={clsx(
            'field-input flex items-center justify-between gap-2 text-left',
            compact && 'h-10',
            !selected.length && 'text-ink-subtle',
          )}
          aria-haspopup="listbox"
        >
          <span className="truncate">{triggerText}</span>
          <IconChevronDown size={16} className="shrink-0 text-ink-subtle" />
        </button>
      ) : (
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id={id}
            ref={inputRef}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlight((value) => Math.min(value + 1, options.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlight((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (options[highlight]) pick(options[highlight]);
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            autoComplete="off"
            className={clsx('field-input pl-9', compact && 'h-10')}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-popover">
          <ul id={`${id}-list`} role="listbox" aria-multiselectable={multiple} className="max-h-64 overflow-y-auto py-1">
            {loading && <li className="px-3 py-2 text-sm text-ink-subtle">Searching...</li>}
            {!loading && options.length === 0 && <li className="px-3 py-2 text-sm text-ink-subtle">{emptyText}</li>}
            {!loading &&
              options.map((option, index) => {
                const isSelected = selectedIds.has(option.id);
                const isDisabled = disabledIds.includes(option.id);
                return (
                  <li key={option.id} role="option" aria-selected={isSelected} aria-disabled={isDisabled}>
                    <button
                      type="button"
                      disabled={isDisabled}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(option)}
                      className={clsx(
                        'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                        index === highlight && !isDisabled && 'bg-surface-muted',
                        isDisabled ? 'cursor-not-allowed text-ink-subtle' : 'text-ink',
                      )}
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-accent">{isSelected && <IconCheck size={14} />}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{option.label}</span>
                        {(option.detail || isDisabled) && (
                          <span className="block truncate text-xs text-ink-subtle">
                            {isDisabled ? 'Already mapped' : option.detail}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          {canCreate && (
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium text-accent hover:bg-accent-subtle"
            >
              <IconPlus size={14} />
              {creating ? 'Creating...' : createLabel(term.trim())}
            </button>
          )}
          {multiple && (
            <div className="flex justify-end border-t border-border bg-surface-muted px-2 py-1.5">
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {multiple && selected.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
          {selected.map((option) => (
            <li key={option.id} className="chip">
              <span className="max-w-[16rem] truncate">{option.label}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((item) => item.id !== option.id))}
                className="rounded-full p-0.5 hover:bg-accent/15"
                aria-label={`Remove ${option.label}`}
              >
                <IconX size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
