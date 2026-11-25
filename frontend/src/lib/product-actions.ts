'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from './api';
import type { ActionResult } from './vendor-actions';
import type { PaginatedResponse, Specification, VendorListItem } from './types';

/**
 * Server actions for Product Management. The NestJS API validates and
 * authorises every call; these only shape requests and errors.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: string | null | undefined, label = 'id'): string {
  if (!value || !UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

/** "models.0.Model number is required" -> "Model 1: Model number is required" */
function prettify(message: string): string {
  return message
    .replace(/^models\.(\d+)\.specifications\.(\d+)\./, (_, m, s) => `Model ${Number(m) + 1}, specification ${Number(s) + 1}: `)
    .replace(/^models\.(\d+)\./, (_, i) => `Model ${Number(i) + 1}: `)
    .replace(/^specifications\.(\d+)\./, (_, i) => `Specification ${Number(i) + 1}: `);
}

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof ApiError) {
    const messages = error.messages.map(prettify);
    return {
      error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0],
      errors: messages.length > 1 ? messages : undefined,
      details: error.body.details as Record<string, number> | undefined,
    };
  }
  return { error: fallback };
}

function refresh(productId?: string): void {
  revalidatePath('/products');
  if (productId) revalidatePath(`/products/${productId}`);
}

function blankToNull<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === 'string' && !value.trim() ? null : value]),
  ) as T;
}

function dropBlanks<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => !(value === undefined || value === null || (typeof value === 'string' && !value.trim()))),
  ) as Partial<T>;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ModelPayload {
  modelName: string;
  modelNumber: string;
  description: string;
  specifications: Specification[];
  isActive?: boolean;
}

export interface ProductPayload {
  name: string;
  sku: string;
  companyId: string;
  categoryId: string;
  description: string;
}

const cleanSpecs = (specs: Specification[]) => specs.filter((s) => s.name.trim() && s.value.trim());

/**
 * Creates the product (and models) in one API call, then uploads the image
 * if one was chosen. The form posts JSON + an optional file in one FormData.
 */
export async function createProductAction(formData: FormData): Promise<ActionResult> {
  let payload: ProductPayload & { isActive: boolean; models: ModelPayload[] };
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'));
  } catch {
    return { error: 'The form could not be read. Please try again.' };
  }
  if (!payload.name?.trim()) return { error: 'Product name is required.' };
  if (!payload.companyId) return { error: 'Select a brand.' };

  let product: { id: string };
  try {
    product = await apiFetch<{ id: string }>('/products', {
      method: 'POST',
      body: {
        ...dropBlanks({ name: payload.name, sku: payload.sku, companyId: payload.companyId, categoryId: payload.categoryId, description: payload.description }),
        isActive: payload.isActive,
        models: payload.models.map((model) => ({
          ...dropBlanks({ modelName: model.modelName, modelNumber: model.modelNumber, description: model.description }),
          specifications: cleanSpecs(model.specifications),
        })),
      },
    });
  } catch (error) {
    return toResult(error, 'The product could not be created.');
  }

  const image = formData.get('image');
  let imageNote = '';
  if (image instanceof File && image.size > 0) {
    const body = new FormData();
    body.set('file', image);
    try {
      await apiFetch(`/products/${product.id}/image`, { method: 'POST', formData: body });
    } catch {
      // The product exists; say so rather than failing the whole save.
      imageNote = '&image=failed';
    }
  }

  refresh();
  redirect(`/products/${product.id}?created=1${imageNote}`);
}

export async function updateProductAction(productId: string, payload: ProductPayload): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  if (!payload.name?.trim()) return { error: 'Product name is required.' };
  try {
    await apiFetch(`/products/${id}`, {
      method: 'PATCH',
      body: { ...blankToNull({ ...payload }), name: payload.name.trim(), companyId: payload.companyId },
    });
  } catch (error) {
    return toResult(error, 'The product could not be saved.');
  }
  refresh(id);
  redirect(`/products/${id}?updated=1`);
}

