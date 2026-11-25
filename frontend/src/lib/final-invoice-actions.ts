'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';
import type { FinalInvoiceStatus, InvoiceNumbering, ProformaBankDetails } from './types';

/**
 * Server actions for Final Invoice Management. The API validates,
 * authorises and owns every amount (copied from the proforma invoice);
 * these only shape the request.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

function toResult(error: unknown, fallback: string): ActionResult & { existingId?: string } {
  if (error instanceof ApiError) {
    const details = error.body.details as { problems?: unknown; finalInvoiceId?: string } | undefined;
    if (details && Array.isArray(details.problems)) return { error: error.messages[0], errors: details.problems.map(String) };
    const messages = error.messages;
    return {
      error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0],
      errors: messages.length > 1 ? messages : undefined,
      existingId: details?.finalInvoiceId,
    };
  }
  return { error: fallback };
}

const refresh = (invoiceId?: string) => {
  revalidatePath('/final-invoices');
  if (invoiceId) revalidatePath(`/final-invoices/${invoiceId}`);
};

/** Empty string means "clear the field" (sent as null); undefined means "unchanged". */
const nullable = (value: string | undefined) => (value === undefined ? undefined : value.trim() === '' ? null : value.trim());

export interface FinalInvoiceDetailsPayload {
  invoiceDate: string;
  dueDate: string;
  contactId: string;
  assignedToId: string;
  subject: string;
  purchaseOrderNumber: string;
  internalRemarks: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  termsAndConditions: string;
  notes: string;
  paymentInstructions: string;
  bankDetails: ProformaBankDetails;
}

function detailsBody(payload: FinalInvoiceDetailsPayload) {
  if (payload.contactId) id(payload.contactId, 'contact');
  if (payload.assignedToId) id(payload.assignedToId, 'employee');
  const bank = Object.fromEntries(
    Object.entries(payload.bankDetails ?? {}).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v !== ''),
  );
  return {
    ...(payload.invoiceDate ? { invoiceDate: payload.invoiceDate } : {}),
    dueDate: nullable(payload.dueDate),
    contactId: nullable(payload.contactId),
    assignedToId: nullable(payload.assignedToId),
    subject: nullable(payload.subject),
    purchaseOrderNumber: nullable(payload.purchaseOrderNumber),
    internalRemarks: nullable(payload.internalRemarks),
    paymentTerms: nullable(payload.paymentTerms),
    deliveryTerms: nullable(payload.deliveryTerms),
    warrantyTerms: nullable(payload.warrantyTerms),
    termsAndConditions: nullable(payload.termsAndConditions),
    notes: nullable(payload.notes),
    paymentInstructions: nullable(payload.paymentInstructions),
    bankDetails: Object.keys(bank).length ? bank : null,
  };
}

export async function createFinalInvoiceAction(proformaInvoiceId: string, payload: FinalInvoiceDetailsPayload): Promise<ActionResult & { existingId?: string }> {
  const piId = id(proformaInvoiceId, 'proforma invoice');
  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/final-invoices', { method: 'POST', body: { proformaInvoiceId: piId, ...detailsBody(payload) } });
  } catch (error) {
    return toResult(error, 'The invoice could not be created.');
  }
  refresh();
  revalidatePath(`/proforma-invoices/${piId}`);
  redirect(`/final-invoices/${created.id}?created=1`);
}

export async function updateFinalInvoiceAction(invoiceId: string, payload: FinalInvoiceDetailsPayload): Promise<ActionResult> {
  const fid = id(invoiceId, 'invoice');
  try {
    await apiFetch(`/final-invoices/${fid}`, { method: 'PATCH', body: detailsBody(payload) });
  } catch (error) {
    return toResult(error, 'The invoice could not be saved.');
  }
  refresh(fid);
  redirect(`/final-invoices/${fid}?saved=1`);
}

export async function changeFinalInvoiceStatusAction(invoiceId: string, status: FinalInvoiceStatus, remarks: string): Promise<ActionResult> {
  const fid = id(invoiceId, 'invoice');
  try {
    await apiFetch(`/final-invoices/${fid}/status`, { method: 'POST', body: { status, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(fid);
  return { ok: true };
}

export async function deleteFinalInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/final-invoices/${id(invoiceId, 'invoice')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The invoice could not be deleted.');
  }
  refresh();
  return { ok: true };
}

async function sendUpload(path: string, formData: FormData, fallback: string, invoiceId: string): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  const body = new FormData();
  body.set('file', file);
  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, fallback);
  }
  refresh(invoiceId);
  return { ok: true };
}

export async function uploadFinalInvoiceDocumentAction(invoiceId: string, formData: FormData): Promise<ActionResult> {
  const fid = id(invoiceId, 'invoice');
  return sendUpload(`/final-invoices/${fid}/documents`, formData, 'The document could not be uploaded.', fid);
}

export async function replaceFinalInvoiceDocumentAction(invoiceId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const fid = id(invoiceId, 'invoice');
  return sendUpload(`/final-invoices/${fid}/documents/${id(documentId, 'document')}/replace`, formData, 'The document could not be replaced.', fid);
}

export async function removeFinalInvoiceDocumentAction(invoiceId: string, documentId: string): Promise<ActionResult> {
  const fid = id(invoiceId, 'invoice');
  try {
    await apiFetch(`/final-invoices/${fid}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(fid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings (settings.manage on the API)
// ---------------------------------------------------------------------------

export async function setInvoiceApprovalAction(enabled: boolean): Promise<ActionResult> {
  try {
    await apiFetch('/settings', { method: 'PATCH', body: { key: 'invoice.approvalRequired', value: enabled } });
  } catch (error) {
    return toResult(error, 'The approval setting could not be changed.');
  }
  revalidatePath('/settings');
  refresh();
  return { ok: true };
}

export async function updateInvoiceNumberingAction(numbering: InvoiceNumbering): Promise<ActionResult> {
  try {
    await apiFetch('/final-invoices/settings/numbering', {
      method: 'PUT',
      body: {
        prefix: numbering.prefix.trim(),
        padding: Math.trunc(Number(numbering.padding)),
        financialYear: Boolean(numbering.financialYear),
        fyStartMonth: Math.trunc(Number(numbering.fyStartMonth)),
      },
    });
  } catch (error) {
    return toResult(error, 'The invoice numbering could not be saved.');
  }
  revalidatePath('/settings');
  return { ok: true };
}
