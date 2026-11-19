'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError, queryString } from './api';
import type { ActionResult } from './vendor-actions';
import { specificationList } from './vendor-labels';
import type {
  CustomerDetail,
  CustomerLookupItem,
  EnquiryAssignee,
  EnquiryConversionCheck,
  EnquiryPriority,
  EnquiryStatus,
  FollowUpMethod,
  FollowUpOutcome,
} from './types';

/** Server actions for Enquiry Management. The API validates and authorises every call. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

const prettify = (message: string) => message.replace(/^items\.(\d+)\./, (_, i) => `Product ${Number(i) + 1}: `);

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

const refresh = (enquiryId?: string) => {
  revalidatePath('/enquiries');
  if (enquiryId) revalidatePath(`/enquiries/${enquiryId}`);
};

const text = (value: string | undefined | null) => (value && value.trim() ? value.trim() : undefined);
const textOrNull = (value: string | undefined | null) => (value && value.trim() ? value.trim() : null);

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface EnquiryItemPayload {
  productId: string;
  productModelId: string;
  quantity: number;
  unit: string;
  technicalRequirements: string;
  remarks: string;
}

export interface EnquiryDetailsPayload {
  customerId: string;
  customerContactId: string;
  enquiryDate: string;
  sourceId: string;
  priority: EnquiryPriority;
  description: string;
  internalRemarks: string;
  expectedDecisionDate: string;
  nextFollowUpDate: string;
  expectedBudget: string;
  currency: string;
  expectedDeliveryTimeline: string;
  paymentPreference: string;
  commercialNotes: string;
}

export interface EnquiryCreatePayload extends EnquiryDetailsPayload {
  assignedToId: string;
  items: EnquiryItemPayload[];
}

export interface FollowUpPayload {
  /** ISO date-time of the interaction. */
  followUpDate: string;
  contactId: string;
  method: FollowUpMethod;
  discussionSummary: string;
  customerResponse: string;
  outcome: FollowUpOutcome;
  nextFollowUpDate: string;
  assignedToId: string;
  internalNotes: string;
}

function itemBody(item: EnquiryItemPayload) {
  return {
    productId: id(item.productId, 'product'),
    ...(item.productModelId ? { productModelId: id(item.productModelId, 'model') } : {}),
    quantity: Number(item.quantity),
    unit: text(item.unit) ?? 'Nos',
    ...(text(item.technicalRequirements) ? { technicalRequirements: text(item.technicalRequirements) } : {}),
    ...(text(item.remarks) ? { remarks: text(item.remarks) } : {}),
  };
}

const budget = (value: string) => (value.trim() ? Number(value.trim()) : null);

// ---------------------------------------------------------------------------
// Enquiry
// ---------------------------------------------------------------------------

/**
 * Creates the enquiry, then uploads any attachments picked on the form.
 * FormData carries `payload` (JSON) plus parallel `file` / `kind` entries.
 */
