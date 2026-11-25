'use client';

import { useState } from 'react';

/**
 * A decorative background image with a tint layer on top.
 *
 * If the image fails to load, this renders nothing, so the parent's default
 * colour shows through: no broken-image icon, and nothing blocks the page.
 * It is positioned by the caller (absolute or fixed); it does not set its own
 * stacking order.
 */
export function BackgroundImage({
  src,
  overlayClassName,
  className,
}: {
  src: string | null;
  /** Tint over the image for readability, e.g. "bg-sidebar/85". */
  overlayClassName?: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;

  return (
    <div aria-hidden className={`overflow-hidden pointer-events-none ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our own proxy route, not a static asset */}
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setFailedSrc(src)}
        className="h-full w-full object-cover"
      />
      {overlayClassName && <div className={`absolute inset-0 ${overlayClassName}`} />}
    </div>
  );
}
