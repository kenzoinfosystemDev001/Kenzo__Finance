import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { StockLocation } from '@/lib/types';
import { Badge, EmptyState, PageHeader } from '@/components/ui';
import { StockTrackingDisabled } from '../stock-disabled';
import { CreateLocationForm } from './create-location-form';

export const metadata: Metadata = { title: 'Stock locations' };

export default async function StockLocationsPage() {
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  const status = await apiFetch<{ stockTrackingEnabled: boolean }>(
    '/stock/status',
  ).catch(() => ({ stockTrackingEnabled: false }));

  if (!status.stockTrackingEnabled) {
    return (
      <StockTrackingDisabled
        canManageSettings={permissions.includes('settings.manage')}
      />
    );
  }

  const locations = await apiFetch<StockLocation[]>('/stock/locations').catch(
    () => [],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Stock locations"
        description="Where stock is physically held. A default location is created automatically on the first movement."
        actions={
          <Link href="/inventory" className="btn-secondary">
            Back to inventory
          </Link>
        }
      />

      {permissions.includes('stock.manage_locations') && (
        <div className="card mb-4 p-4">
          <CreateLocationForm />
        </div>
      )}

      <div className="card overflow-hidden">
        {locations.length === 0 ? (
          <EmptyState
            title="No locations yet"
            description="One is created automatically the first time a stock movement is recorded."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">Code</th>
                  <th scope="col">Address</th>
                  <th scope="col" className="text-right">
                    Movements
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location) => (
                  <tr key={location.id}>
                    <td className="font-medium">
                      {location.name}
                      {location.isDefault && (
                        <span className="ml-2">
                          <Badge tone="accent">Default</Badge>
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-sm">{location.code}</td>
                    <td className="text-ink-muted">{location.address ?? '-'}</td>
                    <td className="text-right tabular-nums">
                      {location._count?.movements ?? 0}
                    </td>
                    <td>
                      {location.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
