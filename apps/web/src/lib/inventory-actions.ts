'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { StockMovementType } from './types';

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
