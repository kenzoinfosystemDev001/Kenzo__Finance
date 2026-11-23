'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from './api';
import type { ActionResult } from './vendor-actions';
import type { CustomerAddressType, CustomerDuplicate, CustomerStatus, CustomerType } from './types';

/** Server actions for Customer Management. The API validates and authorises every call. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

const prettify = (message: string) =>
  message
    .replace(/^contacts\.(\d+)\./, (_, i) => `Contact ${Number(i) + 1}: `)
    .replace(/^addresses\.(\d+)\./, (_, i) => `Address ${Number(i) + 1}: `);

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

const refresh = (customerId?: string) => {
  revalidatePath('/customers');
  if (customerId) revalidatePath(`/customers/${customerId}`);
};

const nullBlanks = <T extends Record<string, unknown>>(input: T) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === 'string' && !v.trim() ? null : v])) as T;
const dropBlanks = <T extends Record<string, unknown>>(input: T) =>
  Object.fromEntries(Object.entries(input).filter(([, v]) => !(v === undefined || v === null || (typeof v === 'string' && !v.trim())))) as Partial<T>;

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export interface CustomerContactPayload {
  name: string;
  designation: string;
  department: string;
  email: string;
  phone: string;
  alternatePhone: string;
  isPrimary: boolean;
}

export interface CustomerAddressPayload {
  addressType: CustomerAddressType;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerBasicsPayload {
  customerType: CustomerType;
  name: string;
  categoryId: string;
  industry: string;
  website: string;
  description: string;
  taxCountry: string;
  gstin: string;
  pan: string;
  cin: string;
  taxRegistrationNumber: string;
  otherRegistration: string;
  companySize: string;
  businessType: string;
  annualTurnoverRange: string;
  employeeCount: string;
}

export interface CustomerFormResult extends ActionResult {
  duplicates?: CustomerDuplicate[];
  requiresConfirmation?: boolean;
}

function formResult(error: unknown): CustomerFormResult {
  const base = toResult(error, 'Could not reach the server. Please try again.');
  if (error instanceof ApiError) {
    const body = error.body as { duplicates?: CustomerDuplicate[]; requiresConfirmation?: boolean };
    return { ...base, duplicates: body.duplicates, requiresConfirmation: body.requiresConfirmation };
  }
  return base;
}

function basicsBody(payload: CustomerBasicsPayload, forUpdate: boolean) {
  const { employeeCount, ...rest } = payload;
  const count = employeeCount.trim() ? Number(employeeCount) : null;
  const body = forUpdate ? nullBlanks({ ...rest }) : dropBlanks({ ...rest });
  return { ...body, ...(count !== null || forUpdate ? { employeeCount: count } : {}) };
}

export async function createCustomerAction(
  payload: CustomerBasicsPayload & {
    status: CustomerStatus;
    contacts: CustomerContactPayload[];
    addresses: CustomerAddressPayload[];
    confirmPossibleDuplicate: boolean;
  },
): Promise<CustomerFormResult> {
  if (!payload.name.trim()) return { error: 'Customer name is required.' };
  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/customers', {
      method: 'POST',
      body: {
        ...basicsBody(payload, false),
        status: payload.status,
        contacts: payload.contacts.map((c) => dropBlanks({ ...c })),
        addresses: payload.addresses.map((a) => dropBlanks({ ...a })),
        confirmPossibleDuplicate: payload.confirmPossibleDuplicate,
      },
    });
  } catch (error) {
    return formResult(error);
  }
  refresh();
  redirect(`/customers/${created.id}?created=1`);
}

export async function updateCustomerAction(customerId: string, payload: CustomerBasicsPayload): Promise<CustomerFormResult> {
  const cid = id(customerId, 'customer');
  if (!payload.name.trim()) return { error: 'Customer name is required.' };
  try {
    await apiFetch(`/customers/${cid}`, { method: 'PATCH', body: { ...basicsBody(payload, true), name: payload.name.trim(), customerType: payload.customerType } });
  } catch (error) {
    return formResult(error);
  }
  refresh(cid);
  redirect(`/customers/${cid}?updated=1`);
}

export async function checkCustomerDuplicatesAction(input: {
  name?: string;
  gstin?: string;
  pan?: string;
  emails?: string[];
  phones?: string[];
  excludeId?: string;
}): Promise<CustomerDuplicate[]> {
  try {
    const result = await apiFetch<{ matches: CustomerDuplicate[] }>(
      `/customers/check-duplicates${queryString({
        name: input.name,
        gstin: input.gstin,
        pan: input.pan,
        email: input.emails?.filter(Boolean).join(','),
        phone: input.phones?.filter(Boolean).join(','),
        excludeId: input.excludeId,
      })}`,
    );
    return result.matches;
  } catch {
    return [];
  }
}

export async function setCustomerStatusAction(customerId: string, status: CustomerStatus, reason?: string): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    await apiFetch(`/customers/${cid}/status`, { method: 'PATCH', body: { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(cid);
  return { ok: true };
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/customers/${id(customerId, 'customer')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The customer could not be deleted.');
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contacts and addresses
// ---------------------------------------------------------------------------

export async function saveCustomerContactAction(customerId: string, contactId: string | null, payload: CustomerContactPayload): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    if (contactId) {
      const body = nullBlanks({ ...payload });
      if (!payload.isPrimary) delete (body as Partial<CustomerContactPayload>).isPrimary;
      await apiFetch(`/customer-contacts/${id(contactId, 'contact')}`, { method: 'PATCH', body });
    } else {
      await apiFetch(`/customers/${cid}/contacts`, { method: 'POST', body: dropBlanks({ ...payload }) });
    }
  } catch (error) {
    return toResult(error, 'The contact could not be saved.');
  }
  refresh(cid);
  return { ok: true };
}

export async function deleteCustomerContactAction(customerId: string, contactId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/customer-contacts/${id(contactId, 'contact')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The contact could not be removed.');
  }
  refresh(id(customerId, 'customer'));
  return { ok: true };
}

export async function saveCustomerAddressAction(customerId: string, addressId: string | null, payload: CustomerAddressPayload): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    if (addressId) {
      const body = nullBlanks({ ...payload });
      if (!payload.isDefault) delete (body as Partial<CustomerAddressPayload>).isDefault;
      await apiFetch(`/customer-addresses/${id(addressId, 'address')}`, { method: 'PATCH', body });
    } else {
      await apiFetch(`/customers/${cid}/addresses`, { method: 'POST', body: dropBlanks({ ...payload }) });
    }
  } catch (error) {
    return toResult(error, 'The address could not be saved.');
  }
  refresh(cid);
  return { ok: true };
}

export async function deleteCustomerAddressAction(customerId: string, addressId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/customer-addresses/${id(addressId, 'address')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The address could not be removed.');
  }
  refresh(id(customerId, 'customer'));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Products of interest (shared catalogue from Product Management)
// ---------------------------------------------------------------------------

export async function addProductInterestAction(customerId: string, productId: string, modelIds: string[], notes: string): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    await apiFetch(`/customers/${cid}/products`, {
      method: 'POST',
      body: { productId: id(productId, 'product'), modelIds: modelIds.map((m) => id(m, 'model')), ...(notes.trim() ? { notes: notes.trim() } : {}) },
    });
  } catch (error) {
    return toResult(error, 'The product could not be added.');
  }
  refresh(cid);
  return { ok: true };
}

export async function updateProductInterestAction(customerId: string, interestId: string, notes: string): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    await apiFetch(`/customers/${cid}/products/${id(interestId, 'mapping')}`, { method: 'PATCH', body: { notes } });
  } catch (error) {
    return toResult(error, 'The notes could not be saved.');
  }
  refresh(cid);
  return { ok: true };
}

export async function removeProductInterestAction(customerId: string, interestId: string): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    await apiFetch(`/customers/${cid}/products/${id(interestId, 'mapping')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The product could not be removed.');
  }
  refresh(cid);
  return { ok: true };
}

/** Models of one product, for the interest picker (Product Management API). */
export async function listProductModelsAction(productId: string): Promise<Array<{ id: string; label: string; detail: string; isActive: boolean }>> {
  try {
    const models = await apiFetch<Array<{ id: string; modelName: string; modelNumber: string; modelCode: string; isActive: boolean }>>(
      `/products/${id(productId, 'product')}/models`,
    );
    return models.map((m) => ({ id: m.id, label: m.modelName, detail: `${m.modelNumber} · ${m.modelCode}`, isActive: m.isActive }));
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

async function sendUpload(path: string, formData: FormData, fallback: string, customerId: string): Promise<ActionResult> {
  const upload = readUpload(formData);
  if ('error' in upload) return upload;
  const body = new FormData();
  body.set('file', upload.file);
  if (upload.kind) body.set('kind', upload.kind);
  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, fallback);
  }
  refresh(customerId);
  return { ok: true };
}