export async function createEnquiryAction(formData: FormData): Promise<ActionResult> {
  let payload: EnquiryCreatePayload;
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'));
  } catch {
    return { error: 'The form could not be read. Please try again.' };
  }
  if (!payload.customerId || !UUID.test(payload.customerId)) return { error: 'Select a customer.' };
  if (!Array.isArray(payload.items) || payload.items.length === 0) return { error: 'Add at least one product requirement.' };

  let created: { id: string };
  try {
    created = await apiFetch<{ id: string }>('/enquiries', {
      method: 'POST',
      body: {
        customerId: payload.customerId,
        ...(text(payload.customerContactId) ? { customerContactId: payload.customerContactId } : {}),
        ...(text(payload.enquiryDate) ? { enquiryDate: payload.enquiryDate } : {}),
        ...(text(payload.sourceId) ? { sourceId: payload.sourceId } : {}),
        priority: payload.priority,
        ...(text(payload.assignedToId) ? { assignedToId: payload.assignedToId } : {}),
        ...(text(payload.description) ? { description: text(payload.description) } : {}),
        ...(text(payload.internalRemarks) ? { internalRemarks: text(payload.internalRemarks) } : {}),
        ...(text(payload.expectedDecisionDate) ? { expectedDecisionDate: payload.expectedDecisionDate } : {}),
        ...(text(payload.nextFollowUpDate) ? { nextFollowUpDate: payload.nextFollowUpDate } : {}),
        ...(budget(payload.expectedBudget) !== null ? { expectedBudget: budget(payload.expectedBudget) } : {}),
        ...(text(payload.currency) ? { currency: text(payload.currency)!.toUpperCase() } : {}),
        ...(text(payload.expectedDeliveryTimeline) ? { expectedDeliveryTimeline: text(payload.expectedDeliveryTimeline) } : {}),
        ...(text(payload.paymentPreference) ? { paymentPreference: text(payload.paymentPreference) } : {}),
        ...(text(payload.commercialNotes) ? { commercialNotes: text(payload.commercialNotes) } : {}),
        items: payload.items.map(itemBody),
      },
    });
  } catch (error) {
    return toResult(error, 'The enquiry could not be created.');
  }

  // The enquiry exists now; a failed upload is reported rather than failing the save.
  const files = formData.getAll('file');
  const kinds = formData.getAll('kind');
  let failed = 0;
  for (const [index, file] of files.entries()) {
    if (!(file instanceof File) || file.size === 0) continue;
    const body = new FormData();
    body.set('file', file);
    const kind = String(kinds[index] ?? '');
    if (kind) body.set('kind', kind);
    try {
      await apiFetch(`/enquiries/${created.id}/attachments`, { method: 'POST', formData: body });
    } catch {
      failed += 1;
    }
  }

  refresh();
  redirect(`/enquiries/${created.id}?created=1${failed ? `&attachmentsFailed=${failed}` : ''}`);
}

export async function updateEnquiryAction(enquiryId: string, payload: EnquiryDetailsPayload): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  if (!payload.customerId || !UUID.test(payload.customerId)) return { error: 'Select a customer.' };
  try {
    await apiFetch(`/enquiries/${eid}`, {
      method: 'PATCH',
      body: {
        customerId: payload.customerId,
        customerContactId: textOrNull(payload.customerContactId),
        ...(text(payload.enquiryDate) ? { enquiryDate: payload.enquiryDate } : {}),
        sourceId: textOrNull(payload.sourceId),
        priority: payload.priority,
        description: textOrNull(payload.description),
        internalRemarks: textOrNull(payload.internalRemarks),
        expectedDecisionDate: textOrNull(payload.expectedDecisionDate),
        nextFollowUpDate: textOrNull(payload.nextFollowUpDate),
        expectedBudget: budget(payload.expectedBudget),
        ...(text(payload.currency) ? { currency: text(payload.currency)!.toUpperCase() } : {}),
        expectedDeliveryTimeline: textOrNull(payload.expectedDeliveryTimeline),
        paymentPreference: textOrNull(payload.paymentPreference),
        commercialNotes: textOrNull(payload.commercialNotes),
      },
    });
  } catch (error) {
    return toResult(error, 'The enquiry could not be saved.');
  }
  refresh(eid);
  redirect(`/enquiries/${eid}?updated=1`);
}

