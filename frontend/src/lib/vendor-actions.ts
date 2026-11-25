'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from './api';
import type {
  Company,
  DuplicateMatch,
  OcrJob,
  PaginatedResponse,
  Product,
  VendorAddressType,
  VendorContactType,
  VendorDetail,
  VendorStatus,
} from './types';

/**
 * Server actions for Vendor Management.
 *
 * They run on the Next server with the user's httpOnly session and call the
 * NestJS API, which is where validation and permissions are enforced. Nothing
 * here is a security boundary; it only shapes requests and errors.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok?: boolean;
  error?: string;
  /** Individual validation messages when the API returned several. */
  errors?: string[];
  details?: Record<string, number>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IDs are interpolated into API paths, so they must be exactly a UUID. */
function assertId(value: string | null | undefined, label = 'id'): string {
  if (!value || !UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

/** "contacts.0.Contact name is required" -> "Contact 1: Contact name is required" */
function prettify(message: string): string {
  return message
    .replace(/^contacts\.(\d+)\./, (_, i) => `Contact ${Number(i) + 1}: `)
    .replace(/^addresses\.(\d+)\./, (_, i) => `Address ${Number(i) + 1}: `);
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

function refreshVendor(vendorId?: string): void {
  revalidatePath('/vendors');
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

/** Blank strings become null so PATCH clears a field instead of ignoring it. */
function nullifyBlanks<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = typeof value === 'string' && value.trim() === '' ? null : value;
  }
  return output as T;
}

/** Blank strings are dropped so POST does not send empty optional fields. */
function dropBlanks<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    if (value === undefined || value === null) continue;
    output[key] = value;
  }
  return output as Partial<T>;
}

// ---------------------------------------------------------------------------
// Vendor create / update
// ---------------------------------------------------------------------------

export interface ContactPayload {
  contactType: VendorContactType;
  name: string;
  designation: string;
  phone: string;
  alternatePhone: string;
  email: string;
  alternateEmail: string;
  isPrimary: boolean;
  notes?: string;
}

export interface AddressPayload {
  addressType: VendorAddressType;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isPrimary: boolean;
}

export interface VendorBasicsPayload {
  businessName: string;
  legalName: string;
  categoryId: string;
  registrationNumber: string;
  gstin: string;
  pan: string;
  website: string;
  status: VendorStatus;
  notes: string;
  phone: string;
  alternatePhone: string;
  email: string;
  alternateEmail: string;
}

export interface VendorCreatePayload extends VendorBasicsPayload {
  contacts: ContactPayload[];
  addresses: AddressPayload[];
  companyIds: string[];
  productIds: string[];
  ocrJobId?: string;
  confirmPossibleDuplicate?: boolean;
}

export interface VendorFormResult extends ActionResult {
  duplicates?: DuplicateMatch[];
  requiresConfirmation?: boolean;
}

function toVendorFormResult(error: unknown): VendorFormResult {
  const base = toResult(error, 'Could not reach the server. Please try again.');
  if (error instanceof ApiError) {
    const body = error.body as { duplicates?: DuplicateMatch[]; requiresConfirmation?: boolean };
    return { ...base, duplicates: body.duplicates, requiresConfirmation: body.requiresConfirmation };
  }
  return base;
}

export async function createVendorAction(payload: VendorCreatePayload): Promise<VendorFormResult> {
  if (!payload.businessName?.trim()) return { error: 'Vendor name is required.' };

  let vendor: VendorDetail;
  try {
    vendor = await apiFetch<VendorDetail>('/vendors', {
      method: 'POST',
      body: {
        ...dropBlanks({ ...payload, contacts: undefined, addresses: undefined, companyIds: undefined, productIds: undefined }),
        contacts: payload.contacts.map((contact) => dropBlanks({ ...contact })),
        addresses: payload.addresses.map((address) => dropBlanks({ ...address })),
        companyIds: payload.companyIds,
        productIds: payload.productIds,
        confirmPossibleDuplicate: payload.confirmPossibleDuplicate === true,
      },
    });
  } catch (error) {
    return toVendorFormResult(error);
  }

  refreshVendor();
  redirect(`/vendors/${vendor.id}?created=1`);
}

