'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ProductDetail, StockMovementType } from './types';

export interface ProductFormState {
  error?: string;
  fieldErrors?: string[];
  success?: string;
  values?: Record<string, string>;
}

/**
 * Reads the repeating spec rows the form submits as parallel
 * `specKey[]` / `specValue[]` arrays and pairs them up.
 */
function readSpecifications(formData: FormData): Record<string, string> {
  const keys = formData.getAll('specKey').map((v) => String(v).trim());
  const values = formData.getAll('specValue').map((v) => String(v).trim());

  const specifications: Record<string, string> = {};
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] && values[i]) specifications[keys[i]] = values[i];
  }
  return specifications;
}

function toFormState(error: unknown, values: Record<string, string>): ProductFormState {
  if (error instanceof ApiError) {
    return {
      error: error.messages[0],
      fieldErrors: error.messages.length > 1 ? error.messages : undefined,
      values,
    };
  }
  return { error: 'Could not reach the server. Please try again.', values };
}

function readProductValues(formData: FormData): Record<string, string> {
  const fields = [
    'name', 'companyId', 'modelNumber', 'designNumber',
    'categoryId', 'description', 'reorderLevel',
  ];

  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = String(formData.get(field) ?? '').trim();
    if (value) values[field] = value;
  }
  return values;
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const values = readProductValues(formData);

  if (!values.name) return { error: 'Product name is required.', values };
  if (!values.companyId) return { error: 'Select the brand this product belongs to.', values };
  if (!values.modelNumber) return { error: 'Model number is required.', values };

  const specifications = readSpecifications(formData);
  let product: ProductDetail;

  try {
    product = await apiFetch<ProductDetail>('/products', {
      method: 'POST',
      body: {
        name: values.name,
        companyId: values.companyId,
        modelNumber: values.modelNumber,
        ...(values.designNumber ? { designNumber: values.designNumber } : {}),
        ...(values.categoryId ? { categoryId: values.categoryId } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.reorderLevel ? { reorderLevel: Number(values.reorderLevel) } : {}),
        ...(Object.keys(specifications).length > 0 ? { specifications } : {}),
      },
    });
  } catch (error) {
    return toFormState(error, values);
  }

  revalidatePath('/products');
  redirect(`/products/${product.id}`);
}

export async function updateProductAction(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const values = readProductValues(formData);
  const specifications = readSpecifications(formData);

  try {
    await apiFetch(`/products/${productId}`, {
      method: 'PATCH',
      body: {
        ...(values.name ? { name: values.name } : {}),
        ...(values.modelNumber ? { modelNumber: values.modelNumber } : {}),
        designNumber: values.designNumber ?? '',
        categoryId: values.categoryId ?? '',
        description: values.description ?? '',
        // An empty field clears the reorder level rather than leaving a stale one.
        reorderLevel: values.reorderLevel ? Number(values.reorderLevel) : null,
        specifications,
      },
    });
  } catch (error) {
    return toFormState(error, values);
  }

  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

export async function archiveProductAction(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  await apiFetch(`/products/${productId}/archive`, { method: 'POST' });
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
}

export async function restoreProductAction(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  await apiFetch(`/products/${productId}/restore`, { method: 'POST' });
  revalidatePath('/products');
  revalidatePath(`/products/${productId}`);
}

export interface ImageUploadState {
  error?: string;
  success?: string;
}

export async function uploadProductImageAction(
  productId: string,
  _prevState: ImageUploadState,
  formData: FormData,
): Promise<ImageUploadState> {
  const file = formData.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }

  const upload = new FormData();
  upload.set('file', file);

  try {
    await apiFetch(`/products/${productId}/image`, {
      method: 'POST',
      formData: upload,
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError ? error.messages[0] : 'The image could not be saved.',
    };
  }

  revalidatePath(`/products/${productId}`);
  return { success: 'Catalogue image updated.' };
}

export async function removeProductImageAction(formData: FormData): Promise<void> {
  const productId = String(formData.get('productId') ?? '');
  await apiFetch(`/products/${productId}/image`, { method: 'DELETE' });
  revalidatePath(`/products/${productId}`);
}

// --- Stock -----------------------------------------------------------------

export interface StockFormState {
  error?: string;
  success?: string;
}

export async function postStockMovementAction(
  productId: string,
  _prevState: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  const type = String(formData.get('type') ?? '') as StockMovementType;
  const quantity = Number(String(formData.get('quantity') ?? '0'));
  const reason = String(formData.get('reason') ?? '').trim();
  const occurredAt = String(formData.get('occurredAt') ?? '').trim();
  const locationId = String(formData.get('locationId') ?? '').trim();

  if (!type) return { error: 'Select a movement type.' };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: 'Quantity must be a whole number of at least 1.' };
  }

  try {
    await apiFetch(`/stock/products/${productId}/movements`, {
      method: 'POST',
      body: {
        type,
        quantity,
        ...(reason ? { reason } : {}),
        ...(locationId ? { locationId } : {}),
        ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
      },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The stock movement could not be recorded.',
    };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath('/products');
  revalidatePath('/inventory');
  return { success: 'Stock movement recorded.' };
}

export async function createStockLocationAction(
  _prevState: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();

  if (!name || !code) return { error: 'Name and code are both required.' };

  try {
    await apiFetch('/stock/locations', { method: 'POST', body: { name, code } });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The location could not be created.',
    };
  }

  revalidatePath('/inventory/locations');
  return { success: `Location "${name}" added.` };
}

export async function setStockTrackingAction(formData: FormData): Promise<void> {
  const enabled = formData.get('enabled') === 'true';

  await apiFetch('/settings', {
    method: 'PATCH',
    body: { key: 'inventory.stockTrackingEnabled', value: enabled },
  });

  // Stock tracking changes what nearly every inventory screen shows.
  revalidatePath('/', 'layout');
}

export async function createProductCategoryAction(
  _prevState: StockFormState,
  formData: FormData,
): Promise<StockFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!name) return { error: 'Category name is required.' };

  try {
    await apiFetch('/products/categories', {
      method: 'POST',
      body: { name, ...(description ? { description } : {}) },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The category could not be created.',
    };
  }

  revalidatePath('/products/categories');
  revalidatePath('/products');
  return { success: `Category "${name}" added.` };
}
