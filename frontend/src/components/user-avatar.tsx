'use client';

import { useState } from 'react';
import { initialsOf, profilePhotoUrl, type PhotoOwner } from '@/lib/profile-photo';

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  card: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
} as const;

/**
 * Circular avatar: the profile photo when one is set, otherwise initials.
 * If the image fails to load, it falls back to initials rather than showing a
 * broken-image icon.
 */
export function UserAvatar({
  owner,
  fullName,
  version,
  size = 'md',
  ring = false,
  className = '',
}: {
  owner: PhotoOwner;
  fullName: string;
  version: string | null | undefined;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
}) {
  const src = profilePhotoUrl(owner, version);
  // Keyed by URL: a new version gets a fresh attempt, even after an earlier failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = src !== null && failedSrc !== src;

  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${SIZES[size]} ${
    ring ? 'ring-2 ring-surface shadow-card' : ''
  } ${className}`;

  if (showPhoto) {
    return (
      // Plain <img>: a same-origin, authenticated proxy route, not a static asset.
      <img
        src={src}
        alt={`Profile photo of ${fullName}`}
        width={256}
        height={256}
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={`${base} bg-surface-muted object-cover`}
      />
    );
  }

  return (
    <span aria-hidden className={`${base} bg-sidebar text-white`}>
      {initialsOf(fullName) || '?'}
    </span>
  );
}
