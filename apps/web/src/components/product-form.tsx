'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { createProductAction, updateProductAction, type ModelPayload, type ProductPayload } from '@/lib/product-actions';
import { quickCreateBrandAction, searchBrandsAction, type ActionResult } from '@/lib/vendor-actions';
import type { ProductCategory, Specification } from '@/lib/types';
import { ResultAlert, SelectField, TextField } from './client-ui';
import { SearchSelect, type SearchOption } from './search-select';
import { IconBox, IconPlus, IconTrash, IconUpload, IconX } from './icons';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let seed = 0;
const key = () => `k${++seed}`;

export const emptyModel = (): ModelPayload => ({ modelName: '', modelNumber: '', description: '', specifications: [], isActive: true });

// ---------------------------------------------------------------------------
// Specifications editor: free name/value rows, so each category keeps its own
// attributes (Processor/RAM for laptops, Ports/PoE for switches...).
// ---------------------------------------------------------------------------

const SPEC_SUGGESTIONS = ['Processor', 'RAM', 'Storage', 'Display Size', 'Operating System', 'Graphics', 'Warranty', 'Ports', 'Weight', 'Colour'];

export function SpecsEditor({ value, onChange }: { value: Specification[]; onChange: (value: Specification[]) => void }) {
  const update = (index: number, change: Partial<Specification>) =>
    onChange(value.map((spec, i) => (i === index ? { ...spec, ...change } : spec)));
  const used = new Set(value.map((s) => s.name.trim().toLowerCase()));

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-ink-subtle">No specifications yet.</p>}
      {value.map((spec, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2">
          <input
            aria-label={`Specification ${index + 1} name`}
            value={spec.name}
            maxLength={80}
            onChange={(event) => update(index, { name: event.target.value })}
            placeholder="Name, e.g. RAM"
            className="field-input"
          />
          <input
            aria-label={`Specification ${index + 1} value`}
            value={spec.value}
            maxLength={500}
            onChange={(event) => update(index, { value: event.target.value })}
            placeholder="Value, e.g. 16 GB DDR5"
            className="field-input"
          />
          <button type="button" className="icon-btn hover:bg-danger-subtle hover:text-danger" onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={`Remove specification ${index + 1}`}>
            <IconX />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => onChange([...value, { name: '', value: '' }])}>
          <IconPlus size={14} /> Add specification
        </button>
        {SPEC_SUGGESTIONS.filter((name) => !used.has(name.toLowerCase())).slice(0, 5).map((name) => (
          <button key={name} type="button" className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-ink-muted hover:border-accent hover:text-accent" onClick={() => onChange([...value, { name, value: '' }])}>
            + {name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Model fields shared by the create form and the model modal. */
export function ModelFields({
  value,
  onChange,
  errors = {},
  prefix = '',
}: {
  value: ModelPayload;
  onChange: (value: ModelPayload) => void;
  errors?: Record<string, string>;
  prefix?: string;
}) {
  const set = <K extends keyof ModelPayload>(field: K, next: ModelPayload[K]) => onChange({ ...value, [field]: next });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TextField label="Model Name" required value={value.modelName} onChange={(v) => set('modelName', v)} error={errors[`${prefix}modelName`]} maxLength={200} placeholder="e.g. Latitude 5450" />
      <TextField label="Model Number" required value={value.modelNumber} onChange={(v) => set('modelNumber', v)} error={errors[`${prefix}modelNumber`]} maxLength={100} placeholder="e.g. LAT-5450-U5" hint="Unique within the brand" />
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor={`${prefix}description`}>Model Description</label>
        <textarea id={`${prefix}description`} rows={2} maxLength={2000} value={value.description} onChange={(event) => set('description', event.target.value)} className="field-input" />
      </div>
      <div className="sm:col-span-2">
        <p className="field-label">Technical Specifications</p>
        <SpecsEditor value={value.specifications} onChange={(specs) => set('specifications', specs)} />
      </div>
    </div>
  );
}

export function validateModel(model: ModelPayload, prefix = ''): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!model.modelName.trim()) errors[`${prefix}modelName`] = 'Model name is required.';
  if (!model.modelNumber.trim()) errors[`${prefix}modelNumber`] = 'Model number is required.';
  return errors;
}

// ---------------------------------------------------------------------------
// Product form
// ---------------------------------------------------------------------------

export function ProductForm({
  mode,
  productId,
  categories,
  permissions,
  initial,
}: {
  mode: 'create' | 'edit';
  productId?: string;
  categories: ProductCategory[];
  permissions: string[];
  initial?: ProductPayload & { brand: SearchOption | null; isActive?: boolean };
}) {
  const can = (permission: string) => permissions.includes(permission);
  const [form, setForm] = useState<ProductPayload>({
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    companyId: initial?.companyId ?? '',
    categoryId: initial?.categoryId ?? '',
    description: initial?.description ?? '',
  });
  const [brand, setBrand] = useState<SearchOption[]>(initial?.brand ? [initial.brand] : []);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [models, setModels] = useState<Array<ModelPayload & { key: string }>>([]);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!image) return setPreview(null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const set = <K extends keyof ProductPayload>(field: K, value: ProductPayload[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const brandSearch = useCallback(async (term: string) => (await searchBrandsAction(term)).map((b) => ({ id: b.id, label: b.name })), []);
  const createBrand = useCallback(async (name: string) => {
    const created = await quickCreateBrandAction(name);
    if (!created.brand) {
      setResult({ error: created.error });
      return null;
    }
    return { id: created.brand.id, label: created.brand.name };
  }, []);

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setResult({ error: 'The product image must be PNG, JPEG or WEBP.' });
    if (file.size > MAX_IMAGE_BYTES) return setResult({ error: 'The image must be 10 MB or smaller.' });
    setResult({});
    setImage(file);
  };

  const submit = () => {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Product name is required.';
    if (!form.companyId) found.companyId = 'Select a brand.';
    if (form.sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/.test(form.sku.trim())) {
      found.sku = 'Letters, digits, ".", "_", "/" and "-" only (max 60).';
    }
    models.forEach((model, index) => Object.assign(found, validateModel(model, `models.${index}.`)));
    const numbers = models.map((m) => m.modelNumber.replace(/\s+/g, '').toUpperCase()).filter(Boolean);
    numbers.forEach((number, index) => {
      if (numbers.indexOf(number) !== index) found[`models.${index}.modelNumber`] = 'This model number is listed twice.';
    });
    setErrors(found);
    if (Object.keys(found).length) {
      setResult({ error: 'Please correct the highlighted fields.' });
      return;
    }

    startTransition(async () => {
      let outcome: ActionResult;
      if (mode === 'edit' && productId) {
        outcome = await updateProductAction(productId, form);
      } else {
        const data = new FormData();
        data.set('payload', JSON.stringify({ ...form, isActive, models: models.map(({ key: _k, ...model }) => model) }));
        if (image) data.set('image', image);
        outcome = await createProductAction(data);
      }
      // Success redirects on the server; anything returned is a problem.
      setResult(outcome);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const section = (title: string, description: string, children: React.ReactNode) => (
    <section className="card p-5">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mb-4 text-sm text-ink-muted">{description}</p>
      {children}
    </section>
  );

  return (
    <form noValidate onSubmit={(event) => { event.preventDefault(); submit(); }} className="space-y-5">
      <ResultAlert result={result} />

      {section(
        'Product Information',
        'The product code is generated on save. A brand cannot have two products with the same name.',
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label="Product Name" required value={form.name} onChange={(v) => set('name', v)} error={errors.name} maxLength={250} placeholder="e.g. Dell Latitude Laptop" />
          <TextField label="Product Code / SKU" value={form.sku} onChange={(v) => set('sku', v)} error={errors.sku} maxLength={60} placeholder="Optional business SKU" hint={mode === 'create' ? 'Product ID (KI/PRD/…) is assigned automatically' : undefined} />
          <div>
            <SearchSelect
              label="Brand *"
              placeholder="Select a brand"
              search={brandSearch}
              selected={brand}
              onChange={(next) => {
                setBrand(next);
                set('companyId', next[0]?.id ?? '');
              }}
              onCreate={can('company.create') ? createBrand : undefined}
              createLabel={(term) => `Register new brand "${term}"`}
              emptyText="No brand found"
            />
            {errors.companyId && <p className="field-error">{errors.companyId}</p>}
            <p className="field-hint">From the shared brand master used by Vendor Management.</p>
          </div>
          <SelectField
            label="Product Category"
            value={form.categoryId}
            onChange={(v) => set('categoryId', v)}
            placeholder="Not categorised"
            options={categories.filter((c) => c.isActive || c.id === form.categoryId).map((c) => ({ value: c.id, label: c.name }))}
          />
          <div className="md:col-span-2">
            <label htmlFor="product-description" className="field-label">Product Description</label>
            <textarea id="product-description" rows={3} maxLength={2000} value={form.description} onChange={(event) => set('description', event.target.value)} className="field-input" />
          </div>
          {mode === 'create' ? (
            <SelectField
              label="Status"
              value={isActive ? 'ACTIVE' : 'INACTIVE'}
              onChange={(v) => setIsActive(v === 'ACTIVE')}
              options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]}
            />
          ) : (
            <p className="field-hint self-end">Status, image, models, vendors and documents are managed on the product profile.</p>
          )}
        </div>,
      )}

      {mode === 'create' &&
        section(
          'Product Image',
          'PNG, JPEG or WEBP up to 10 MB. Stored privately; can be replaced or removed later.',
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex h-36 w-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
                <img src={preview} alt="Selected product" className="h-full w-full object-contain" />
              ) : (
                <IconBox size={40} className="text-ink-subtle" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="btn-secondary cursor-pointer">
                <IconUpload size={16} /> {image ? 'Replace image' : 'Choose image'}
                <input type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" onChange={(event) => pickImage(event.target.files?.[0])} />
              </label>
              {image && (
                <button type="button" className="btn-secondary" onClick={() => setImage(null)}>
                  <IconTrash size={16} /> Remove
                </button>
              )}
            </div>
          </div>,
        )}

      {mode === 'create' &&
        section(
          'Models',
          'Optional now — models can also be added from the product profile. One product, many models.',
          <div className="space-y-4">
            {models.map((model, index) => (
              <fieldset key={model.key} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <legend className="text-sm font-semibold text-ink">Model {index + 1}</legend>
                  <button type="button" className="inline-flex items-center gap-1 text-sm text-danger hover:underline" onClick={() => setModels((rows) => rows.filter((row) => row.key !== model.key))}>
                    <IconTrash size={14} /> Remove
                  </button>
                </div>
                <ModelFields
                  value={model}
                  prefix={`models.${index}.`}
                  errors={errors}
                  onChange={(next) => setModels((rows) => rows.map((row) => (row.key === model.key ? { ...next, key: row.key } : row)))}
                />
              </fieldset>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setModels((rows) => [...rows, { ...emptyModel(), key: key() }])}>
              <IconPlus size={16} /> Add model
            </button>
          </div>,
        )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-popover backdrop-blur">
        <Link href={productId ? `/products/${productId}` : '/products'} className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary px-5" disabled={pending}>
          {pending ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Save Product'}
        </button>
      </div>
    </form>
  );
}
