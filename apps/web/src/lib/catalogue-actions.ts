'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';

export interface CatalogueFormState {
  error?: string;
  success?: string;
}

export async function createCompanyAction(
  _prevState: CatalogueFormState,
  formData: FormData,
): Promise<CatalogueFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();

  if (!name) return { error: 'Brand name is required.' };

  try {
    await apiFetch('/companies', {
      method: 'POST',
      body: { name, ...(code ? { code } : {}) },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The brand could not be created.',
    };
  }

  revalidatePath('/companies');
  return { success: `Brand "${name}" added.` };
}

export async function createProductCategoryAction(
  _prevState: CatalogueFormState,
  formData: FormData,
): Promise<CatalogueFormState> {
  const name = String(formData.get('name') ?? '').trim();

  if (!name) return { error: 'Category name is required.' };

  try {
    await apiFetch('/products/categories', { method: 'POST', body: { name } });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The category could not be created.',
    };
  }

  revalidatePath('/products');
  return { success: `Category "${name}" added.` };
}

// ---------------------------------------------------------------------------
// Edit / activate / deactivate shared masters (brands, product categories).
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOrThrow(value: string): string {
  if (!UUID.test(value)) throw new Error('Invalid id');
  return value;
}

export interface MasterResult {
  ok?: boolean;
  error?: string;
}

const failure = (error: unknown, fallback: string): MasterResult => ({
  error: error instanceof ApiError ? error.messages[0] : fallback,
});

/** Edits a shared brand. Name stays unique (normalised) across the brand master. */
export async function updateBrandAction(
  brandId: string,
  values: Record<string, string>,
): Promise<MasterResult> {
  const name = values.name?.trim() ?? '';
  if (!name) return { error: 'Brand name is required.' };
  try {
    await apiFetch(`/companies/${idOrThrow(brandId)}`, {
      method: 'PATCH',
      body: {
        name,
        // '' (not undefined) so clearing a field reaches the API and clears
        // it; an omitted key means "leave unchanged".
        code: values.code?.trim() ?? '',
        website: values.website?.trim() ?? '',
      },
    });
  } catch (error) {
    return failure(error, 'The brand could not be saved.');
  }
  revalidatePath('/companies');
  revalidatePath('/products');
  return { ok: true };
}

export async function setBrandActiveAction(brandId: string, isActive: boolean): Promise<MasterResult> {
  try {
    await apiFetch(`/companies/${idOrThrow(brandId)}`, { method: 'PATCH', body: { isActive } });
  } catch (error) {
    return failure(error, 'The brand status could not be changed.');
  }
  revalidatePath('/companies');
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  values: Record<string, string>,
): Promise<MasterResult> {
  const name = values.name?.trim() ?? '';
  if (!name) return { error: 'Category name is required.' };
  try {
    await apiFetch(`/products/categories/${idOrThrow(categoryId)}`, {
      method: 'PATCH',
      body: { name, description: values.description?.trim() ?? '' },
    });
  } catch (error) {
    return failure(error, 'The category could not be saved.');
  }
  revalidatePath('/products/categories');
  revalidatePath('/products');
  return { ok: true };
}

export async function setCategoryActiveAction(categoryId: string, isActive: boolean): Promise<MasterResult> {
  try {
    await apiFetch(`/products/categories/${idOrThrow(categoryId)}`, { method: 'PATCH', body: { isActive } });
  } catch (error) {
    return failure(error, 'The category status could not be changed.');
  }
  revalidatePath('/products/categories');
  return { ok: true };
}

export async function deleteCategoryAction(categoryId: string): Promise<MasterResult> {
  try {
    await apiFetch(`/products/categories/${idOrThrow(categoryId)}`, { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The category could not be deleted.');
  }
  revalidatePath('/products/categories');
  revalidatePath('/products');
  return { ok: true };
}

export async function deleteBrandAction(brandId: string): Promise<MasterResult> {
  try {
    await apiFetch(`/companies/${idOrThrow(brandId)}`, { method: 'DELETE' });
  } catch (error) {
    return failure(error, 'The brand could not be deleted.');
  }
  revalidatePath('/companies');
  revalidatePath('/products');
  return { ok: true };
}
