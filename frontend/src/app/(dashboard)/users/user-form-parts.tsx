'use client';

import { useId, useState } from 'react';
import clsx from 'clsx';
import { IconEye } from '@/components/icons';
import { passwordStrength } from '@/lib/user-labels';

/**
 * Password input with a strength hint. The value only lives in component
 * state until it is submitted; it is never echoed back after saving.
 */
export function PasswordField({
  label,
  value,
  onChange,
  showStrength = true,
  autoComplete = 'new-password',
  required = true,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  showStrength?: boolean;
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          maxLength={256}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-note`}
          className={clsx('field-input pr-10', error && 'border-danger focus:border-danger focus:ring-danger/20')}
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          <IconEye size={16} />
        </button>
      </div>
      <div id={`${id}-note`}>
        {error ? (
          <p className="field-error">{error}</p>
        ) : showStrength && value ? (
          <p
            className={clsx(
              'field-hint',
              strength.tone === 'danger' && 'text-danger',
              strength.tone === 'warning' && 'text-warning',
              strength.tone === 'success' && 'text-success',
            )}
          >
            <span className="font-semibold">{strength.label}.</span> {strength.message}
          </p>
        ) : (
          showStrength && <p className="field-hint">At least 12 characters.</p>
        )}
      </div>
    </div>
  );
}

/** Multi-select of roles as checkboxes, with each role's permission count. */
export function RolePicker({
  roles,
  selected,
  onChange,
  disabled,
}: {
  roles: Array<{ code: string; name: string; description: string | null; permissions: string[] }>;
  selected: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...new Set([...selected, code])] : selected.filter((c) => c !== code));

  if (roles.length === 0) {
    return <p className="text-sm text-ink-muted">No roles are available to assign.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {roles.map((role) => {
        const checked = selected.includes(role.code);
        return (
          <li key={role.code}>
            <label
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                checked ? 'border-accent bg-accent-subtle' : 'border-border hover:bg-surface-muted',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => toggle(role.code, event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{role.name}</span>
                <span className="block font-mono text-xs text-ink-subtle">{role.code}</span>
                {role.description && <span className="mt-0.5 block text-xs text-ink-muted">{role.description}</span>}
                <span className="mt-0.5 block text-xs text-ink-subtle">{role.permissions.length} permission(s)</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
