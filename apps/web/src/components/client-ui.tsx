'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import clsx from 'clsx';
import type { ActionResult } from '@/lib/vendor-actions';
import { IconAlert, IconDots, IconX } from './icons';

/**
 * Interactive building blocks shared by the vendor screens. Server-only
 * components (PageHeader, Badge, ...) stay in ui.tsx.
 */

// ---------------------------------------------------------------------------
// Modal (native <dialog>: focus trapping, Esc and backdrop come for free)
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        'w-[calc(100%-2rem)] rounded-xl border border-border bg-surface p-0 text-ink shadow-popover backdrop:bg-sidebar/50',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-xl',
        size === 'lg' && 'max-w-3xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-ink">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
            </div>
            <button type="button" className="icon-btn -mr-1" onClick={onClose} aria-label="Close">
              <IconX />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-muted px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirmation for destructive / state-changing actions
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  withReason = false,
  reasonLabel = 'Reason (optional, kept in the activity history)',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: (reason: string) => Promise<ActionResult>;
  withReason?: boolean;
  reasonLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [reason, setReason] = useState('');
  const reasonId = useId();

  useEffect(() => {
    if (open) {
      setResult({});
      setReason('');
    }
  }, [open]);

  const confirm = () =>
    startTransition(async () => {
      const outcome = await onConfirm(reason);
      if (outcome.ok) onClose();
      else setResult(outcome);
    });

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={confirm}
            disabled={pending}
          >
            {pending ? 'Working...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-base text-ink-muted">{message}</div>
        {withReason && (
          <div>
            <label htmlFor={reasonId} className="field-label">
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="field-input"
            />
          </div>
        )}
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
}

export function ActionMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
        return;
      }
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="icon-btn border border-border"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <IconDots />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[190px] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-popover"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={clsx(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted',
                item.tone === 'danger' ? 'text-danger' : 'text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function ResultAlert({ result }: { result: ActionResult & { success?: string } }) {
  if (result.error) {
    return (
      <div role="alert" className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5">
        <IconAlert className="mt-0.5 shrink-0 text-danger" size={16} />
        <div className="min-w-0 text-sm text-danger">
          <p className="font-medium">{result.error}</p>
          {result.errors && (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-danger/90">
              {result.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {result.details && (
            <p className="mt-1 text-danger/90">
              Linked records:{' '}
              {Object.entries(result.details)
                .map(([key, count]) => `${count} ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`)
                .join(', ')}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (result.success) {
    return (
      <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
        {result.success}
      </p>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function TextField({
  label,
  value,
  onChange,
  error,
  required,
  hint,
  type = 'text',
  placeholder,
  maxLength,
  inputMode,
  autoComplete = 'off',
  badge,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  hint?: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  /** Extra marker next to the label, e.g. OCR confidence. */
  badge?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-danger"> *</span>}
        {badge}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={clsx('field-input', error && 'border-danger focus:border-danger focus:ring-danger/20')}
      />
      {error ? (
        <p id={`${id}-note`} className="field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-note`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="field-input">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]"
      />
      <label htmlFor={id} className="text-base text-ink">
        {label}
        {hint && <span className="block text-xs text-ink-subtle">{hint}</span>}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side format checks (the API re-validates everything)
// ---------------------------------------------------------------------------

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export const isPhone = (value: string) => {
  const trimmed = value.trim();
  if (!/^\+?[\d\s\-().]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
};

export const isWebsite = (value: string) =>
  /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d{2,5})?(\/\S*)?$/i.test(value.trim());

export const isPostalCode = (value: string) => /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/.test(value.trim());

export const isGstinFormat = (value: string) =>
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.replace(/\s/g, '').toUpperCase());

export const isPanFormat = (value: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.replace(/\s/g, '').toUpperCase());
