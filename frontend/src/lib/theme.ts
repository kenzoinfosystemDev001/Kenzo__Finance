/**
 * Theme preference shared by server and client code. Kept free of
 * 'server-only' and 'use server' so both sides can import the constants.
 *
 * "system" follows the device setting (the CSS media query in globals.css).
 * "light" and "dark" are stored in a cookie and set on <html data-theme>.
 */

export const THEME_COOKIE = 'kenzo-theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Reads a stored cookie value, falling back to "system" for anything unknown. */
export function parseTheme(value: string | undefined): Theme {
  return isTheme(value) ? value : 'system';
}

/** Applies a theme to the open page immediately, without waiting for a reload. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
