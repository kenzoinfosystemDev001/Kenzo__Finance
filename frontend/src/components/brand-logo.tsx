import clsx from 'clsx';

/**
 * The company logo, served from the bundled public/logo.png.
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
    // Plain <img> for the bundled static logo.
    <img
      src="/logo.png"
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={307}
      height={307}
      decoding="async"
      className={clsx('shrink-0 object-contain', className)}
    />
  );
}
