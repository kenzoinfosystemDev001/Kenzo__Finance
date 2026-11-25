import clsx from 'clsx';

/**
 * The company logo. Served from /brand-logo, which returns the logo uploaded
 * in Admin -> Appearance (stored in the database) or, if none, the bundled
 * default. A plain <img> so the browser always asks the server, never a stale copy.
 *
 * Decorative wherever it sits next to the written company name, so it is
 * hidden from screen readers by default; pass `label` where the logo stands alone.
 */
export function BrandLogo({
  className,
  label,
}: {
  className?: string;
  label?: string;
  /** Kept for existing call sites; the logo is always eager-loaded. */
  priority?: boolean;
}) {
  return (
    // Plain <img>: /brand-logo is a same-origin route, not a static asset.
    <img
      src="/brand-logo"
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={307}
      height={307}
      decoding="async"
      className={clsx('shrink-0 object-contain', className)}
    />
  );
}
