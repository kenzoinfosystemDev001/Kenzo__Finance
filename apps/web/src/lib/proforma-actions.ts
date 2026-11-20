'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';
import type { ProformaBankDetails, ProformaStatus } from './types';

/**
 * Server actions for Proforma Invoice Management. The API validates,
 * authorises and owns every amount; these only shape the request.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

function toResult(error: unknown, fallback: string): ActionResult & { existingId?: string } {
  if (error instanceof ApiError) {
    const details = error.body.details as { problems?: unknown; proformaInvoiceId?: string } | undefined;
    if (details && Array.isArray(details.problems)) return { error: error.messages[0], errors: details.problems.map(String) };
    const messages = error.messages;
    return {
      error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0],
      errors: messages.length > 1 ? messages : undefined,
      existingId: details?.proformaInvoiceId,
    };
  }
  return { error: fallback };
}

const refresh = (piId?: string) => {
  revalidatePath('/proforma-invoices');
  if (piId) revalidatePath(`/proforma-invoices/${piId}`);
};

/** Empty string means "clear the field" (sent as null); undefined means "unchanged". */
const nullable = (value: string | undefined) => (value === undefined ? undefined : value.trim() === '' ? null : value.trim());

export interface ProformaDetailsPayload {
  piDate: string;
  dueDate: string;
  contactId: string;
  assignedToId: string;
  subject: string;
  referenceNumber: string;
  internalRemarks: string;
  advanceAmount: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  termsAndConditions: string;
  notes: string;
  paymentInstructions: string;
  bankDetails: ProformaBankDetails;
}

function detailsBody(payload: ProformaDetailsPayload) {
  if (payload.contactId) id(payload.contactId, 'contact');
  if (payload.assignedToId) id(payload.assignedToId, 'employee');
  const bank = Object.fromEntries(
    Object.entries(payload.bankDetails ?? {}).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v !== ''),
  );
  return {
    ...(payload.piDate ? { piDate: payload.piDate } : {}),
    dueDate: nullable(payload.dueDate),
    contactId: nullable(payload.contactId),
    assignedToId: nullable(payload.assignedToId),
    subject: nullable(payload.subject),
    referenceNumber: nullable(payload.referenceNumber),
    internalRemarks: nullable(payload.internalRemarks),
    advanceAmount: nullable(payload.advanceAmount),
    paymentTerms: nullable(payload.paymentTerms),
    deliveryTerms: nullable(payload.deliveryTerms),
    warrantyTerms: nullable(payload.warrantyTerms),
    termsAndConditions: nullable(payload.termsAndConditions),
    notes: nullable(payload.notes),
    paymentInstructions: nullable(payload.paymentInstructions),
    bankDetails: Object.keys(bank).length ? bank : null,
  };
}

export async function createProformaAction(quotationId: string, payload: ProformaDetailsPayload): Promise<ActionResult & { existingId?: string }> {
  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/proforma-invoices', {
      method: 'POST',
      body: { quotationId: id(quotationId, 'quotation'), ...detailsBody(payload) },
    });
  } catch (error) {
    return toResult(error, 'The proforma invoice could not be created.');
  }
  refresh();
  revalidatePath(`/quotations/${quotationId}`);
  redirect(`/proforma-invoices/${created.id}?created=1`);
}

export async function updateProformaAction(piId: string, payload: ProformaDetailsPayload): Promise<ActionResult> {
  const pid = id(piId, 'proforma invoice');
  try {
    await apiFetch(`/proforma-invoices/${pid}`, { method: 'PATCH', body: detailsBody(payload) });
  } catch (error) {
    return toResult(error, 'The proforma invoice could not be saved.');
  }
  refresh(pid);
  redirect(`/proforma-invoices/${pid}?saved=1`);
}

export async function changeProformaStatusAction(piId: string, status: ProformaStatus, remarks: string): Promise<ActionResult> {
  const pid = id(piId, 'proforma invoice');
  try {
    await apiFetch(`/proforma-invoices/${pid}/status`, { method: 'POST', body: { status, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(pid);
  return { ok: true };
}

export async function deleteProformaAction(piId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/proforma-invoices/${id(piId, 'proforma invoice')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The proforma invoice could not be deleted.');
  }
  refresh();
  return { ok: true };
}

async function sendUpload(path: string, formData: FormData, fallback: string, piId: string): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  const body = new FormData();
  body.set('file', file);
  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, fallback);
  }
  refresh(piId);
  return { ok: true };
}

export async function uploadProformaDocumentAction(piId: string, formData: FormData): Promise<ActionResult> {
  const pid = id(piId, 'proforma invoice');
  return sendUpload(`/proforma-invoices/${pid}/documents`, formData, 'The document could not be uploaded.', pid);
}

export async function replaceProformaDocumentAction(piId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const pid = id(piId, 'proforma invoice');
  return sendUpload(`/proforma-invoices/${pid}/documents/${id(documentId, 'document')}/replace`, formData, 'The document could not be replaced.', pid);
}

export async function removeProformaDocumentAction(piId: string, documentId: string): Promise<ActionResult> {
  const pid = id(piId, 'proforma invoice');
  try {
    await apiFetch(`/proforma-invoices/${pid}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(pid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings (settings.manage on the API)
// ---------------------------------------------------------------------------

export async function setProformaApprovalAction(enabled: boolean): Promise<ActionResult> {
  try {
    await apiFetch('/settings', { method: 'PATCH', body: { key: 'proforma.approvalRequired', value: enabled } });
  } catch (error) {
    return toResult(error, 'The approval setting could not be changed.');
  }
  revalidatePath('/settings');
  refresh();
  return { ok: true };
}

export async function updateProformaSettingsAction(bankDetails: ProformaBankDetails, paymentInstructions: string): Promise<ActionResult> {
  const bank = Object.fromEntries(Object.entries(bankDetails).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v !== ''));
  try {
    await apiFetch('/proforma-invoices/settings', {
      method: 'PUT',
      body: { bankDetails: Object.keys(bank).length ? bank : null, paymentInstructions: paymentInstructions.trim() || null },
    });
  } catch (error) {
    return toResult(error, 'The proforma invoice settings could not be saved.');
  }
  revalidatePath('/settings');
  return { ok: true };
}