export async function assignEnquiryAction(enquiryId: string, assignedToId: string | null): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiries/${eid}/assign`, { method: 'PATCH', body: { assignedToId: assignedToId ? id(assignedToId, 'employee') : null } });
  } catch (error) {
    return toResult(error, 'The enquiry could not be assigned.');
  }
  refresh(eid);
  return { ok: true };
}

export async function changeEnquiryStatusAction(enquiryId: string, status: EnquiryStatus, reason: string): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiries/${eid}/status`, { method: 'PATCH', body: { status, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(eid);
  return { ok: true };
}

export async function deleteEnquiryAction(enquiryId: string): Promise<ActionResult> {
  try {
    await apiFetch(`/enquiries/${id(enquiryId, 'enquiry')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The enquiry could not be deleted.');
  }
  refresh();
  return { ok: true };
}

/** Validates conversion with the API (creates nothing). */
export async function checkEnquiryConversionAction(enquiryId: string): Promise<ActionResult & { check?: EnquiryConversionCheck }> {
  try {
    const check = await apiFetch<EnquiryConversionCheck>(`/enquiries/${id(enquiryId, 'enquiry')}/conversion`);
    return { ok: true, check };
  } catch (error) {
    return toResult(error, 'The enquiry could not be checked for conversion.');
  }
}

// ---------------------------------------------------------------------------
// Product requirements
// ---------------------------------------------------------------------------

export async function addEnquiryItemAction(enquiryId: string, payload: EnquiryItemPayload): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiries/${eid}/items`, { method: 'POST', body: itemBody(payload) });
  } catch (error) {
    return toResult(error, 'The product requirement could not be added.');
  }
  refresh(eid);
  return { ok: true };
}

export async function updateEnquiryItemAction(enquiryId: string, itemId: string, payload: EnquiryItemPayload): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    const body = itemBody(payload);
    await apiFetch(`/enquiry-items/${id(itemId, 'item')}`, {
      method: 'PATCH',
      body: {
        ...body,
        // null clears a field (a blank string would mean "unchanged" to the API).
        productModelId: payload.productModelId ? body.productModelId : null,
        technicalRequirements: textOrNull(payload.technicalRequirements),
        remarks: textOrNull(payload.remarks),
      },
    });
  } catch (error) {
    return toResult(error, 'The product requirement could not be saved.');
  }
  refresh(eid);
  return { ok: true };
}

export async function removeEnquiryItemAction(enquiryId: string, itemId: string): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiry-items/${id(itemId, 'item')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The product requirement could not be removed.');
  }
  refresh(eid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

function followUpBody(payload: FollowUpPayload, forUpdate: boolean) {
  const optional = (value: string) => (forUpdate ? textOrNull(value) : text(value));
  const body: Record<string, unknown> = {
    followUpDate: payload.followUpDate,
    method: payload.method,
    discussionSummary: payload.discussionSummary.trim(),
    outcome: payload.outcome,
    contactId: payload.contactId ? id(payload.contactId, 'contact') : forUpdate ? null : undefined,
    customerResponse: optional(payload.customerResponse),
    nextFollowUpDate: optional(payload.nextFollowUpDate),
    assignedToId: payload.assignedToId ? id(payload.assignedToId, 'employee') : forUpdate ? null : undefined,
    internalNotes: optional(payload.internalNotes),
  };
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

export async function addFollowUpAction(enquiryId: string, payload: FollowUpPayload): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  if (!payload.discussionSummary.trim()) return { error: 'Discussion summary is required.' };
  try {
    await apiFetch(`/enquiries/${eid}/follow-ups`, { method: 'POST', body: followUpBody(payload, false) });
  } catch (error) {
    return toResult(error, 'The follow-up could not be recorded.');
  }
  refresh(eid);
  revalidatePath('/enquiries/follow-ups');
  return { ok: true };
}

export async function updateFollowUpAction(enquiryId: string, followUpId: string, payload: FollowUpPayload): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  if (!payload.discussionSummary.trim()) return { error: 'Discussion summary is required.' };
  try {
    await apiFetch(`/enquiry-follow-ups/${id(followUpId, 'follow-up')}`, { method: 'PATCH', body: followUpBody(payload, true) });
  } catch (error) {
    return toResult(error, 'The follow-up could not be saved.');
  }
  refresh(eid);
  revalidatePath('/enquiries/follow-ups');
  return { ok: true };
}

export async function deleteFollowUpAction(enquiryId: string, followUpId: string): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiry-follow-ups/${id(followUpId, 'follow-up')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The follow-up could not be removed.');
  }
  refresh(eid);
  revalidatePath('/enquiries/follow-ups');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

async function sendUpload(path: string, formData: FormData, fallback: string, enquiryId: string): Promise<ActionResult> {
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
  refresh(enquiryId);
  return { ok: true };
}

