import Image from 'next/image';
import clsx from 'clsx';

/**
 * The company logo (public/logo.png, transparent background, square).
 *
 * Decorative wherever it sits next to the written company name, so it is
 * hidden from screen readers by default; pass `label` where the logo stands
 * alone.
 */
export function BrandLogo({
  className,
  label,
  priority,
}: {
  className?: string;
  label?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={307}
      height={307}
      priority={priority}
      className={clsx('shrink-0 object-contain', className)}
    />
  );
}
