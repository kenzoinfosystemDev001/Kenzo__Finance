import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import { archiveProductAction, restoreProductAction } from '@/lib/inventory-actions';
import type { ProductDetail, StockLocation, StockMovement } from '@/lib/types';
import {
  Badge,
  DefinitionList,
  EmptyState,
  PageHeader,
  SectionCard,
} from '@/components/ui';
import { ProductImagePanel } from './image-panel';
import { StockPanel } from './stock-panel';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await apiFetch<ProductDetail>(`/products/${id}`);
    return { title: product.name };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];

  let product: ProductDetail;
  try {
    product = await apiFetch<ProductDetail>(`/products/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const canReadStock =
    product.stockTrackingEnabled && permissions.includes('stock.read');

  const [movements, locations] = canReadStock
    ? await Promise.all([
        apiFetch<{ recentMovements: StockMovement[] }>(`/stock/products/${id}`)
          .then((r) => r.recentMovements)
          .catch(() => []),
        apiFetch<StockLocation[]>('/stock/locations').catch(() => []),
      ])
    : [[], []];

  const specs = Object.entries(product.specifications ?? {});

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={product.name}
        description={`${product.productCode} · ${product.company.name} ${product.modelNumber}`}
        actions={
          <>
            <Link href="/products" className="btn-secondary">
              Back to catalogue
            </Link>
            {permissions.includes('product.update') && !product.archivedAt && (
              <Link href={`/products/${product.id}/edit`} className="btn-secondary">
                Edit
              </Link>
            )}
            {permissions.includes('product.archive') &&
              (product.archivedAt ? (
                <form action={restoreProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <button type="submit" className="btn-secondary">
                    Restore
                  </button>
                </form>
              ) : (
                <form action={archiveProductAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <button type="submit" className="btn-danger">
                    Archive
                  </button>
                </form>
              ))}
          </>
        }
      />

      {product.archivedAt && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2.5">
          <p className="text-sm text-danger">
            This product is archived. It stays linked to its vendors and history,
            but cannot be edited or stocked until restored.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard
            title="Catalogue details"
            actions={
              product.isActive ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge>Inactive</Badge>
              )
            }
          >
            <DefinitionList
              items={[
                {
                  label: 'Product code',
                  value: <span className="font-mono">{product.productCode}</span>,
                },
                { label: 'Brand', value: product.company.name },
                {
                  label: 'Model number',
                  value: <span className="font-mono">{product.modelNumber}</span>,
                },
                {
                  label: 'Design number',
                  value: product.designNumber && (
                    <span className="font-mono">{product.designNumber}</span>
                  ),
                },
                { label: 'Category', value: product.category?.name },
                {
                  label: 'Reorder level',
                  value: product.stockTrackingEnabled
                    ? (product.reorderLevel ?? 'Not set')
                    : 'Stock tracking is off',
                },
              ]}
            />

            {product.description && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-line text-base text-ink">
                  {product.description}
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Technical specifications" padded={false}>
            {specs.length === 0 ? (
              <EmptyState
                title="No specifications recorded"
                description="Add processor, memory, warranty and other details so sales can quote accurately."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col" className="w-1/3">
                        Specification
                      </th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specs.map(([key, value]) => (
                      <tr key={key}>
                        <td className="font-medium">{key}</td>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Vendors who supply this product"
            description="Mapped from each vendor's record."
            padded={false}
          >
            {product.vendors.length === 0 ? (
              <EmptyState
                title="No vendors mapped"
                description="Map this product from a vendor's page so it can be sourced."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Vendor</th>
                      <th scope="col">Location</th>
                      <th scope="col">Vendor SKU</th>
                      <th scope="col" className="text-right">
                        Lead time
                      </th>
                      <th scope="col">Preferred</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.vendors.map((mapping) => (
                      <tr key={mapping.id}>
                        <td>
                          <Link
                            href={`/vendors/${mapping.vendorId}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {mapping.vendor.businessName}
                          </Link>
                          <p className="font-mono text-sm text-ink-subtle">
                            {mapping.vendor.vendorCode}
                          </p>
                        </td>
                        <td>{mapping.vendor.city ?? '-'}</td>
                        <td className="font-mono text-sm">
                          {mapping.vendorSku ?? '-'}
                        </td>
                        <td className="text-right tabular-nums">
                          {mapping.leadTimeDays !== null
                            ? `${mapping.leadTimeDays} days`
                            : '-'}
                        </td>
                        <td>
                          {mapping.isPreferred ? (
                            <Badge tone="accent">Preferred</Badge>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <ProductImagePanel
            productId={product.id}
            imageDocumentId={product.imageDocumentId}
            imageFilename={product.imageDocument?.originalFilename ?? null}
            canEdit={
              permissions.includes('product.update') && !product.archivedAt
            }
          />

          <StockPanel
            productId={product.id}
            trackingEnabled={product.stockTrackingEnabled}
            onHand={product.onHand ?? 0}
            reorderLevel={product.reorderLevel}
            byLocation={product.stockByLocation ?? []}
            locations={locations}
            movements={movements}
            canRead={canReadStock}
            canPost={
              permissions.includes('stock.post') && !product.archivedAt
            }
            canManageSettings={permissions.includes('settings.manage')}
          />
        </div>
      </div>
    </div>
  );
}
