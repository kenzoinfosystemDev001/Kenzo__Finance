'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setCustomerFavouriteAction } from '@/lib/customer-actions';
import { IconStar } from './icons';

/** Gold-star badge shown beside a favourite customer. Text is included, so the status does not rely on colour alone. */
export function FavouriteBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-subtle px-2 py-0.5 text-xs font-semibold text-warning">
      <IconStar size={12} />
      Favourite
    </span>
  );
}

/**
 * Admin-only control to mark or unmark a favourite. The server checks
 * settings.manage again; rendering this only for administrators is a
 * convenience, not the access control.
 */
export function FavouriteToggle({ customerId, customerName, favourite }: { customerId: string; customerName: string; favourite: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-pressed={favourite}
        aria-label={`${favourite ? 'Unmark' : 'Mark'} ${customerName} as a favourite customer`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const outcome = await setCustomerFavouriteAction(customerId, !favourite);
            if (outcome.ok) router.refresh();
            else setError(outcome.error ?? 'The favourite status could not be changed.');
          })
        }
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
          favourite ? 'border-warning/40 bg-warning-subtle text-warning hover:bg-warning/10' : 'border-border-strong bg-surface text-ink-muted hover:bg-surface-muted'
        }`}
      >
        <IconStar size={13} />
        {pending ? 'Saving...' : favourite ? 'Unmark' : 'Mark favourite'}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
