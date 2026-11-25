'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';
import type { DiscountType, FollowUpMethod, QuotationCompanyProfile, QuotationStatus } from './types';

/** Server actions for Quotation Management. The API validates, calculates and authorises every call. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

const prettify = (message: string) => message.replace(/^items\.(\d+)\./, (_, i) => `Item ${Number(i) + 1}: `);

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof ApiError) {
    const details = error.body.details as { problems?: unknown } | undefined;
    // The enquiry hand-off explains why it cannot be converted as a list.
    if (details && Array.isArray(details.problems)) {
      return { error: error.messages[0], errors: details.problems.map(String) };
    }
    const messages = error.messages.map(prettify);
    return {
      error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0],
      errors: messages.length > 1 ? messages : undefined,
    };
  }
  return { error: fallback };
}

const refresh = (quotationId?: string) => {
  revalidatePath('/quotations');
  if (quotationId) revalidatePath(`/quotations/${quotationId}`);
};

const text = (value: string | undefined | null) => (value && value.trim() ? value.trim() : undefined);
const textOrNull = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface QuotationLinePayload {
  productId: string;
  productModelId: string;
  enquiryItemId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxLabel: string;
  taxRate: string;
  remarks: string;
}

export interface QuotationContentPayload {
  quotationDate: string;
  validUntil: string;
  items: QuotationLinePayload[];
  additionalDiscount: string;
  otherChargesLabel: string;
  otherCharges: string;
  termsAndConditions: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  notes: string;
  internalRemarks: string;
}

export interface QuotationHeaderPayload {
  contactId: string;
  assignedToId: string;
  subject: string;
  referenceNumber: string;
}

export interface QuotationCreatePayload extends QuotationContentPayload, QuotationHeaderPayload {
  enquiryId: string;
  customerId: string;
  currency: string;
}

function lineBody(line: QuotationLinePayload) {
  const discounted = line.discountType !== 'NONE';
  return {
    productId: id(line.productId, 'product'),
    ...(line.productModelId ? { productModelId: id(line.productModelId, 'model') } : {}),
    ...(line.enquiryItemId ? { enquiryItemId: id(line.enquiryItemId, 'enquiry item') } : {}),
    ...(text(line.description) ? { description: text(line.description) } : {}),
    quantity: Number(line.quantity),
    unit: text(line.unit) ?? 'Nos',
    unitPrice: line.unitPrice.trim(),
    discountType: line.discountType,
    ...(discounted && text(line.discountValue) ? { discountValue: line.discountValue.trim() } : {}),
    ...(text(line.taxLabel) ? { taxLabel: text(line.taxLabel) } : {}),
    ...(text(line.taxRate) ? { taxRate: line.taxRate.trim() } : {}),
    ...(text(line.remarks) ? { remarks: text(line.remarks) } : {}),
  };
}

/** Revision content. Blank optional text is left out, which the API stores as empty. */
function contentBody(payload: QuotationContentPayload) {
  const optional = (field: keyof Omit<QuotationContentPayload, 'items'>) => (text(payload[field]) ? { [field]: text(payload[field]) } : {});
  return {
    ...optional('quotationDate'),
    ...optional('validUntil'),
    items: payload.items.map(lineBody),
    ...optional('additionalDiscount'),
    ...optional('otherChargesLabel'),
    ...optional('otherCharges'),
    ...optional('termsAndConditions'),
    ...optional('paymentTerms'),
    ...optional('deliveryTerms'),
    ...optional('warrantyTerms'),
    ...optional('notes'),
    ...optional('internalRemarks'),
  };
}

// ---------------------------------------------------------------------------
// Create / edit / revise / delete
// ---------------------------------------------------------------------------

export async function createQuotationAction(payload: QuotationCreatePayload): Promise<ActionResult> {
  if (!payload.enquiryId && !payload.customerId) return { error: 'Select a customer, or create the quotation from an enquiry.' };
  if (!Array.isArray(payload.items) || payload.items.length === 0) return { error: 'Add at least one item.' };

  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/quotations', {
      method: 'POST',
      body: {
        ...(payload.enquiryId ? { enquiryId: id(payload.enquiryId, 'enquiry') } : { customerId: id(payload.customerId, 'customer') }),
        ...(payload.contactId ? { contactId: id(payload.contactId, 'contact') } : {}),
        ...(payload.assignedToId ? { assignedToId: id(payload.assignedToId, 'employee') } : {}),
        ...(text(payload.subject) ? { subject: text(payload.subject) } : {}),
        ...(text(payload.referenceNumber) ? { referenceNumber: text(payload.referenceNumber) } : {}),
        ...(text(payload.currency) ? { currency: text(payload.currency)!.toUpperCase() } : {}),
        ...contentBody(payload),
      },
    });
  } catch (error) {
    return toResult(error, 'The quotation could not be created.');
  }
  refresh();
  if (payload.enquiryId) revalidatePath(`/enquiries/${payload.enquiryId}`);
  redirect(`/quotations/${created.id}?created=1`);
}

