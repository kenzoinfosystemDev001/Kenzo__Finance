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

export async function createProductAction(
  _prevState: CatalogueFormState,
  formData: FormData,
): Promise<CatalogueFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const companyId = String(formData.get('companyId') ?? '').trim();
  const modelNumber = String(formData.get('modelNumber') ?? '').trim();
  const designNumber = String(formData.get('designNumber') ?? '').trim();
  const categoryId = String(formData.get('categoryId') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!name) return { error: 'Product name is required.' };
  if (!companyId) return { error: 'Select the brand this product belongs to.' };
  if (!modelNumber) return { error: 'Model number is required.' };

  try {
    await apiFetch('/products', {
      method: 'POST',
      body: {
        name,
        companyId,
        modelNumber,
        ...(designNumber ? { designNumber } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(description ? { description } : {}),
      },
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.messages[0]
          : 'The product could not be created.',
    };
  }

  revalidatePath('/products');
  return { success: `Product "${name}" added.` };
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
