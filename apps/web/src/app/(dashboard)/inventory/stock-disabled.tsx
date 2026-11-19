import Link from 'next/link';
import { PageHeader } from '@/components/ui';

/**
 * Shown when stock tracking is off.
 *
 * Deliberately not an empty table: "no rows" would read as "no stock", when in
 * fact quantities are not being recorded at all.
 */
export function StockTrackingDisabled({
  canManageSettings,
}: {
  canManageSettings: boolean;
}) {
  return (
    <>
      <PageHeader title="Inventory" />

      <div className="card mx-auto max-w-2xl p-6">
        <h2 className="text-lg font-semibold text-ink">
          Stock tracking is switched off
        </h2>

        <p className="mt-2 text-base text-ink-muted">
          Products are currently a catalogue only: the system records what
          Kenzo Infosystems can supply, but not how many units are physically
          held.
        </p>

        <div className="mt-5 rounded-md border border-border bg-surface-muted p-4">
          <p className="text-sm font-medium text-ink">Before switching it on</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-muted">
            <li>Confirm that stock is actually held, rather than drop-shipped.</li>
            <li>Decide who may record receipts, issues and adjustments.</li>
            <li>Agree whether one store or several locations are needed.</li>
          </ul>
          <p className="mt-3 text-sm text-ink-muted">
            Turning it on starts an empty ledger. Record an opening balance per
            product to establish the starting count.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {canManageSettings ? (
            <Link href="/settings" className="btn-primary">
              Go to settings
            </Link>
          ) : (
            <p className="text-sm text-ink-subtle">
              A Super Admin can enable this in Settings.
            </p>
          )}
          <Link href="/products" className="btn-secondary">
            Back to catalogue
          </Link>
        </div>
      </div>
    </>
  );
}
