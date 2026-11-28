import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError, queryString } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth-actions';
import type { ActivityEntry, PaginatedResponse, ProductDetail, StockLocation, StockMovement } from '@/lib/types';
import { activityLabel, formatDate, formatDateTime, BUSINESS_TIME_ZONE } from '@/lib/vendor-labels';
import { DefinitionList, ErrorState, Pagination, Tabs, VendorStatusBadge } from '@/components/ui';
import { EmptyStateClient } from '@/components/panel-shared';
import { IconChevronLeft, IconPencil } from '@/components/icons';
import { ProductRowActions } from '../product-row-actions';
import { ModelsPanel, ProductDocumentsPanel, ProductImage, VendorsPanel } from './product-panels';
import { StockPanel } from './stock-panel';

const TAB_KEYS = ['overview', 'models', 'vendors', 'documents', 'activity', 'stock'] as const;
type TabKey = (typeof TAB_KEYS)[number];

async function loadProduct(id: string): Promise<ProductDetail> {
  try {
    return await apiFetch<ProductDetail>(`/products/${id}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await apiFetch<ProductDetail>(`/products/${id}`).catch(() => null);
  return { title: product?.name ?? 'Product' };
}

export default async function ProductProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string; created?: string; updated?: string; image?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const permissions = user?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);

  const product = await loadProduct(id);
  const archived = Boolean(product.archivedAt);
  const showStock = product.stockTrackingEnabled && can('stock.read');
  const requested = TAB_KEYS.includes(query.tab as TabKey) ? (query.tab as TabKey) : 'overview';
  const tab: TabKey = requested === 'stock' && !showStock ? 'overview' : requested;
  const tabHref = (key: TabKey) => `/products/${product.id}${key === 'overview' ? '' : `?tab=${key}`}`;

  return (
    <div className="space-y-5">
      <Link href="/products" className="link-pill-neutral text-sm">
        <IconChevronLeft size={16} /> All products
      </Link>

      {query.created && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">
          Product created. Add models, map vendors and attach documents below.
          {query.image === 'failed' && ' The image could not be uploaded — try again from the image panel.'}
        </p>
      )}
      {query.updated && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">Changes saved.</p>}
      {archived && (
        <p className="rounded-lg border border-border bg-surface-muted px-4 py-2.5 text-sm text-ink-muted">
          This product is archived. Its record, models and history are preserved, but it cannot be changed until restored.
        </p>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-start gap-5">
          <ProductImage
            product={product}
            canUpload={can('product.upload_documents') && !archived}
            canRemove={can('product.delete_documents') && !archived}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-ink">{product.name}</h1>
                  <span className="chip font-mono">{product.productCode}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {product.company.name}
                  {product.category && <> &middot; {product.category.name}</>}
                  {product.sku && <> &middot; SKU {product.sku}</>}
                </p>
                <div className="mt-2">
                  <VendorStatusBadge status={product.isActive ? 'ACTIVE' : 'INACTIVE'} archivedAt={product.archivedAt} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {can('product.update') && !archived && (
                  <Link href={`/products/${product.id}/edit`} className="btn-primary"><IconPencil size={16} /> Edit</Link>
                )}
                <ProductRowActions
                  product={{ id: product.id, name: product.name, isActive: product.isActive, archivedAt: product.archivedAt }}
                  permissions={permissions}
                  compact={false}
                  afterDelete="list"
                />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 sm:max-w-md">
              {[
                { label: 'Models', value: product.models.length, tab: 'models' as const },
                { label: 'Vendors', value: product.vendors.length, tab: 'vendors' as const },
                { label: 'Documents', value: product.documents.length, tab: 'documents' as const },
              ].map((item) => (
                <Link key={item.label} href={tabHref(item.tab)} scroll={false} className="rounded-lg bg-accent-subtle/50 px-2 py-1.5 transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{item.label}</dt>
                  <dd className="text-xl font-bold tabular-nums text-ink">{item.value}</dd>
                </Link>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Tabs
        active={tab}
        tabs={[
          { key: 'overview', label: 'Overview', href: tabHref('overview') },
          { key: 'models', label: 'Models', href: tabHref('models'), count: product.models.length },
          { key: 'vendors', label: 'Vendors', href: tabHref('vendors'), count: product.vendors.length },
          { key: 'documents', label: 'Documents', href: tabHref('documents'), count: product.documents.length },
          { key: 'activity', label: 'Activity History', href: tabHref('activity') },
          ...(showStock ? [{ key: 'stock', label: 'Stock', href: tabHref('stock') }] : []),
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className="card p-5 xl:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-ink">Product information</h2>
            <DefinitionList
              items={[
                { label: 'Product name', value: product.name },
                { label: 'Product ID', value: <span className="font-mono">{product.productCode}</span> },
                { label: 'SKU', value: product.sku },
                { label: 'Brand', value: product.company.name },
                { label: 'Category', value: product.category?.name },
                { label: 'Status', value: <VendorStatusBadge status={product.isActive ? 'ACTIVE' : 'INACTIVE'} archivedAt={product.archivedAt} /> },
              ]}
            />
            {product.description && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Description</p>
                <p className="mt-1 whitespace-pre-line text-base text-ink">{product.description}</p>
              </div>
            )}
          </section>
          <div className="space-y-5">
            <section className="card p-5 text-sm">
              <h2 className="mb-3 text-base font-semibold text-ink">Record</h2>
              <p className="text-ink-muted">Created {formatDateTime(product.createdAt)}{product.createdBy && ` by ${product.createdBy.fullName}`}</p>
              <p className="text-ink-muted">Last updated {formatDateTime(product.updatedAt)}{product.updatedBy && ` by ${product.updatedBy.fullName}`}</p>
            </section>
            <section className="card p-5">
              <h2 className="mb-3 text-base font-semibold text-ink">Associated vendors ({product.vendors.length})</h2>
              {product.vendors.length === 0 ? (
                <p className="text-sm text-ink-subtle">No vendors mapped yet.</p>
              ) : (
                <ul className="space-y-2">
                  {product.vendors.slice(0, 6).map((mapping) => (
                    <li key={mapping.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-ink">{mapping.vendor.businessName}</span>
                      <VendorStatusBadge status={mapping.vendor.status} archivedAt={mapping.vendor.archivedAt} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={tabHref('vendors')} scroll={false} className="link-pill mt-3 text-sm font-medium">Manage vendors</Link>
            </section>
          </div>
        </div>
      )}

      {tab === 'models' && (
        <ModelsPanel
          product={product}
          canManage={can('product.manage_models') && !archived}
          canDelete={can('product.delete')}
          canUploadImage={can('product.upload_documents')}
          canRemoveImage={can('product.delete_documents')}
        />
      )}

      {tab === 'vendors' && (
        <VendorsPanel
          product={product}
          canManage={can('product.manage_vendors') && !archived}
          canManageBrands={can('vendor.manage_brands')}
          canViewVendors={can('vendor.read')}
        />
      )}

      {tab === 'documents' && (
        <ProductDocumentsPanel
          product={product}
          canUpload={can('product.upload_documents') && !archived}
          canRemove={can('product.delete_documents') && !archived}
          canDownload={can('document.download')}
        />
      )}

      {tab === 'activity' && <ActivityTab productId={product.id} page={query.page} />}

      {tab === 'stock' && showStock && <StockTab product={product} permissions={permissions} />}
    </div>
  );
}

async function StockTab({ product, permissions }: { product: ProductDetail; permissions: string[] }) {
  const [movements, locations] = await Promise.all([
    apiFetch<{ recentMovements: StockMovement[] }>(`/stock/products/${product.id}`)
      .then((r) => r.recentMovements)
      .catch(() => [] as StockMovement[]),
    apiFetch<StockLocation[]>('/stock/locations').catch(() => [] as StockLocation[]),
  ]);
  return (
    <StockPanel
      productId={product.id}
      trackingEnabled={product.stockTrackingEnabled}
      onHand={product.onHand ?? 0}
      reorderLevel={product.reorderLevel}
      byLocation={product.stockByLocation ?? []}
      locations={locations}
      movements={movements}
      canRead
      canPost={permissions.includes('stock.post') && !product.archivedAt}
      canManageSettings={permissions.includes('settings.manage')}
    />
  );
}

async function ActivityTab({ productId, page }: { productId: string; page?: string }) {
  let data: PaginatedResponse<ActivityEntry>;
  try {
    data = await apiFetch<PaginatedResponse<ActivityEntry>>(`/products/${productId}/activity${queryString({ page: page ?? '1', pageSize: 20 })}`);
  } catch (error) {
    return <ErrorState title="Could not load activity" message={error instanceof ApiError ? error.messages[0] : 'The server could not be reached.'} />;
  }

  return (
    <section className="card">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-lg font-semibold text-ink">Activity history</h2>
        <p className="text-sm text-ink-muted">From the audit log &mdash; the product, its models, documents and vendor mappings.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyStateClient title="No activity recorded" description="Changes to this product will appear here." />
      ) : (
        <>
          <ol className="divide-y divide-border">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex gap-4 px-5 py-3.5">
                <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{activityLabel(entry.action)}</p>
                    <time dateTime={entry.createdAt} className="text-xs text-ink-subtle">{formatDate(entry.createdAt)} &middot; {new Date(entry.createdAt).toLocaleTimeString('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                  {entry.summary && <p className="text-sm text-ink-muted">{entry.summary}</p>}
                  <p className="text-xs text-ink-subtle">by {entry.actor?.fullName ?? 'System'}</p>
                </div>
              </li>
            ))}
          </ol>
          <Pagination meta={data.meta} basePath={`/products/${productId}`} params={{ tab: 'activity' }} noun="events" />
        </>
      )}
    </section>
  );
}