export async function updateVendorAction(
  vendorId: string,
  payload: Omit<VendorBasicsPayload, 'status'>,
): Promise<VendorFormResult> {
  const id = assertId(vendorId, 'vendor');
  if (!payload.businessName?.trim()) return { error: 'Vendor name is required.' };

  try {
    await apiFetch(`/vendors/${id}`, {
      method: 'PATCH',
      body: { ...nullifyBlanks(payload), businessName: payload.businessName.trim() },
    });
  } catch (error) {
    return toVendorFormResult(error);
  }

  refreshVendor(id);
  redirect(`/vendors/${id}?updated=1`);
}

export async function checkDuplicatesAction(input: {
  businessName?: string;
  gstin?: string;
  emails?: string[];
  phones?: string[];
  excludeVendorId?: string;
}): Promise<DuplicateMatch[]> {
  try {
    const result = await apiFetch<{ matches: DuplicateMatch[] }>(
      `/vendors/check-duplicates${queryString({
        businessName: input.businessName,
        gstin: input.gstin,
        email: input.emails?.filter(Boolean).join(','),
        phone: input.phones?.filter(Boolean).join(','),
        excludeVendorId: input.excludeVendorId,
      })}`,
    );
    return result.matches;
  } catch {
    // Advisory only; the create call enforces the same rules.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Status, archive, delete
// ---------------------------------------------------------------------------

export async function setVendorStatusAction(
  vendorId: string,
  status: VendorStatus,
  reason?: string,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/status`, {
      method: 'PATCH',
      body: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
    });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function archiveVendorAction(vendorId: string, reason?: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/archive`, {
      method: 'POST',
      body: reason?.trim() ? { reason: reason.trim() } : {},
    });
  } catch (error) {
    return toResult(error, 'The vendor could not be archived.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function restoreVendorAction(vendorId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/restore`, { method: 'POST' });
  } catch (error) {
    return toResult(error, 'The vendor could not be restored.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function deleteVendorAction(vendorId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The vendor could not be deleted.');
  }
  refreshVendor();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contacts and addresses
// ---------------------------------------------------------------------------

export async function saveContactAction(
  vendorId: string,
  contactId: string | null,
  payload: ContactPayload,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    if (contactId) {
      await apiFetch(`/vendors/${id}/contacts/${assertId(contactId, 'contact')}`, {
        method: 'PATCH',
        body: nullifyBlanks({ ...payload }),
      });
    } else {
      await apiFetch(`/vendors/${id}/contacts`, { method: 'POST', body: dropBlanks({ ...payload }) });
    }
  } catch (error) {
    return toResult(error, 'The contact could not be saved.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function deleteContactAction(vendorId: string, contactId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/contacts/${assertId(contactId, 'contact')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The contact could not be removed.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function saveAddressAction(
  vendorId: string,
  addressId: string | null,
  payload: AddressPayload,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    if (addressId) {
      const body = nullifyBlanks({ ...payload });
      // Un-ticking primary is not a valid request; primary moves by ticking another.
      if (!payload.isPrimary) delete (body as Partial<AddressPayload>).isPrimary;
      await apiFetch(`/vendors/${id}/addresses/${assertId(addressId, 'address')}`, {
        method: 'PATCH',
        body,
      });
    } else {
      await apiFetch(`/vendors/${id}/addresses`, { method: 'POST', body: dropBlanks({ ...payload }) });
    }
  } catch (error) {
    return toResult(error, 'The address could not be saved.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function deleteAddressAction(vendorId: string, addressId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/addresses/${assertId(addressId, 'address')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The address could not be removed.');
  }
  refreshVendor(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Brand and product mappings
// ---------------------------------------------------------------------------

/** Maps several brands; reports each failure instead of stopping at the first. */
export async function mapBrandsAction(
  vendorId: string,
  companyIds: string[],
  isAuthorized: boolean,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  const failures: string[] = [];
  for (const companyId of companyIds) {
    try {
      await apiFetch(`/vendors/${id}/companies`, {
        method: 'POST',
        body: { companyId: assertId(companyId, 'brand'), isAuthorized },
      });
    } catch (error) {
      failures.push(error instanceof ApiError ? error.messages[0] : 'A brand could not be mapped.');
    }
  }
  refreshVendor(id);
  if (failures.length) return { error: failures[0], errors: failures.length > 1 ? failures : undefined };
  return { ok: true };
}

export async function updateBrandMappingAction(
  vendorId: string,
  companyId: string,
  input: { isAuthorized: boolean; remarks: string },
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/companies/${assertId(companyId, 'brand')}`, {
      method: 'PATCH',
      body: { isAuthorized: input.isAuthorized, remarks: input.remarks.trim() },
    });
  } catch (error) {
    return toResult(error, 'The brand mapping could not be updated.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function unmapBrandAction(vendorId: string, companyId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/companies/${assertId(companyId, 'brand')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The brand could not be removed.');
  }
  refreshVendor(id);
  return { ok: true };
}

export interface ProductMappingInput {
  vendorSku: string;
  leadTimeDays: string;
  isPreferred: boolean;
  remarks: string;
}

function mappingBody(input: ProductMappingInput, forUpdate: boolean) {
  const lead = input.leadTimeDays.trim();
  return {
    vendorSku: forUpdate ? input.vendorSku.trim() : input.vendorSku.trim() || undefined,
    remarks: forUpdate ? input.remarks.trim() : input.remarks.trim() || undefined,
    leadTimeDays: lead === '' ? (forUpdate ? null : undefined) : Number(lead),
    isPreferred: input.isPreferred,
  };
}

export interface MapProductsResult extends ActionResult {
  /** Products refused because the vendor is not mapped to their brand. */
  brandMissing?: Array<{ productId: string; brandName: string }>;
}

/**
 * Maps several products. A product whose brand is not mapped to the vendor is
 * refused by the API unless `mapBrand` is set (an explicit user choice); those
 * are reported separately so the UI can ask.
 */
export async function mapProductsAction(
  vendorId: string,
  productIds: string[],
  input: ProductMappingInput,
  mapBrand = false,
): Promise<MapProductsResult> {
  const id = assertId(vendorId, 'vendor');
  const failures: string[] = [];
  const brandMissing: NonNullable<MapProductsResult['brandMissing']> = [];
  for (const productId of productIds) {
    try {
      await apiFetch(`/vendors/${id}/products`, {
        method: 'POST',
        body: { productId: assertId(productId, 'product'), ...mappingBody(input, false), mapBrand },
      });
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { code?: string; brand?: { name: string } }) : {};
      if (body.code === 'VENDOR_BRAND_NOT_MAPPED') {
        brandMissing.push({ productId, brandName: body.brand?.name ?? 'its brand' });
      } else {
        failures.push(error instanceof ApiError ? error.messages[0] : 'A product could not be mapped.');
      }
    }
  }
  refreshVendor(id);
  if (failures.length || brandMissing.length) {
    return {
      error: failures[0] ?? 'Some products belong to brands this vendor is not mapped to.',
      errors: failures.length > 1 ? failures : undefined,
      brandMissing: brandMissing.length ? brandMissing : undefined,
    };
  }
  return { ok: true };
}

export async function updateProductMappingAction(
  vendorId: string,
  productId: string,
  input: ProductMappingInput,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/products/${assertId(productId, 'product')}`, {
      method: 'PATCH',
      body: mappingBody(input, true),
    });
  } catch (error) {
    return toResult(error, 'The product mapping could not be updated.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function unmapProductAction(vendorId: string, productId: string): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/products/${assertId(productId, 'product')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The product could not be removed.');
  }
  refreshVendor(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared master-data lookups (brands and products live in Product Management)
// ---------------------------------------------------------------------------

export async function searchBrandsAction(term: string): Promise<Company[]> {
  try {
    const result = await apiFetch<PaginatedResponse<Company>>(
      `/companies${queryString({ search: term.trim().slice(0, 100), pageSize: 25, sortBy: 'name', sortDir: 'asc' })}`,
    );
    return result.items.filter((company) => company.isActive);
  } catch {
    return [];
  }
}

export async function searchProductsAction(term: string, companyId?: string): Promise<Product[]> {
  try {
    const result = await apiFetch<PaginatedResponse<Product>>(
      `/products${queryString({
        search: term.trim().slice(0, 100),
        companyId: companyId && UUID.test(companyId) ? companyId : undefined,
        pageSize: 25,
        sortBy: 'name',
        sortDir: 'asc',
      })}`,
    );
    return result.items.filter((product) => !product.archivedAt);
  } catch {
    return [];
  }
}

/**
 * Registers a brand in the shared brand master (requires company.create).
 * The API de-duplicates by normalised name, so "HP" and "H.P." cannot both exist.
 */
export async function quickCreateBrandAction(name: string): Promise<ActionResult & { brand?: Company }> {
  if (!name.trim()) return { error: 'Brand name is required.' };
  try {
    const brand = await apiFetch<Company>('/companies', { method: 'POST', body: { name: name.trim() } });
    revalidatePath('/companies');
    return { ok: true, brand };
  } catch (error) {
    return toResult(error, 'The brand could not be created.');
  }
}

/**
 * Registers a product/model in the shared catalogue (requires product.create).
 * Brand + model number is unique there, so the same model is never created twice.
 */
export async function quickCreateProductAction(input: {
  name: string;
  companyId: string;
  modelName: string;
  modelNumber: string;
  categoryId: string;
}): Promise<ActionResult & { product?: Product }> {
  if (!input.name.trim()) return { error: 'Product name is required.' };
  if (input.modelName.trim() && !input.modelNumber.trim()) return { error: 'Enter the model number for the model.' };
  try {
    const product = await apiFetch<Product>('/products', {
      method: 'POST',
      body: {
        name: input.name.trim(),
        companyId: assertId(input.companyId, 'brand'),
        ...(input.categoryId ? { categoryId: assertId(input.categoryId, 'category') } : {}),
        ...(input.modelNumber.trim()
          ? { models: [{ modelName: input.modelName.trim() || input.name.trim(), modelNumber: input.modelNumber.trim() }] }
          : {}),
      },
    });
    revalidatePath('/products');
    return { ok: true, product };
  } catch (error) {
    return toResult(error, 'The product could not be created.');
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

export async function uploadVendorDocumentAction(
  vendorId: string,
  formData: FormData,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  const upload = readUpload(formData);
  if ('error' in upload) return upload;

  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);

  try {
    await apiFetch(`/vendors/${id}/documents`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The document could not be uploaded.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function replaceVendorDocumentAction(
  vendorId: string,
  documentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  const upload = readUpload(formData);
  if ('error' in upload) return upload;

  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);

  try {
    await apiFetch(`/vendors/${id}/documents/${assertId(documentId, 'document')}/replace`, {
      method: 'POST',
      formData: body,
    });
  } catch (error) {
    return toResult(error, 'The document could not be replaced.');
  }
  refreshVendor(id);
  return { ok: true };
}

export async function removeVendorDocumentAction(
  vendorId: string,
  documentId: string,
): Promise<ActionResult> {
  const id = assertId(vendorId, 'vendor');
  try {
    await apiFetch(`/vendors/${id}/documents/${assertId(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refreshVendor(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

export interface OcrUploadState {
  error?: string;
  job?: OcrJob;
  duplicates?: DuplicateMatch[];
}

/**
 * Uploads a document and returns the extracted draft for review, plus any
 * existing vendors that look like the same business. No vendor is created
 * here - the user confirms on the review step.
 */
export async function uploadOcrDocumentAction(
  _prevState: OcrUploadState,
  formData: FormData,
): Promise<OcrUploadState> {
  const upload = readUpload(formData);
  if ('error' in upload) return upload;

  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);

  let job: OcrJob;
  try {
    job = await apiFetch<OcrJob>('/ocr/vendor-documents', { method: 'POST', formData: body });
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.messages[0] : 'The document could not be processed.',
    };
  }

  const prefill = job.prefill ?? {};
  const duplicates =
    prefill.businessName || prefill.gstin || prefill.email || prefill.phone
      ? await checkDuplicatesAction({
          businessName: prefill.businessName,
          gstin: prefill.gstin,
          emails: [prefill.email, prefill.alternateEmail].filter(Boolean) as string[],
          phones: [prefill.phone, prefill.alternatePhone].filter(Boolean) as string[],
        })
      : [];

  return { job, duplicates };
}
