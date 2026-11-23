'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Changes the payment due date of an issued invoice. The API enforces the
 * permission, the issued-status rule and the date order; this only shapes the
 * request. Payment alerts are recalculated on the next read, so the header
 * bell and dashboard refresh with the page.
 */
export async function updateInvoiceDueDateAction(invoiceId: string, dueDate: string | null): Promise<ActionResult> {
  if (!UUID.test(invoiceId)) return { error: 'This invoice could not be found.' };
  const value = dueDate === null || dueDate.trim() === '' ? null : dueDate.trim();
  if (value !== null && !DATE.test(value)) return { error: 'Enter a valid due date.' };

  try {
    await apiFetch(`/final-invoices/${invoiceId}/due-date`, { method: 'PATCH', body: { dueDate: value } });
  } catch (error) {
    return error instanceof ApiError
      ? { error: error.messages[0] }
      : { error: 'The due date could not be saved. Nothing was changed.' };
  }

  revalidatePath(`/final-invoices/${invoiceId}`);
  revalidatePath('/final-invoices');
  revalidatePath('/dashboard');
  revalidatePath('/', 'layout');
  return { ok: true };
}
