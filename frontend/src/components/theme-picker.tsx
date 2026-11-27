'use client';

import { useState, useTransition } from 'react';
import { applyTheme, THEMES, THEME_LABELS, type Theme } from '@/lib/theme';
import { setThemeAction } from '@/lib/theme-actions';

/** Light, dark or follow-the-device. The choice applies at once and is remembered in a cookie. */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function choose(next: Theme) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    setError(null);
    applyTheme(next);
    startSaving(async () => {
      const result = await setThemeAction(next);
      if ('error' in result) {
        // Keep the screen honest: revert if the choice could not be stored.
        setTheme(previous);
        applyTheme(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div role="group" aria-label="Theme" className="inline-flex rounded-lg border border-border bg-surface-muted p-1">
        {THEMES.map((option) => {
          const selected = option === theme;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              disabled={saving}
              onClick={() => choose(option)}
              className={
                selected
                  ? 'rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-card'
                  : 'rounded-md px-4 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink'
              }
            >
              {THEME_LABELS[option]}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