export async function uploadEnquiryAttachmentAction(enquiryId: string, formData: FormData): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  return sendUpload(`/enquiries/${eid}/attachments`, formData, 'The attachment could not be uploaded.', eid);
}

export async function replaceEnquiryAttachmentAction(enquiryId: string, documentId: string, formData: FormData): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  return sendUpload(`/enquiries/${eid}/attachments/${id(documentId, 'document')}/replace`, formData, 'The attachment could not be replaced.', eid);
}

export async function removeEnquiryAttachmentAction(enquiryId: string, documentId: string): Promise<ActionResult> {
  const eid = id(enquiryId, 'enquiry');
  try {
    await apiFetch(`/enquiries/${eid}/attachments/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The attachment could not be removed.');
  }
  refresh(eid);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sources (configurable; settings.manage on the API)
// ---------------------------------------------------------------------------

export async function createEnquirySourceAction(name: string, description: string): Promise<ActionResult> {
  if (!name.trim()) return { error: 'Source name is required.' };
  try {
    await apiFetch('/enquiries/sources', { method: 'POST', body: { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) } });
  } catch (error) {
    return toResult(error, 'The source could not be created.');
  }
  revalidatePath('/enquiries/sources');
  return { ok: true };
}

export async function updateEnquirySourceAction(sourceId: string, values: Record<string, string>): Promise<ActionResult> {
  if (!values.name?.trim()) return { error: 'Source name is required.' };
  try {
    await apiFetch(`/enquiries/sources/${id(sourceId, 'source')}`, {
      method: 'PATCH',
      body: { name: values.name.trim(), description: values.description?.trim() ?? '' },
    });
  } catch (error) {
    return toResult(error, 'The source could not be saved.');
  }
  revalidatePath('/enquiries/sources');
  return { ok: true };
}

export async function setEnquirySourceActiveAction(sourceId: string, isActive: boolean): Promise<ActionResult> {
  try {
    await apiFetch(`/enquiries/sources/${id(sourceId, 'source')}`, { method: 'PATCH', body: { isActive } });
  } catch (error) {
    return toResult(error, 'The source status could not be changed.');
  }
  revalidatePath('/enquiries/sources');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lookups for pickers (Customer and Product Management APIs)
// ---------------------------------------------------------------------------

export async function searchCustomersAction(term: string): Promise<CustomerLookupItem[]> {
  try {
    return await apiFetch<CustomerLookupItem[]>(`/customers/lookup${queryString({ search: term.trim().slice(0, 100) })}`);
  } catch {
    return [];
  }
}

export async function getCustomerForEnquiryAction(customerId: string): Promise<CustomerDetail | null> {
  if (!UUID.test(customerId)) return null;
  try {
    return await apiFetch<CustomerDetail>(`/customers/${customerId}`);
  } catch {
    return null;
  }
}

export interface ModelOption {
  id: string;
  modelName: string;
  modelNumber: string;
  modelCode: string;
  isActive: boolean;
  specifications: Array<{ name: string; value: string }>;
}

/** Models of one product with their specifications, for the requirement picker. */
export async function listModelsWithSpecsAction(productId: string): Promise<ModelOption[]> {
  if (!UUID.test(productId)) return [];
  try {
    const models = await apiFetch<Array<{ id: string; modelName: string; modelNumber: string; modelCode: string; isActive: boolean; specifications: unknown }>>(
      `/products/${productId}/models`,
    );
    return models.map((m) => ({
      id: m.id,
      modelName: m.modelName,
      modelNumber: m.modelNumber,
      modelCode: m.modelCode,
      isActive: m.isActive,
      specifications: specificationList(m.specifications),
    }));
  } catch {
    return [];
  }
}

export async function listAssigneesAction(): Promise<EnquiryAssignee[]> {
  try {
    return await apiFetch<EnquiryAssignee[]>('/enquiries/assignees');
  } catch {
    return [];
  }
}