export async function updateQuotationDraftAction(
  quotationId: string,
  payload: QuotationContentPayload & QuotationHeaderPayload & { currency?: string },
): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  if (!Array.isArray(payload.items) || payload.items.length === 0) return { error: 'Add at least one item.' };
  try {
    await apiFetch(`/quotations/${qid}/draft`, {
      method: 'PATCH',
      body: {
        ...contentBody(payload),
        header: {
          contactId: payload.contactId ? id(payload.contactId, 'contact') : null,
          assignedToId: payload.assignedToId ? id(payload.assignedToId, 'employee') : null,
          subject: textOrNull(payload.subject),
          referenceNumber: textOrNull(payload.referenceNumber),
          ...(text(payload.currency) ? { currency: text(payload.currency)!.toUpperCase() } : {}),
        },
      },
    });
  } catch (error) {
    return toResult(error, 'The draft could not be saved.');
  }
  refresh(qid);
  redirect(`/quotations/${qid}?updated=1`);
}

export async function createRevisionAction(quotationId: string, remarks: string): Promise<ActionResult & { revisionNumber?: number }> {
  const qid = id(quotationId, 'quotation');
  try {
    const created = await apiFetch<{ revisionNumber: number }>(`/quotations/${qid}/revisions`, {
      method: 'POST',
      body: text(remarks) ? { remarks: text(remarks) } : {},
    });
    refresh(qid);
    return { ok: true, revisionNumber: created.revisionNumber };
  } catch (error) {
    return toResult(error, 'The new revision could not be created.');
  }
}

export async function changeQuotationStatusAction(quotationId: string, status: QuotationStatus, remarks: string): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  try {
    await apiFetch(`/quotations/${qid}/status`, { method: 'POST', body: { status, ...(text(remarks) ? { remarks: text(remarks) } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(qid);
  return { ok: true };
}

export async function deleteQuotationAction(quotationId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/quotations/${id(quotationId, 'quotation')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The quotation could not be deleted.');
  }
  refresh();
  revalidatePath('/enquiries');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Communication log (a record of what happened; nothing is sent)
// ---------------------------------------------------------------------------

export interface CommunicationPayload {
  /** ISO date-time of the interaction. */
  occurredAt: string;
  channel: FollowUpMethod;
  contactName: string;
  summary: string;
}

export async function addQuotationCommunicationAction(quotationId: string, payload: CommunicationPayload): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  if (!payload.summary.trim()) return { error: 'Summary is required.' };
  try {
    await apiFetch(`/quotations/${qid}/communications`, {
      method: 'POST',
      body: {
        occurredAt: payload.occurredAt,
        channel: payload.channel,
        ...(text(payload.contactName) ? { contactName: text(payload.contactName) } : {}),
        summary: payload.summary.trim(),
      },
    });
  } catch (error) {
    return toResult(error, 'The communication could not be recorded.');
  }
  refresh(qid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

async function sendUpload(path: string, formData: FormData, fallback: string, quotationId: string): Promise<ActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  const body = new FormData();
  body.set('file', file);
  const kind = String(formData.get('kind') ?? '');
  if (kind) body.set('kind', kind);
  try {
    await apiFetch(path, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, fallback);
  }
  refresh(quotationId);
  return { ok: true };
}

export async function uploadQuotationDocumentAction(quotationId: string, formData: FormData): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  return sendUpload(`/quotations/${qid}/documents`, formData, 'The document could not be uploaded.', qid);
}

export async function replaceQuotationDocumentAction(quotationId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  return sendUpload(`/quotations/${qid}/documents/${id(documentId, 'document')}/replace`, formData, 'The document could not be replaced.', qid);
}

export async function removeQuotationDocumentAction(quotationId: string, documentId: string): Promise<ActionResult> {
  const qid = id(quotationId, 'quotation');
  try {
    await apiFetch(`/quotations/${qid}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(qid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Settings (settings.manage on the API)
// ---------------------------------------------------------------------------

export async function setQuotationApprovalAction(enabled: boolean): Promise<ActionResult> {
  try {
    await apiFetch('/settings', { method: 'PATCH', body: { key: 'quotation.approvalRequired', value: enabled } });
  } catch (error) {
    return toResult(error, 'The approval setting could not be changed.');
  }
  revalidatePath('/settings');
  refresh();
  return { ok: true };
}

export async function updateQuotationDefaultTermsAction(defaultTerms: string): Promise<ActionResult> {
  try {
    await apiFetch('/quotations/settings', { method: 'PATCH', body: { defaultTerms } });
  } catch (error) {
    return toResult(error, 'The default terms could not be saved.');
  }
  revalidatePath('/settings');
  return { ok: true };
}

export async function updateCompanyProfileAction(profile: QuotationCompanyProfile): Promise<ActionResult> {
  const body = Object.fromEntries(
    (['name', 'address', 'phone', 'email', 'website', 'gstin', 'pan'] as const)
      .map((key) => [key, (profile[key] ?? '').trim()] as const)
      .filter(([, value]) => value !== ''),
  );
  try {
    await apiFetch('/quotations/settings/company-profile', { method: 'PUT', body });
  } catch (error) {
    return toResult(error, 'The company profile could not be saved.');
  }
  revalidatePath('/settings');
  return { ok: true };
}
