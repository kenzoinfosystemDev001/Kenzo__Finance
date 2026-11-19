'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  ActionMenu,
  CheckboxField,
  ConfirmDialog,
  Modal,
  ResultAlert,
  SelectField,
  TextField,
  type MenuItem,
} from '@/components/client-ui';
import { DocumentsManager } from '@/components/documents-manager';
import { EmptyStateClient, PanelHeader } from '@/components/panel-shared';
import { SearchSelect, type SearchOption } from '@/components/search-select';
import { emptyModel, ModelFields, validateModel } from '@/components/product-form';
import {
  IconAlert,
  IconBox,
  IconCheckCircle,
  IconPause,
  IconPencil,
  IconPlus,
  IconStar,
  IconTrash,
  IconUpload,
} from '@/components/icons';
import {
  deleteModelAction,
  mapVendorsToProductAction,
  removeModelImageAction,
  removeProductDocumentAction,
  removeProductImageAction,
  replaceProductDocumentAction,
  saveModelAction,
  searchVendorsAction,
  setModelImageAction,
  setModelStatusAction,
  setProductImageAction,
  unmapProductVendorAction,
  updateProductVendorAction,
  uploadProductDocumentAction,
  type MapVendorsResult,
  type ModelPayload,
  type VendorMappingInput,
} from '@/lib/product-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import { formatPhone, PRODUCT_DOCUMENT_KIND_LABELS, specificationList } from '@/lib/vendor-labels';
import type { ProductDetail, ProductModel, ProductVendorMapping } from '@/lib/types';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const imageUrl = (productId: string, documentId: string) => `/products/${productId}/image/${documentId}`;

// ---------------------------------------------------------------------------
// Image (product or model)
// ---------------------------------------------------------------------------