export async function setProductStatusAction(productId: string, isActive: boolean, reason?: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/status`, { method: 'PATCH', body: { isActive, ...(reason?.trim() ? { reason: reason.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(id);
  return { ok: true };
}

export async function archiveProductAction(productId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/archive`, { method: 'POST' });
  } catch (error) {
    return toResult(error, 'The product could not be archived.');
  }
  refresh(id);
  return { ok: true };
}

export async function restoreProductAction(productId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/restore`, { method: 'POST' });
  } catch (error) {
    return toResult(error, 'The product could not be restored.');
  }
  refresh(id);
  return { ok: true };
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The product could not be deleted.');
  }
  refresh();
  return { ok: true };
}

export async function setProductImageAction(productId: string, formData: FormData): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image.' };
  const body = new FormData();
  body.set('file', file);
  try {
    await apiFetch(`/products/${id}/image`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The image could not be uploaded.');
  }
  refresh(id);
  return { ok: true };
}

export async function removeProductImageAction(productId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/image`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The image could not be removed.');
  }
  refresh(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export async function saveModelAction(productId: string, modelId: string | null, payload: ModelPayload): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  const body = {
    modelName: payload.modelName.trim(),
    modelNumber: payload.modelNumber.trim(),
    description: modelId ? payload.description.trim() || null : payload.description.trim() || undefined,
    specifications: cleanSpecs(payload.specifications),
  };
  try {
    if (modelId) {
      await apiFetch(`/product-models/${assertId(modelId, 'model')}`, { method: 'PATCH', body });
    } else {
      await apiFetch(`/products/${id}/models`, { method: 'POST', body: { ...body, isActive: payload.isActive ?? true } });
    }
  } catch (error) {
    return toResult(error, 'The model could not be saved.');
  }
  refresh(id);
  return { ok: true };
}

export async function setModelStatusAction(productId: string, modelId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await apiFetch(`/product-models/${assertId(modelId, 'model')}/status`, { method: 'PATCH', body: { isActive } });
  } catch (error) {
    return toResult(error, 'The model status could not be changed.');
  }
  refresh(assertId(productId, 'product'));
  return { ok: true };
}

export async function deleteModelAction(productId: string, modelId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/product-models/${assertId(modelId, 'model')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The model could not be deleted.');
  }
  refresh(assertId(productId, 'product'));
  return { ok: true };
}

export async function setModelImageAction(productId: string, modelId: string, formData: FormData): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image.' };
  const body = new FormData();
  body.set('file', file);
  try {
    await apiFetch(`/product-models/${assertId(modelId, 'model')}/image`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The image could not be uploaded.');
  }
  refresh(assertId(productId, 'product'));
  return { ok: true };
}

