import type { Config } from 'tailwindcss';

/**
 * Enterprise ERP design tokens.
 *
 * Blue / white / navy: one neutral scale, one blue accent, semantic status
 * colours, and a dark navy navigation rail. No decorative gradients.
 *
 * Colours are stored as raw RGB channels so Tailwind's opacity modifiers
 * (border-danger/30, ring-accent/20) work on them. A plain `var(--x)` holding
 * a hex value cannot be given an alpha channel.
 */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: withAlpha('--canvas'),
        surface: withAlpha('--surface'),
        'surface-muted': withAlpha('--surface-muted'),
        border: withAlpha('--border'),
        'border-strong': withAlpha('--border-strong'),
        ink: withAlpha('--ink'),
        'ink-muted': withAlpha('--ink-muted'),
        'ink-subtle': withAlpha('--ink-subtle'),
        accent: withAlpha('--accent'),
        'accent-hover': withAlpha('--accent-hover'),
        'accent-subtle': withAlpha('--accent-subtle'),
        danger: withAlpha('--danger'),
        'danger-subtle': withAlpha('--danger-subtle'),
        warning: withAlpha('--warning'),
        'warning-subtle': withAlpha('--warning-subtle'),
        success: withAlpha('--success'),
        'success-subtle': withAlpha('--success-subtle'),
        sidebar: withAlpha('--sidebar'),
        'sidebar-hover': withAlpha('--sidebar-hover'),
        'sidebar-ink': withAlpha('--sidebar-ink'),
        'sidebar-muted': withAlpha('--sidebar-muted'),
        'sidebar-active': withAlpha('--sidebar-active'),
        'sidebar-indicator': withAlpha('--sidebar-indicator'),
        'sky-blue': withAlpha('--sky-blue'),
        'lavender-hover': withAlpha('--lavender-hover'),
        'info-subtle': withAlpha('--info-subtle'),
        highlight: withAlpha('--highlight'),
        'chart-primary': withAlpha('--chart-primary'),
        'chart-secondary': withAlpha('--chart-secondary'),
        'chart-highlight': withAlpha('--chart-highlight'),
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem' }],
      },
      borderRadius: { md: '6px', lg: '8px', xl: '12px' },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        popover: '0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px -2px rgb(16 24 40 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
