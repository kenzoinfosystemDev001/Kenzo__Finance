'use client';

import { BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  postStockMovementAction,
  type StockFormState,
} from '@/lib/inventory-actions';
import type { StockLocation, StockMovement, StockMovementType } from '@/lib/types';

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING_BALANCE: 'Opening balance',
  RECEIPT: 'Receipt (goods in)',
  ISSUE: 'Issue (goods out)',
  ADJUSTMENT_IN: 'Adjustment - increase',
  ADJUSTMENT_OUT: 'Adjustment - decrease',
  RETURN_IN: 'Customer return (in)',
  RETURN_OUT: 'Return to vendor (out)',
};

/** Types that have no source document, so the API requires a reason. */
const REASON_REQUIRED: StockMovementType[] = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

function PostButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Recording...' : 'Record movement'}
    </button>
  );
}

export function StockPanel({
  productId,
  trackingEnabled,
  onHand,
  reorderLevel,
  byLocation,
  locations,
  movements,
  canRead,
  canPost,
  canManageSettings,
}: {
  productId: string;
  trackingEnabled: boolean;
  onHand: number;
  reorderLevel: number | null;
  byLocation: Array<{ location: { id: string; name: string } | null; onHand: number }>;
  locations: StockLocation[];
  movements: StockMovement[];
  canRead: boolean;
  canPost: boolean;
  canManageSettings: boolean;
}) {
  // Controlled, so a rejected movement (e.g. not enough stock) keeps what was
  // typed: React 19 resets uncontrolled fields after every form action.
  // They are cleared only once a movement has actually been posted.
  const [quantity, setQuantity] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');

  const [state, formAction] = useActionState<StockFormState, FormData>(
    async (previous, formData) => {
      const result = await postStockMovementAction(productId, previous, formData);
      if (result.success) {
        setQuantity('');
        setReason('');
      }
      return result;
    },
    {},
  );

  // Starts unset: the user chooses the movement type.
  const [type, setType] = useState<StockMovementType | ''>('');
  const reasonRequired = type !== '' && REASON_REQUIRED.includes(type);

  if (!trackingEnabled) {
    return (
      <section className="card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">Stock</h2>
        </div>
        <div className="p-4">
          <p className="text-base text-ink-muted">
            Stock tracking is switched off, so this product is a catalogue entry
            only and no quantity is recorded.
          </p>
          {canManageSettings && (
            <Link href="/settings" className="btn-secondary mt-3 w-full">
              Open settings
            </Link>
          )}
        </div>
      </section>
    );
  }

  if (!canRead) {
    return (
      <section className="card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">Stock</h2>
        </div>
        <div className="p-4">
          <p className="text-base text-ink-muted">
            You do not have permission to view stock figures.
          </p>
        </div>
      </section>
    );
  }

  const isLow = reorderLevel !== null && onHand <= reorderLevel;

  return (
    <section className="card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Stock</h2>
      </div>

      <div className="border-b border-border p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          On hand
        </p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            onHand <= 0 ? 'text-danger' : isLow ? 'text-warning' : 'text-ink'
          }`}
        >
          {onHand}
        </p>
        {onHand <= 0 && <p className="mt-1 text-sm text-danger">Out of stock</p>}
        {onHand > 0 && isLow && (
          <p className="mt-1 text-sm text-warning">
            At or below reorder level ({reorderLevel})
          </p>
        )}

        {byLocation.length > 1 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3">
            {byLocation.map((row) => (
              <li
                key={row.location?.id ?? 'unknown'}
                className="flex justify-between text-sm"
              >
                <span className="text-ink-muted">
                  {row.location?.name ?? 'Unknown location'}
                </span>
                <span className="tabular-nums text-ink">{row.onHand}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canPost && (
        <div className="border-b border-border p-4">
          <form action={formAction} className="space-y-3">
            <div>
              <label htmlFor="type" className="field-label">
                Movement
              </label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as StockMovementType | '')}
                className="field-input"
                required
              >
                <option value="">Select movement type</option>
                {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="quantity" className="field-label">
                Quantity
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                required
                className="field-input"
                placeholder="Enter quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="field-hint">
                Always a positive number; the movement type sets the direction.
              </p>
            </div>

            {locations.length > 1 && (
              <div>
                <label htmlFor="locationId" className="field-label">
                  Location
                </label>
                <select
                  id="locationId"
                  name="locationId"
                  className="field-input"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">Default location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="reason" className="field-label">
                Reason {reasonRequired && <span className="text-danger">*</span>}
              </label>
              <input
                id="reason"
                name="reason"
                required={reasonRequired}
                className="field-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  reasonRequired ? 'Why the count changed' : 'Optional note'
                }
              />
            </div>

            <PostButton />

            {state.error && (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            )}
            {state.success && (
              <p role="status" className="text-sm text-success">
                {state.success}
              </p>
            )}
          </form>
        </div>
      )}

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Recent movements
          </p>
          <Link
            href={`/inventory/ledger?productId=${productId}`}
            className="text-sm text-accent hover:underline"
          >
            Full ledger
          </Link>
        </div>

        {movements.length === 0 ? (
          <p className="text-sm text-ink-subtle">No movements recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {movements.slice(0, 8).map((movement) => (
              <li
                key={movement.id}
                className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {MOVEMENT_LABELS[movement.type]}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {new Date(movement.occurredAt).toLocaleDateString('en-IN', { timeZone: BUSINESS_TIME_ZONE,
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {movement.createdBy && ` · ${movement.createdBy.fullName}`}
                  </p>
                  {movement.reason && (
                    <p className="truncate text-xs text-ink-muted">
                      {movement.reason}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-medium tabular-nums ${
                      movement.quantityDelta > 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {movement.quantityDelta > 0 ? '+' : ''}
                    {movement.quantityDelta}
                  </p>
                  <p className="text-xs tabular-nums text-ink-subtle">
                    = {movement.balanceAfter}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
