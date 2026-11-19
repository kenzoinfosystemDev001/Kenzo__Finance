'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import {
  CheckboxField,
  ConfirmDialog,
  Modal,
  ResultAlert,
  TextField,
} from '@/components/client-ui';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { QuickProductModal } from '@/components/vendor-form';
import { IconPencil, IconPlus, IconShield, IconStar, IconTrash } from '@/components/icons';
import {
  mapBrandsAction,
  mapProductsAction,
  quickCreateBrandAction,
  searchBrandsAction,
  searchProductsAction,
  unmapBrandAction,
  unmapProductAction,
  updateBrandMappingAction,
  updateProductMappingAction,
  type ActionResult,
  type ProductMappingInput,
} from '@/lib/vendor-actions';
import { formatDate } from '@/lib/vendor-labels';
import type { ProductCategory, VendorCompanyMapping, VendorProductMapping } from '@/lib/types';
import { EmptyStateClient, PanelHeader } from './panel-shared';

const useBrandSearch = () =>
  useCallback(async (term: string) => (await searchBrandsAction(term)).map((b) => ({ id: b.id, label: b.name })), []);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export function BrandsPanel({
  vendorId,
  mappings,
  products,
  canManage,
  canCreateBrand,
}: {
  vendorId: string;
  mappings: VendorCompanyMapping[];
  products: VendorProductMapping[];
  canManage: boolean;
  canCreateBrand: boolean;
}) {
  const router = useRouter();
  const brandSearch = useBrandSearch();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SearchOption[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [editing, setEditing] = useState<VendorCompanyMapping | null>(null);
  const [removing, setRemoving] = useState<VendorCompanyMapping | null>(null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const productCount = (companyId: string) => products.filter((p) => p.product.company.id === companyId).length;

  const createBrand = useCallback(async (name: string) => {
    const created = await quickCreateBrandAction(name);
    if (!created.brand) {
      setResult({ error: created.error });
      return null;
    }
    return { id: created.brand.id, label: created.brand.name };
  }, []);

  const save = () =>
    startTransition(async () => {
      if (!selected.length) {
        setResult({ error: 'Select at least one brand.' });
        return;
      }
      const outcome = await mapBrandsAction(vendorId, selected.map((s) => s.id), authorized);
      if (outcome.ok) {
        setAdding(false);
        setSelected([]);
        setAuthorized(false);
        setResult({});
        router.refresh();
      } else {
        setResult(outcome);
        router.refresh();
      }
    });

  return (
    <section className="card">
      <PanelHeader
        title="Brands supplied"
        description="Shared brands from the brand master. Mapping a product maps its brand automatically."
        actions={
          canManage && (
            <button type="button" className="btn-primary" onClick={() => { setResult({}); setAdding(true); }}>
              <IconPlus size={16} /> Map brands
            </button>
          )
        }
      />

      {mappings.length === 0 ? (
        <EmptyStateClient title="No brands mapped" description="Map the brands this vendor can supply so it appears in brand searches." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Authorised partner</th>
                <th scope="col" className="text-right">Mapped products</th>
                <th scope="col">Remarks</th>
                <th scope="col">Since</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td><span className="chip text-sm">{mapping.company.name}</span></td>
                  <td>
                    {mapping.isAuthorized ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><IconShield size={14} /> Authorised</span>
                    ) : (
                      <span className="text-ink-subtle">No</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{productCount(mapping.companyId)}</td>
                  <td className="max-w-[260px] text-ink-muted">{mapping.remarks ?? '—'}</td>
                  <td className="whitespace-nowrap">{formatDate(mapping.createdAt)}</td>
                  {canManage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" onClick={() => { setResult({}); setEditing(mapping); }} aria-label={`Edit ${mapping.company.name}`}>
                          <IconPencil />
                        </button>
                        <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(mapping)} aria-label={`Remove ${mapping.company.name}`}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <Modal
            open={adding}
            onClose={() => setAdding(false)}
            title="Map brands to this vendor"
            description="Choose from the shared brand master. Brands already mapped are greyed out."
            footer={
              <>
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)} disabled={pending}>Cancel</button>
                <button type="button" className="btn-primary" onClick={save} disabled={pending || !selected.length}>
                  {pending ? 'Mapping...' : `Map ${selected.length || ''} brand${selected.length === 1 ? '' : 's'}`}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <SearchSelect
                label="Brands"
                multiple
                placeholder="Search brands..."
                search={brandSearch}
                selected={selected}
                onChange={setSelected}
                disabledIds={mappings.map((m) => m.companyId)}
                onCreate={canCreateBrand ? createBrand : undefined}
                createLabel={(term) => `Register new brand "${term}"`}
              />
              <CheckboxField label="Authorised partner / distributor for these brands" checked={authorized} onChange={setAuthorized} />
              <ResultAlert result={result} />
            </div>
          </Modal>

          <BrandEditModal
            key={editing?.id ?? 'closed'}
            vendorId={vendorId}
            mapping={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />

          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title={`Remove ${removing?.company.name ?? 'brand'}?`}
            message={
              removing && productCount(removing.companyId) > 0 ? (
                <>
                  This vendor still has {productCount(removing.companyId)} {removing.company.name} product(s)
                  mapped. Remove those product mappings first &mdash; the brand list must match the products.
                </>
              ) : (
                <>The brand will no longer be listed for this vendor. The brand itself is not changed.</>
              )
            }
            confirmLabel="Remove brand"
            onConfirm={async () => {
              const outcome = await unmapBrandAction(vendorId, removing!.companyId);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function BrandEditModal({
  vendorId,
  mapping,
  onClose,
  onSaved,
}: {
  vendorId: string;
  mapping: VendorCompanyMapping | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [authorized, setAuthorized] = useState(mapping?.isAuthorized ?? false);
  const [remarks, setRemarks] = useState(mapping?.remarks ?? '');
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={mapping !== null}
      onClose={onClose}
      title={`Edit ${mapping?.company.name ?? ''} mapping`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const outcome = await updateBrandMappingAction(vendorId, mapping!.companyId, { isAuthorized: authorized, remarks });
                if (outcome.ok) onSaved();
                else setResult(outcome);
              })
            }
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <CheckboxField label="Authorised partner / distributor" checked={authorized} onChange={setAuthorized} />
        <TextField label="Remarks" value={remarks} onChange={setRemarks} maxLength={500} placeholder="e.g. Platinum partner, North region" />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const emptyMapping: ProductMappingInput = { vendorSku: '', leadTimeDays: '', isPreferred: false, remarks: '' };

function MappingFields({
  value,
  onChange,
  showSku = true,
}: {
  value: ProductMappingInput;
  onChange: (value: ProductMappingInput) => void;
  showSku?: boolean;
}) {
  const leadInvalid = value.leadTimeDays.trim() !== '' && !/^\d{1,4}$/.test(value.leadTimeDays.trim());
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {showSku && (
        <TextField label="Vendor SKU / part no." value={value.vendorSku} onChange={(v) => onChange({ ...value, vendorSku: v })} maxLength={100} />
      )}
      <TextField
        label="Lead time (days)"
        value={value.leadTimeDays}
        onChange={(v) => onChange({ ...value, leadTimeDays: v })}
        inputMode="numeric"
        error={leadInvalid ? 'Enter whole days, 0-3650.' : undefined}
      />
      <TextField className="sm:col-span-2" label="Remarks" value={value.remarks} onChange={(v) => onChange({ ...value, remarks: v })} maxLength={500} />
      <div className="sm:col-span-2">
        <CheckboxField label="Preferred supplier for this product" checked={value.isPreferred} onChange={(checked) => onChange({ ...value, isPreferred: checked })} />
      </div>
    </div>
  );
}

export function ProductsPanel({
  vendorId,
  mappings,
  canManage,
  canCreateProduct,
  productCategories,
}: {
  vendorId: string;
  mappings: VendorProductMapping[];
  canManage: boolean;
  canCreateProduct: boolean;
  productCategories: ProductCategory[];
}) {
  const router = useRouter();
  const brandSearch = useBrandSearch();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SearchOption[]>([]);
  const [details, setDetails] = useState<ProductMappingInput>(emptyMapping);
  const [registering, setRegistering] = useState(false);
  const [editing, setEditing] = useState<VendorProductMapping | null>(null);
  const [removing, setRemoving] = useState<VendorProductMapping | null>(null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const productSearch = useCallback(
    async (term: string) =>
      (await searchProductsAction(term)).map((p) => ({
        id: p.id,
        label: `${p.name} — ${p.modelNumber}`,
        detail: `${p.company.name}${p.category ? ` · ${p.category.name}` : ''} · ${p.productCode}`,
      })),
    [],
  );

  const save = () =>
    startTransition(async () => {
      if (!selected.length) {
        setResult({ error: 'Select at least one product.' });
        return;
      }
      if (details.leadTimeDays.trim() && !/^\d{1,4}$/.test(details.leadTimeDays.trim())) {
        setResult({ error: 'Lead time must be whole days.' });
        return;
      }
      // A vendor SKU belongs to one product, so it is only applied to a single selection.
      const outcome = await mapProductsAction(
        vendorId,
        selected.map((s) => s.id),
        selected.length === 1 ? details : { ...details, vendorSku: '' },
      );
      router.refresh();
      if (outcome.ok) {
        setAdding(false);
        setSelected([]);
        setDetails(emptyMapping);
        setResult({});
      } else {
        setResult(outcome);
      }
    });

  return (
    <section className="card">
      <PanelHeader
        title="Products and models supplied"
        description="Shared catalogue products. The same product can be supplied by many vendors."
        actions={
          canManage && (
            <button type="button" className="btn-primary" onClick={() => { setResult({}); setAdding(true); }}>
              <IconPlus size={16} /> Map products
            </button>
          )
        }
      />

      {mappings.length === 0 ? (
        <EmptyStateClient title="No products mapped" description="Map the models this vendor supplies so it can be found by product or model number." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Product</th>
                <th scope="col">Model</th>
                <th scope="col">Vendor SKU</th>
                <th scope="col" className="text-right">Lead time</th>
                <th scope="col">Preferred</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td><span className="chip">{mapping.product.company.name}</span></td>
                  <td className="min-w-[180px]">
                    <Link href={`/products/${mapping.productId}`} className="font-semibold text-ink hover:text-accent hover:underline">
                      {mapping.product.name}
                    </Link>
                    <p className="font-mono text-xs text-ink-subtle">
                      {mapping.product.productCode}
                      {mapping.product.category && ` · ${mapping.product.category.name}`}
                      {mapping.product.archivedAt && ' · archived'}
                    </p>
                  </td>
                  <td className="whitespace-nowrap font-mono text-sm">{mapping.product.modelNumber}</td>
                  <td className="font-mono text-sm">{mapping.vendorSku ?? '—'}</td>
                  <td className="text-right tabular-nums">{mapping.leadTimeDays !== null ? `${mapping.leadTimeDays} d` : '—'}</td>
                  <td>
                    {mapping.isPreferred ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-warning"><IconStar size={14} /> Preferred</span>
                    ) : (
                      <span className="text-ink-subtle">No</span>
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button type="button" className="icon-btn" onClick={() => { setResult({}); setEditing(mapping); }} aria-label={`Edit ${mapping.product.name}`}>
                          <IconPencil />
                        </button>
                        <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(mapping)} aria-label={`Remove ${mapping.product.name}`}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <Modal
            open={adding}
            onClose={() => setAdding(false)}
            title="Map products to this vendor"
            description="Choose existing catalogue models. Each product's brand is mapped automatically."
            size="lg"
            footer={
              <>
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)} disabled={pending}>Cancel</button>
                <button type="button" className="btn-primary" onClick={save} disabled={pending || !selected.length}>
                  {pending ? 'Mapping...' : `Map ${selected.length || ''} product${selected.length === 1 ? '' : 's'}`}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <SearchSelect
                label="Products / models"
                multiple
                placeholder="Search by name, model number or product code..."
                search={productSearch}
                selected={selected}
                onChange={setSelected}
                disabledIds={mappings.map((m) => m.productId)}
              />
              {canCreateProduct && (
                <p className="text-sm text-ink-muted">
                  Model not in the catalogue?{' '}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => setRegistering(true)}>
                    Register it in the shared catalogue
                  </button>
                </p>
              )}
              <div className="rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-semibold text-ink">Supply details {selected.length > 1 && <span className="font-normal text-ink-muted">(applied to every selected product)</span>}</p>
                <MappingFields value={details} onChange={setDetails} showSku={selected.length <= 1} />
              </div>
              <ResultAlert result={result} />
            </div>
          </Modal>

          {canCreateProduct && (
            <QuickProductModal
              open={registering}
              onClose={() => setRegistering(false)}
              productCategories={productCategories}
              brandSearch={brandSearch}
              onCreated={(option) => {
                setSelected((current) => [...current, option]);
                setRegistering(false);
              }}
            />
          )}

          <ProductEditModal
            key={editing?.id ?? 'closed'}
            vendorId={vendorId}
            mapping={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />

          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove product mapping?"
            message={
              <>
                <strong className="text-ink">{removing?.product.name} ({removing?.product.modelNumber})</strong> will no
                longer be listed for this vendor. The catalogue product itself is not changed.
              </>
            }
            confirmLabel="Remove product"
            onConfirm={async () => {
              const outcome = await unmapProductAction(vendorId, removing!.productId);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function ProductEditModal({
  vendorId,
  mapping,
  onClose,
  onSaved,
}: {
  vendorId: string;
  mapping: VendorProductMapping | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ProductMappingInput>({
    vendorSku: mapping?.vendorSku ?? '',
    leadTimeDays: mapping?.leadTimeDays?.toString() ?? '',
    isPreferred: mapping?.isPreferred ?? false,
    remarks: mapping?.remarks ?? '',
  });
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={mapping !== null}
      onClose={onClose}
      title={`Edit ${mapping?.product.name ?? ''}`}
      description={mapping ? `${mapping.product.company.name} · ${mapping.product.modelNumber}` : undefined}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (value.leadTimeDays.trim() && !/^\d{1,4}$/.test(value.leadTimeDays.trim())) {
                  setResult({ error: 'Lead time must be whole days.' });
                  return;
                }
                const outcome = await updateProductMappingAction(vendorId, mapping!.productId, value);
                if (outcome.ok) onSaved();
                else setResult(outcome);
              })
            }
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <MappingFields value={value} onChange={setValue} />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}