export async function removeModelImageAction(productId: string, modelId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/product-models/${assertId(modelId, 'model')}/image`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The image could not be removed.');
  }
  refresh(assertId(productId, 'product'));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vendor mappings (product side)
// ---------------------------------------------------------------------------

export interface VendorMappingInput {
  modelIds: string[];
  vendorSku: string;
  leadTimeDays: string;
  isPreferred: boolean;
  remarks: string;
}

export interface MapVendorsResult extends ActionResult {
  /** Vendors refused because they are not mapped to the product's brand. */
  brandMissing?: Array<{ vendorId: string; vendorName: string; brandName: string }>;
}

export async function mapVendorsToProductAction(
  productId: string,
  vendors: Array<{ id: string; name: string }>,
  input: VendorMappingInput,
  mapBrand: boolean,
): Promise<MapVendorsResult> {
  const id = assertId(productId, 'product');
  const lead = input.leadTimeDays.trim();
  const failures: string[] = [];
  const brandMissing: NonNullable<MapVendorsResult['brandMissing']> = [];

  for (const vendor of vendors) {
    try {
      await apiFetch(`/products/${id}/vendors`, {
        method: 'POST',
        body: {
          vendorId: assertId(vendor.id, 'vendor'),
          modelIds: input.modelIds,
          ...(vendors.length === 1 && input.vendorSku.trim() ? { vendorSku: input.vendorSku.trim() } : {}),
          ...(lead ? { leadTimeDays: Number(lead) } : {}),
          isPreferred: input.isPreferred,
          ...(input.remarks.trim() ? { remarks: input.remarks.trim() } : {}),
          mapBrand,
        },
      });
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { code?: string; brand?: { name: string } }) : {};
      if (body.code === 'VENDOR_BRAND_NOT_MAPPED') {
        brandMissing.push({ vendorId: vendor.id, vendorName: vendor.name, brandName: body.brand?.name ?? 'this brand' });
      } else {
        failures.push(`${vendor.name}: ${error instanceof ApiError ? error.messages[0] : 'could not be mapped'}`);
      }
    }
  }

  refresh(id);
  if (brandMissing.length || failures.length) {
    return {
      error: failures[0] ?? (brandMissing.length ? 'Some vendors are not mapped to this brand yet.' : undefined),
      errors: failures.length > 1 ? failures : undefined,
      brandMissing: brandMissing.length ? brandMissing : undefined,
    };
  }
  return { ok: true };
}

export async function updateProductVendorAction(
  productId: string,
  vendorId: string,
  input: VendorMappingInput & { status: 'ACTIVE' | 'INACTIVE' },
): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  const lead = input.leadTimeDays.trim();
  try {
    await apiFetch(`/products/${id}/vendors/${assertId(vendorId, 'vendor')}`, {
      method: 'PATCH',
      body: {
        modelIds: input.modelIds,
        vendorSku: input.vendorSku.trim(),
        leadTimeDays: lead ? Number(lead) : null,
        isPreferred: input.isPreferred,
        remarks: input.remarks.trim(),
        status: input.status,
      },
    });
  } catch (error) {
    return toResult(error, 'The mapping could not be updated.');
  }
  refresh(id);
  return { ok: true };
}

export async function unmapProductVendorAction(productId: string, vendorId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/vendors/${assertId(vendorId, 'vendor')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The mapping could not be removed.');
  }
  refresh(id);
  return { ok: true };
}

/** Existing vendors from Vendor Management (non-archived). */
export async function searchVendorsAction(term: string): Promise<Array<{ id: string; label: string; detail: string }>> {
  try {
    const result = await apiFetch<PaginatedResponse<VendorListItem>>(
      `/vendors${queryString({ search: term.trim().slice(0, 100), pageSize: 25, sortBy: 'businessName', sortDir: 'asc' })}`,
    );
    return result.items.map((vendor) => ({
      id: vendor.id,
      label: vendor.businessName,
      detail: `${vendor.vendorCode}${vendor.status === 'INACTIVE' ? ' · inactive' : ''}${
        vendor.companies.length ? ` · ${vendor.companies.map((c) => c.company.name).join(', ')}` : ''
      }`,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function readUpload(formData: FormData): { file: File; kind: string } | { error: string } {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  return { file, kind: String(formData.get('kind') ?? '') };
}

export async function uploadProductDocumentAction(productId: string, formData: FormData): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  const upload = readUpload(formData);
  if ('error' in upload) return upload;
  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);
  try {
    await apiFetch(`/products/${id}/documents`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The document could not be uploaded.');
  }
  refresh(id);
  return { ok: true };
}

export async function replaceProductDocumentAction(productId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  const upload = readUpload(formData);
  if ('error' in upload) return upload;
  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);
  try {
    await apiFetch(`/products/${id}/documents/${assertId(documentId, 'document')}/replace`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The document could not be replaced.');
  }
  refresh(id);
  return { ok: true };
}

export async function removeProductDocumentAction(productId: string, documentId: string): Promise<ActionResult> {
  const id = assertId(productId, 'product');
  try {
    await apiFetch(`/products/${id}/documents/${assertId(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(id);
  return { ok: true };
}
