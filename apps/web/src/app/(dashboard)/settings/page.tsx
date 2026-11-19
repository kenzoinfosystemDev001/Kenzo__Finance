import type { Metadata } from 'next';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { setStockTrackingAction } from '@/lib/inventory-actions';
import type { AppSetting } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const canManage = user?.permissions.includes('settings.manage') ?? false;

  const { settings } = await apiFetch<{ settings: AppSetting[] }>(
    '/settings',
  ).catch(() => ({ settings: [] as AppSetting[] }));

  const stockTracking =
    settings.find((s) => s.key === 'inventory.stockTrackingEnabled')?.value === true;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Settings"
        description="Business switches that take effect immediately. Every change is recorded in the audit log."
      />

      <SectionCard
        title="Inventory"
        description="How the product catalogue treats physical quantities."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="text-base font-medium text-ink">Track stock quantities</p>
            <p className="mt-1 text-sm text-ink-muted">
              {stockTracking
                ? 'On. Products carry an on-hand quantity derived from the stock ledger, and movements can be recorded.'
                : 'Off. Products are a catalogue only: the system records what can be supplied, not how many units are held.'}
            </p>

            {!stockTracking && (
              <p className="mt-2 text-sm text-ink-subtle">
                Turning this on starts an empty ledger. Record an opening
                balance per product to set the starting count.
              </p>
            )}

            {stockTracking && (
              <p className="mt-2 text-sm text-warning">
                Turning this off hides quantities everywhere, but keeps the
                ledger intact; switching back on restores the same figures.
              </p>
            )}
          </div>

          <div className="shrink-0">
            {canManage ? (
              <form action={setStockTrackingAction}>
                <input
                  type="hidden"
                  name="enabled"
                  value={stockTracking ? 'false' : 'true'}
                />
                <button
                  type="submit"
                  className={stockTracking ? 'btn-secondary' : 'btn-primary'}
                >
                  {stockTracking ? 'Turn off' : 'Turn on'}
                </button>
              </form>
            ) : (
              <span className="badge bg-surface-muted text-ink-muted">
                {stockTracking ? 'On' : 'Off'}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="All settings"
        description="Current effective values."
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Value</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={setting.key}>
                  <td className="font-mono text-sm">{setting.key}</td>
                  <td className="font-mono text-sm">{String(setting.value)}</td>
                  <td className="text-ink-muted">{setting.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