export function ImageCard({
  productId,
  documentId,
  alt,
  canUpload,
  canRemove,
  onUpload,
  onRemove,
  size = 'lg',
}: {
  productId: string;
  documentId: string | null;
  alt: string;
  canUpload: boolean;
  canRemove: boolean;
  onUpload: (formData: FormData) => Promise<ActionResult>;
  onRemove: () => Promise<ActionResult>;
  size?: 'lg' | 'sm';
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setResult({ error: 'Use a PNG, JPEG or WEBP image.' });
    if (file.size > 10 * 1024 * 1024) return setResult({ error: 'The image must be 10 MB or smaller.' });
    const data = new FormData();
    data.set('file', file);
    startTransition(async () => {
      const outcome = await onUpload(data);
      setResult(outcome.ok ? {} : outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className={clsx('flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted', size === 'lg' ? 'h-40 w-full sm:w-52' : 'h-28 w-40')}>
        {documentId ? (
          // eslint-disable-next-line @next/next/no-img-element -- streamed through the permission-checked proxy
          <img src={imageUrl(productId, documentId)} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <IconBox size={size === 'lg' ? 48 : 32} className="text-ink-subtle" />
        )}
      </div>
      {(canUpload || (canRemove && documentId)) && (
        <div className="flex flex-wrap gap-1.5">
          {canUpload && (
            <label className={clsx('btn-secondary cursor-pointer px-2.5 py-1 text-xs', pending && 'pointer-events-none opacity-60')}>
              <IconUpload size={14} /> {pending ? 'Uploading...' : documentId ? 'Replace' : 'Upload image'}
              <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
            </label>
          )}
          {canRemove && documentId && (
            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setConfirmRemove(true)}>
              <IconTrash size={14} /> Remove
            </button>
          )}
        </div>
      )}
      <ResultAlert result={result} />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove image?"
        message="The image is archived (kept for audit) and no longer shown."
        confirmLabel="Remove image"
        onConfirm={async () => {
          const outcome = await onRemove();
          if (outcome.ok) router.refresh();
          return outcome;
        }}
      />
    </div>
  );
}

export function ProductImage({ product, canUpload, canRemove }: { product: ProductDetail; canUpload: boolean; canRemove: boolean }) {
  return (
    <ImageCard
      productId={product.id}
      documentId={product.imageDocumentId}
      alt={product.name}
      canUpload={canUpload}
      canRemove={canRemove}
      onUpload={(data) => setProductImageAction(product.id, data)}
      onRemove={() => removeProductImageAction(product.id)}
    />
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function ModelsPanel({
  product,
  canManage,
  canDelete,
  canUploadImage,
  canRemoveImage,
}: {
  product: ProductDetail;
  canManage: boolean;
  canDelete: boolean;
  canUploadImage: boolean;
  canRemoveImage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductModel | 'new' | null>(null);
  const [confirm, setConfirm] = useState<{ model: ProductModel; action: 'activate' | 'deactivate' | 'delete' } | null>(null);

  const done = async (result: Promise<ActionResult>) => {
    const outcome = await result;
    if (outcome.ok) router.refresh();
    return outcome;
  };

  return (
    <section className="card">
      <PanelHeader
        title="Models"
        description="Concrete models of this product. Model numbers are unique within the brand."
        actions={canManage && <button type="button" className="btn-primary" onClick={() => setEditing('new')}><IconPlus size={16} /> Add model</button>}
      />
      {product.models.length === 0 ? (
        <EmptyStateClient title="No models yet" description="Add the models of this product, e.g. Latitude 5450 and Latitude 5550." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Model Number</th>
                <th scope="col">Model Code</th>
                <th scope="col">Specifications</th>
                <th scope="col" className="text-right">Vendors</th>
                <th scope="col">Status</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {product.models.map((model) => {
                const specs = specificationList(model.specifications);
                const items: MenuItem[] = [
                  model.isActive
                    ? { label: 'Deactivate', icon: <IconPause size={16} />, onSelect: () => setConfirm({ model, action: 'deactivate' }) }
                    : { label: 'Activate', icon: <IconCheckCircle size={16} />, onSelect: () => setConfirm({ model, action: 'activate' }) },
                ];
                if (canDelete) items.push({ label: 'Delete model', icon: <IconTrash size={16} />, tone: 'danger', onSelect: () => setConfirm({ model, action: 'delete' }) });
                return (
                  <tr key={model.id}>
                    <td className="min-w-[160px]">
                      <p className="font-semibold">{model.modelName}</p>
                      {model.description && <p className="max-w-xs truncate text-xs text-ink-subtle">{model.description}</p>}
                    </td>
                    <td className="whitespace-nowrap font-mono text-sm">{model.modelNumber}</td>
                    <td className="whitespace-nowrap font-mono text-xs text-ink-muted">{model.modelCode}</td>
                    <td className="min-w-[220px] text-sm">
                      {specs.length === 0 ? (
                        <span className="text-ink-subtle">&mdash;</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {specs.slice(0, 3).map((spec) => (
                            <li key={spec.name}><span className="text-ink-subtle">{spec.name}:</span> {spec.value}</li>
                          ))}
                          {specs.length > 3 && <li className="text-xs text-ink-subtle">+{specs.length - 3} more</li>}
                        </ul>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{model._count.vendors}</td>
                    <td>
                      <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', model.isActive ? 'border-success/25 bg-success-subtle text-success' : 'border-danger/25 bg-danger-subtle text-danger')}>
                        <span aria-hidden className={clsx('h-1.5 w-1.5 rounded-full', model.isActive ? 'bg-success' : 'bg-danger')} />
                        {model.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <button type="button" className="icon-btn" onClick={() => setEditing(model)} aria-label={`Edit ${model.modelName}`}><IconPencil /></button>
                          <ActionMenu items={items} label={`More actions for ${model.modelName}`} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <ModelModal
            key={editing === 'new' ? 'new' : editing?.id ?? 'closed'}
            productId={product.id}
            model={editing === 'new' ? null : editing}
            open={editing !== null}
            canUploadImage={canUploadImage}
            canRemoveImage={canRemoveImage}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
          <ConfirmDialog
            open={confirm?.action === 'deactivate'}
            onClose={() => setConfirm(null)}
            title="Deactivate model?"
            message={<><strong className="text-ink">{confirm?.model.modelName}</strong> stays on record but is not offered for new business.</>}
            confirmLabel="Deactivate"
            onConfirm={() => done(setModelStatusAction(product.id, confirm!.model.id, false))}
          />
          <ConfirmDialog
            open={confirm?.action === 'activate'}
            onClose={() => setConfirm(null)}
            title="Activate model?"
            message={<><strong className="text-ink">{confirm?.model.modelName}</strong> will be available for new business again.</>}
            confirmLabel="Activate"
            tone="primary"
            onConfirm={() => done(setModelStatusAction(product.id, confirm!.model.id, true))}
          />
          <ConfirmDialog
            open={confirm?.action === 'delete'}
            onClose={() => setConfirm(null)}
            title="Delete model?"
            message={<>This permanently removes <strong className="text-ink">{confirm?.model.modelName}</strong>. It is refused while any vendor is mapped to it &mdash; deactivate it instead to keep history.</>}
            confirmLabel="Delete model"
            onConfirm={() => done(deleteModelAction(product.id, confirm!.model.id))}
          />
        </>
      )}
    </section>
  );
}

function ModelModal({
  productId,
  model,
  open,
  canUploadImage,
  canRemoveImage,
  onClose,
  onSaved,
}: {
  productId: string;
  model: ProductModel | null;
  open: boolean;
  canUploadImage: boolean;
  canRemoveImage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<ModelPayload>(() =>
    model
      ? { modelName: model.modelName, modelNumber: model.modelNumber, description: model.description ?? '', specifications: specificationList(model.specifications) }
      : emptyModel(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const save = () => {
    const found = validateModel(value);
    setErrors(found);
    if (Object.keys(found).length) return;
    startTransition(async () => {
      const outcome = await saveModelAction(productId, model?.id ?? null, value);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={model ? `Edit ${model.modelName}` : 'Add model'}
      description={model ? `${model.modelCode}` : 'The model code is assigned automatically.'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save model'}</button>
        </>
      }
    >
      <div className="space-y-5">
        <ModelFields value={value} onChange={setValue} errors={errors} />
        {model && (
          <div className="border-t border-border pt-4">
            <p className="field-label">Model Image</p>
            <ImageCard
              size="sm"
              productId={productId}
              documentId={model.imageDocumentId}
              alt={model.modelName}
              canUpload={canUploadImage}
              canRemove={canRemoveImage}
              onUpload={(data) => setModelImageAction(productId, model.id, data)}
              onRemove={() => removeModelImageAction(productId, model.id)}
            />
          </div>
        )}
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

const emptyMappingInput: VendorMappingInput = { modelIds: [], vendorSku: '', leadTimeDays: '', isPreferred: false, remarks: '' };

function ModelChecklist({ models, selected, onChange }: { models: ProductModel[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (models.length === 0) return <p className="text-sm text-ink-subtle">This product has no models yet; the mapping applies to the product as a whole.</p>;
  return (
    <fieldset>
      <legend className="field-label">Models supplied</legend>
      <p className="field-hint mb-2 mt-0">Leave all unticked if the vendor supplies the product generally.</p>
      <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
        {models.map((model) => (
          <CheckboxField
            key={model.id}
            label={`${model.modelName} (${model.modelNumber})${model.isActive ? '' : ' - inactive'}`}
            checked={selected.includes(model.id)}
            onChange={(checked) => onChange(checked ? [...selected, model.id] : selected.filter((id) => id !== model.id))}
          />
        ))}
      </div>
    </fieldset>
  );
}

function MappingDetails({ value, onChange, showSku }: { value: VendorMappingInput; onChange: (value: VendorMappingInput) => void; showSku: boolean }) {
  const leadInvalid = value.leadTimeDays.trim() !== '' && !/^\d{1,4}$/.test(value.leadTimeDays.trim());
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {showSku && <TextField label="Vendor SKU / part no." value={value.vendorSku} onChange={(v) => onChange({ ...value, vendorSku: v })} maxLength={100} />}
      <TextField label="Lead time (days)" value={value.leadTimeDays} onChange={(v) => onChange({ ...value, leadTimeDays: v })} inputMode="numeric" error={leadInvalid ? 'Whole days, 0-3650.' : undefined} />
      <TextField className="sm:col-span-2" label="Remarks" value={value.remarks} onChange={(v) => onChange({ ...value, remarks: v })} maxLength={500} />
      <div className="sm:col-span-2">
        <CheckboxField label="Preferred supplier" checked={value.isPreferred} onChange={(checked) => onChange({ ...value, isPreferred: checked })} />
      </div>
    </div>
  );
}

export function VendorsPanel({
  product,
  canManage,
  canManageBrands,
  canViewVendors,
}: {
  product: ProductDetail;
  canManage: boolean;
  canManageBrands: boolean;
  canViewVendors: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SearchOption[]>([]);
  const [details, setDetails] = useState<VendorMappingInput>(emptyMappingInput);
  const [mapBrand, setMapBrand] = useState(false);
  const [result, setResult] = useState<MapVendorsResult>({});
  const [editing, setEditing] = useState<ProductVendorMapping | null>(null);
  const [removing, setRemoving] = useState<ProductVendorMapping | null>(null);
  const [pending, startTransition] = useTransition();

  const vendorSearch = useCallback((term: string) => searchVendorsAction(term), []);
  const brand = product.company.name;

  const save = () =>
    startTransition(async () => {
      if (!selected.length) return setResult({ error: 'Select at least one vendor.' });
      if (details.leadTimeDays.trim() && !/^\d{1,4}$/.test(details.leadTimeDays.trim())) return setResult({ error: 'Lead time must be whole days.' });
      const outcome = await mapVendorsToProductAction(
        product.id,
        selected.map((s) => ({ id: s.id, name: s.label })),
        details,
        mapBrand,
      );
      router.refresh();
      if (outcome.ok) {
        setAdding(false);
        setSelected([]);
        setDetails(emptyMappingInput);
        setMapBrand(false);
        setResult({});
        return;
      }
      // Keep only the vendors that still need attention selected.
      const retry = new Set(outcome.brandMissing?.map((v) => v.vendorId) ?? []);
      setSelected((current) => current.filter((v) => retry.has(v.id)));
      setResult(outcome);
    });

  return (
    <section className="card">
      <PanelHeader
        title="Vendors"
        description={`Existing vendors from Vendor Management. A vendor must be mapped to ${brand} to supply this product.`}
        actions={canManage && (
          <button type="button" className="btn-primary" onClick={() => { setResult({}); setAdding(true); }}>
            <IconPlus size={16} /> Map vendors
          </button>
        )}
      />

      {product.vendors.length === 0 ? (
        <EmptyStateClient title="No vendors mapped" description="Map the vendors that supply this product or its models." />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Vendor</th>
                <th scope="col">Contact Person</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col">Models</th>
                <th scope="col">Mapping</th>
                {canManage && <th scope="col" className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {product.vendors.map((mapping) => {
                const contact = mapping.vendor.contacts[0];
                return (
                  <tr key={mapping.id}>
                    <td className="min-w-[180px]">
                      {canViewVendors ? (
                        <a href={`/vendors/${mapping.vendor.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{mapping.vendor.businessName}</a>
                      ) : (
                        <span className="font-semibold">{mapping.vendor.businessName}</span>
                      )}
                      <p className="font-mono text-xs text-ink-subtle">
                        {mapping.vendor.vendorCode} · {mapping.vendor._count.products} product(s)
                        {mapping.vendor.archivedAt ? ' · archived' : mapping.vendor.status === 'INACTIVE' ? ' · inactive vendor' : ''}
                      </p>
                      {!mapping.brandMapped && (
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning"><IconAlert size={12} /> Not mapped to {brand}</p>
                      )}
                      {mapping.isPreferred && <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning"><IconStar size={12} /> Preferred</p>}
                    </td>
                    <td>{contact?.name ?? mapping.vendor.contactPerson ?? <span className="text-ink-subtle">&mdash;</span>}</td>
                    <td className="whitespace-nowrap">{formatPhone(contact?.phone ?? mapping.vendor.phone) || <span className="text-ink-subtle">&mdash;</span>}</td>
                    <td className="max-w-[200px] truncate">{contact?.email ?? mapping.vendor.email ?? <span className="text-ink-subtle">&mdash;</span>}</td>
                    <td className="min-w-[160px]">
                      {mapping.models.length === 0 ? (
                        <span className="text-sm text-ink-muted">Whole product</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {mapping.models.map((m) => <span key={m.productModelId} className="chip">{m.productModel.modelName}</span>)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', mapping.status === 'ACTIVE' ? 'border-success/25 bg-success-subtle text-success' : 'border-border bg-surface-muted text-ink-muted')}>
                        {mapping.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="flex justify-end gap-1">
                          <button type="button" className="icon-btn" onClick={() => setEditing(mapping)} aria-label={`Edit mapping for ${mapping.vendor.businessName}`}><IconPencil /></button>
                          <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => setRemoving(mapping)} aria-label={`Remove ${mapping.vendor.businessName}`}><IconTrash /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <>
          <Modal
            open={adding}
            onClose={() => setAdding(false)}
            size="lg"
            title="Map vendors to this product"
            description="Search existing vendors. Vendors already mapped are greyed out."
            footer={
              <>
                <button type="button" className="btn-secondary" onClick={() => setAdding(false)} disabled={pending}>Cancel</button>
                <button type="button" className="btn-primary" onClick={save} disabled={pending || !selected.length}>
                  {pending ? 'Mapping...' : `Map ${selected.length || ''} vendor${selected.length === 1 ? '' : 's'}`}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <SearchSelect
                label="Vendors"
                multiple
                placeholder="Search vendors by name or code..."
                search={vendorSearch}
                selected={selected}
                onChange={setSelected}
                disabledIds={product.vendors.map((m) => m.vendor.id)}
                emptyText="No vendors found"
              />
              <ModelChecklist models={product.models} selected={details.modelIds} onChange={(modelIds) => setDetails({ ...details, modelIds })} />
              <div className="rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-semibold text-ink">Supply details</p>
                <MappingDetails value={details} onChange={setDetails} showSku={selected.length <= 1} />
              </div>

              {result.brandMissing && (
                <div role="alert" className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning">
                  <p className="font-semibold">Not mapped to {brand}</p>
                  <p className="mt-1">
                    {result.brandMissing.map((v) => v.vendorName).join(', ')} {result.brandMissing.length === 1 ? 'is' : 'are'} not
                    mapped to the brand {brand}, so {result.brandMissing.length === 1 ? 'it' : 'they'} cannot supply this product yet.
                  </p>
                  {canManageBrands ? (
                    <div className="mt-2">
                      <CheckboxField label={`Also map ${brand} to ${result.brandMissing.length === 1 ? 'this vendor' : 'these vendors'}`} checked={mapBrand} onChange={setMapBrand} />
                    </div>
                  ) : (
                    <p className="mt-1">Ask a user who can manage vendor brands to map {brand} on the vendor profile first.</p>
                  )}
                </div>
              )}
              <ResultAlert result={result.brandMissing && !result.errors ? {} : { error: result.error, errors: result.errors }} />
            </div>
          </Modal>

          <EditMappingModal
            key={editing?.id ?? 'closed'}
            product={product}
            mapping={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); router.refresh(); }}
          />

          <ConfirmDialog
            open={removing !== null}
            onClose={() => setRemoving(null)}
            title="Remove vendor mapping?"
            message={<><strong className="text-ink">{removing?.vendor.businessName}</strong> will no longer be listed for this product. The vendor and the product themselves are not changed.</>}
            confirmLabel="Remove mapping"
            onConfirm={async () => {
              const outcome = await unmapProductVendorAction(product.id, removing!.vendor.id);
              if (outcome.ok) router.refresh();
              return outcome;
            }}
          />
        </>
      )}
    </section>
  );
}

function EditMappingModal({
  product,
  mapping,
  onClose,
  onSaved,
}: {
  product: ProductDetail;
  mapping: ProductVendorMapping | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<VendorMappingInput>({
    modelIds: mapping?.models.map((m) => m.productModelId) ?? [],
    vendorSku: mapping?.vendorSku ?? '',
    leadTimeDays: mapping?.leadTimeDays?.toString() ?? '',
    isPreferred: mapping?.isPreferred ?? false,
    remarks: mapping?.remarks ?? '',
  });
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(mapping?.status ?? 'ACTIVE');
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={mapping !== null}
      onClose={onClose}
      size="lg"
      title={`Edit ${mapping?.vendor.businessName ?? ''} mapping`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (value.leadTimeDays.trim() && !/^\d{1,4}$/.test(value.leadTimeDays.trim())) return setResult({ error: 'Lead time must be whole days.' });
                const outcome = await updateProductVendorAction(product.id, mapping!.vendor.id, { ...value, status });
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
        <ModelChecklist models={product.models} selected={value.modelIds} onChange={(modelIds) => setValue({ ...value, modelIds })} />
        <MappingDetails value={value} onChange={setValue} showSku />
        <SelectField label="Mapping status" value={status} onChange={(v) => setStatus(v as 'ACTIVE' | 'INACTIVE')} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive (kept for history)' }]} />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const PRODUCT_KINDS = Object.entries(PRODUCT_DOCUMENT_KIND_LABELS).map(([value, label]) => ({ value, label }));

export function ProductDocumentsPanel({
  product,
  canUpload,
  canRemove,
  canDownload,
}: {
  product: ProductDetail;
  canUpload: boolean;
  canRemove: boolean;
  canDownload: boolean;
}) {
  return (
    <DocumentsManager
      basePath={`/products/${product.id}/documents`}
      documents={product.documents}
      kinds={PRODUCT_KINDS}
      canUpload={canUpload}
      canRemove={canRemove}
      canDownload={canDownload}
      emptyText="Upload brochures, technical specifications, datasheets, manuals or warranty documents."
      onUpload={(data) => uploadProductDocumentAction(product.id, data)}
      onReplace={(documentId, data) => replaceProductDocumentAction(product.id, documentId, data)}
      onRemove={(documentId) => removeProductDocumentAction(product.id, documentId)}
    />
  );
}