export async function uploadCustomerDocumentAction(customerId: string, formData: FormData): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  return sendUpload(`/customers/${cid}/documents`, formData, 'The document could not be uploaded.', cid);
}

export async function replaceCustomerDocumentAction(customerId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  return sendUpload(`/customers/${cid}/documents/${id(documentId, 'document')}/replace`, formData, 'The document could not be replaced.', cid);
}

export async function removeCustomerDocumentAction(customerId: string, documentId: string): Promise<ActionResult> {
  const cid = id(customerId, 'customer');
  try {
    await apiFetch(`/customers/${cid}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(cid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categories (configurable; settings.manage on the API)
// ---------------------------------------------------------------------------

export async function createCustomerCategoryAction(name: string, description: string): Promise<ActionResult> {
  if (!name.trim()) return { error: 'Category name is required.' };
  try {
    await apiFetch('/customers/categories', { method: 'POST', body: { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The category could not be created.');
  }
  revalidatePath('/customers/categories');
  return { ok: true };
}

export async function updateCustomerCategoryAction(categoryId: string, values: Record<string, string>): Promise<ActionResult> {
  if (!values.name?.trim()) return { error: 'Category name is required.' };
  try {
    await apiFetch(`/customers/categories/${id(categoryId, 'category')}`, {
      method: 'PATCH',
      body: { name: values.name.trim(), description: values.description?.trim() ?? '' },
    });
  } catch (error) {
    return toResult(error, 'The category could not be saved.');
  }
  revalidatePath('/customers/categories');
  return { ok: true };
}

export async function setCustomerCategoryActiveAction(categoryId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await apiFetch(`/customers/categories/${id(categoryId, 'category')}`, { method: 'PATCH', body: { isActive } });
  } catch (error) {
    return toResult(error, 'The category status could not be changed.');
  }
  revalidatePath('/customers/categories');
  return { ok: true };
}

export async function deleteCustomerCategoryAction(categoryId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/customers/categories/${id(categoryId, 'category')}`, { method: 'DELETE' });
  } catch (error) {
    return error instanceof ApiError ? { error: error.messages[0] } : { error: 'The category could not be deleted.' };
  }
  revalidatePath('/customers/categories');
  return { ok: true };
}

/** Admin-only. The API checks settings.manage; this only forwards the request. */
export async function setCustomerFavouriteAction(customerId: string, isFavourite: boolean): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return { error: 'This customer could not be found.' };
  try {
    await apiFetch(`/customers/${customerId}/favourite`, { method: 'PATCH', body: { isFavourite } });
  } catch (error) {
    return error instanceof ApiError ? { error: error.messages[0] } : { error: 'The favourite status could not be changed.' };
  }
  revalidatePath('/customers');
  return { ok: true };
}
