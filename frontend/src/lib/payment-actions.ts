'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';
import type { EligiblePaymentInvoice, PaymentDuplicate, PaymentMethodOption } from './types';

/**
 * Server actions for Payment Management. The API validates every amount
 * against the invoice balance, owns the status lifecycle and recalculates
 * the invoice position; these only shape the request.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

export type PaymentActionResult = ActionResult & { duplicates?: PaymentDuplicate[] };

function toResult(error: unknown, fallback: string): PaymentActionResult {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.body.requiresConfirmation) {
      return { error: error.messages[0], duplicates: (error.body.duplicates as PaymentDuplicate[] | undefined) ?? [] };
    }
    const messages = error.messages;
    return { error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0], errors: messages.length > 1 ? messages : undefined };
  }
  return { error: fallback };
}

function refresh(paymentId?: string, invoiceId?: string, customerId?: string) {
  revalidatePath('/payments');
  revalidatePath('/final-invoices');
  if (paymentId) revalidatePath(`/payments/${paymentId}`);
  if (invoiceId) revalidatePath(`/final-invoices/${invoiceId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export interface PaymentFieldsPayload {
  paymentDate: string;
  amount: string;
  method: string;
  transactionReference: string;
  bankReference: string;
  receivedById: string;
  notes: string;
  confirmDuplicateReference: boolean;
}

/** Empty string means "clear the field" (sent as null). */
const nullable = (value: string) => (value.trim() === '' ? null : value.trim());

function fieldsBody(payload: PaymentFieldsPayload) {
  const amount = payload.amount.trim();
  if (!DATE.test(payload.paymentDate)) throw new Error('Invalid payment date');
  if (!MONEY.test(amount)) throw new Error('Invalid amount');
  if (payload.receivedById) id(payload.receivedById, 'employee');
  return {
    paymentDate: payload.paymentDate,
    amount,
    method: payload.method,
    transactionReference: nullable(payload.transactionReference),
    bankReference: nullable(payload.bankReference),
    receivedById: nullable(payload.receivedById),
    notes: nullable(payload.notes),
    confirmDuplicateReference: payload.confirmDuplicateReference,
  };
}

export async function eligibleInvoicesAction(customerId: string): Promise<{ invoices?: EligiblePaymentInvoice[]; error?: string }> {
  if (!UUID.test(customerId)) return { error: 'Choose a customer.' };
  try {
    return { invoices: await apiFetch<EligiblePaymentInvoice[]>(`/payments/eligible-invoices?customerId=${customerId}`) };
  } catch (error) {
    return { error: error instanceof ApiError ? error.messages[0] : 'The invoices could not be loaded.' };
  }
}

export async function createPaymentAction(customerId: string, finalInvoiceId: string, currency: string, payload: PaymentFieldsPayload): Promise<PaymentActionResult> {
  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/payments', {
      method: 'POST',
      body: { customerId: id(customerId, 'customer'), finalInvoiceId: id(finalInvoiceId, 'invoice'), currency, ...fieldsBody(payload) },
    });
  } catch (error) {
    return toResult(error, 'The payment could not be recorded.');
  }
  refresh(created.id, finalInvoiceId, customerId);
  redirect(`/payments/${created.id}?created=1`);
}

export async function updatePaymentAction(paymentId: string, payload: PaymentFieldsPayload): Promise<PaymentActionResult> {
  const pid = id(paymentId, 'payment');
  try {
    await apiFetch(`/payments/${pid}`, { method: 'PATCH', body: fieldsBody(payload) });
  } catch (error) {
    return toResult(error, 'The payment could not be saved.');
  }
  refresh(pid);
  redirect(`/payments/${pid}?saved=1`);
}

export async function verifyPaymentAction(paymentId: string): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  try {
    await apiFetch(`/payments/${pid}/verify`, { method: 'POST' });
  } catch (error) {
    return toResult(error, 'The payment could not be verified.');
  }
  refresh(pid);
  return { ok: true };
}

export async function rejectPaymentAction(paymentId: string, reason: string): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  if (!reason.trim()) return { error: 'Give the reason for rejecting the payment.' };
  try {
    await apiFetch(`/payments/${pid}/reject`, { method: 'POST', body: { reason: reason.trim() } });
  } catch (error) {
    return toResult(error, 'The payment could not be rejected.');
  }
  refresh(pid);
  return { ok: true };
}

export async function reversePaymentAction(paymentId: string, reason: string): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  if (!reason.trim()) return { error: 'Give the reason for reversing the payment.' };
  try {
    await apiFetch(`/payments/${pid}/reverse`, { method: 'POST', body: { reason: reason.trim() } });
  } catch (error) {
    return toResult(error, 'The payment could not be reversed.');
  }
  refresh(pid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Payment proof
// ---------------------------------------------------------------------------

async function sendUpload(path: string, formData: FormData, fallback: string, paymentId: string): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  const body = new FormData();
  body.set('file', file);
  body.set('kind', 'PAYMENT_PROOF');
  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, fallback);
  }
  refresh(paymentId);
  return { ok: true };
}

export async function uploadPaymentDocumentAction(paymentId: string, formData: FormData): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  return sendUpload(`/payments/${pid}/documents`, formData, 'The document could not be uploaded.', pid);
}

export async function replacePaymentDocumentAction(paymentId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  return sendUpload(`/payments/${pid}/documents/${id(documentId, 'document')}/replace`, formData, 'The document could not be replaced.', pid);
}

export async function removePaymentDocumentAction(paymentId: string, documentId: string): Promise<ActionResult> {
  const pid = id(paymentId, 'payment');
  try {
    await apiFetch(`/payments/${pid}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(pid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings (settings.manage on the API)
// ---------------------------------------------------------------------------

export async function updatePaymentSettingsAction(methods: PaymentMethodOption[], autoVerifyMethods: string[]): Promise<ActionResult> {
  try {
    await apiFetch('/payments/settings', {
      method: 'PUT',
      body: {
        methods: methods.map((m) => ({ code: m.code.trim(), label: m.label.trim(), active: Boolean(m.active) })),
        autoVerifyMethods,
      },
    });
  } catch (error) {
    return toResult(error, 'The payment settings could not be saved.');
  }
  revalidatePath('/settings');
  revalidatePath('/payments');
  return { ok: true };
}
