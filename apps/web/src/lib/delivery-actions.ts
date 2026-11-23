'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import type { ActionResult } from './vendor-actions';
import type { CustomerDetail, DeliveryInvoiceItem, DeliveryUploadKind, EligibleDeliveryInvoice, TransportMode } from './types';

/**
 * Server actions for Delivery Management. The API validates quantities
 * against the invoice (under a lock), owns the lifecycle and checks every
 * permission; these only shape the request. The DTOs reject unknown fields,
 * so each body carries exactly the fields of its DTO.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MODES: TransportMode[] = ['DIRECT', 'OWN_VEHICLE', 'TRANSPORT', 'COURIER'];
const UPLOAD_KINDS: DeliveryUploadKind[] = ['DELIVERY_POD', 'DELIVERY_SIGNATURE', 'DELIVERY_PHOTO', 'DELIVERY_ATTACHMENT'];

const id = (value: string, label = 'id') => {
  if (!UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
};

/** Empty string means "clear / not given" (sent as null). */
const nullable = (value: string | undefined | null) => (value == null || value.trim() === '' ? null : value.trim());
/** Empty string means "leave out" (the field is omitted from the body). */
const optional = (value: string | undefined | null) => (value == null || value.trim() === '' ? undefined : value.trim());

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof ApiError) {
    const details = error.body.details as { problems?: unknown } | undefined;
    if (details && Array.isArray(details.problems) && details.problems.length > 1) return { error: error.messages[0], errors: details.problems.map(String) };
    const messages = error.messages;
    return { error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0], errors: messages.length > 1 ? messages : undefined };
  }
  if (error instanceof Error && error.message.startsWith('Invalid')) return { error: error.message };
  return { error: fallback };
}

function refresh(deliveryId?: string, invoiceId?: string, customerId?: string) {
  revalidatePath('/deliveries');
  if (deliveryId) revalidatePath(`/deliveries/${deliveryId}`);
  if (invoiceId) revalidatePath(`/final-invoices/${invoiceId}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

// ---------------------------------------------------------------------------
// Lookups for the create form
// ---------------------------------------------------------------------------

export async function eligibleDeliveryInvoicesAction(customerId: string): Promise<{ invoices?: EligibleDeliveryInvoice[]; error?: string }> {
  if (!UUID.test(customerId)) return { error: 'Choose a customer.' };
  try {
    return { invoices: await apiFetch<EligibleDeliveryInvoice[]>(`/deliveries/eligible-invoices?customerId=${customerId}`) };
  } catch (error) {
    return { error: error instanceof ApiError ? error.messages[0] : 'The invoices could not be loaded.' };
  }
}

export async function deliveryInvoiceItemsAction(finalInvoiceId: string): Promise<{ items?: DeliveryInvoiceItem[]; error?: string }> {
  if (!UUID.test(finalInvoiceId)) return { error: 'Choose an invoice.' };
  try {
    return { items: await apiFetch<DeliveryInvoiceItem[]>(`/deliveries/invoices/${finalInvoiceId}/items`) };
  } catch (error) {
    return { error: error instanceof ApiError ? error.messages[0] : 'The invoice items could not be loaded.' };
  }
}

export interface DeliveryCustomerInfo {
  addresses: Array<{ id: string; label: string; text: string; isDefault: boolean; addressType: string }>;
  contacts: Array<{ name: string; phone: string | null }>;
}

/** The customer's saved addresses and contacts, offered as delivery address / contact (needs customer.read). */
export async function deliveryCustomerInfoAction(customerId: string): Promise<{ info?: DeliveryCustomerInfo; error?: string }> {
  if (!UUID.test(customerId)) return { error: 'Choose a customer.' };
  try {
    const c = await apiFetch<CustomerDetail>(`/customers/${customerId}`);
    return {
      info: {
        addresses: c.addresses.map((a) => ({
          id: a.id,
          addressType: a.addressType,
          isDefault: a.isDefault,
          label: `${a.addressType.replace(/_/g, ' ').toLowerCase()}${a.isDefault ? ' (default)' : ''}`,
          text: [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(', ') + (a.postalCode ? ` - ${a.postalCode}` : ''), a.country].filter((l) => l && l.trim()).join('\n'),
        })),
        contacts: c.contacts.map((p) => ({ name: p.name, phone: p.phone })),
      },
    };
  } catch (error) {
    return { error: error instanceof ApiError ? error.messages[0] : 'The customer addresses could not be loaded.' };
  }
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export interface DeliveryItemPayload {
  invoiceItemId: string;
  quantity: number;
  packageCount: string;
  remarks: string;
}

export interface DeliveryHeaderPayload {
  deliveryDate: string;
  expectedDate: string;
  deliveryAddress: string;
  contactPerson: string;
  contactNumber: string;
  internalRemarks: string;
}

function itemsBody(items: DeliveryItemPayload[]) {
  return items.map((i) => {
    id(i.invoiceItemId, 'invoice item');
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new Error('Invalid quantity');
    const packages = i.packageCount.trim();
    if (packages && !/^\d+$/.test(packages)) throw new Error('Invalid package count');
    return {
      invoiceItemId: i.invoiceItemId,
      quantity: i.quantity,
      ...(packages && Number(packages) > 0 ? { packageCount: Number(packages) } : {}),
      ...(i.remarks.trim() ? { remarks: i.remarks.trim() } : {}),
    };
  });
}

function headerBody(h: DeliveryHeaderPayload) {
  if (h.deliveryDate && !DATE.test(h.deliveryDate)) throw new Error('Invalid delivery date');
  if (h.expectedDate && !DATE.test(h.expectedDate)) throw new Error('Invalid expected date');
  return {
    ...(h.deliveryDate ? { deliveryDate: h.deliveryDate } : {}),
    expectedDate: nullable(h.expectedDate),
    deliveryAddress: h.deliveryAddress.trim(),
    contactPerson: nullable(h.contactPerson),
    contactNumber: nullable(h.contactNumber),
    internalRemarks: nullable(h.internalRemarks),
  };
}

export async function createDeliveryAction(input: {
  customerId: string;
  finalInvoiceId: string;
  redeliveryOfId: string | null;
  header: DeliveryHeaderPayload;
  items: DeliveryItemPayload[];
}): Promise<ActionResult> {
  let created: { id: string };
  try {
    if (!input.header.deliveryAddress.trim()) return { error: 'Delivery address is required.' };
    if (input.items.length === 0) return { error: 'Enter a quantity for at least one item.' };
    created = await apiFetch<{ id: string }>('/deliveries', {
      method: 'POST',
      body: {
        customerId: id(input.customerId, 'customer'),
        finalInvoiceId: id(input.finalInvoiceId, 'invoice'),
        ...(input.redeliveryOfId ? { redeliveryOfId: id(input.redeliveryOfId, 'delivery') } : {}),
        ...headerBody(input.header),
        items: itemsBody(input.items),
      },
    });
  } catch (error) {
    return toResult(error, 'The delivery could not be created.');
  }
  refresh(created.id, input.finalInvoiceId, input.customerId);
  if (input.redeliveryOfId) revalidatePath(`/deliveries/${input.redeliveryOfId}`);
  redirect(`/deliveries/${created.id}?created=1`);
}

/** PATCH /deliveries/:id. `items` is sent only when the lines were changed (it replaces them and clears packages). */
export async function updateDeliveryAction(deliveryId: string, header: DeliveryHeaderPayload, items: DeliveryItemPayload[] | null): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  try {
    if (!header.deliveryAddress.trim()) return { error: 'Delivery address is required.' };
    if (items && items.length === 0) return { error: 'Keep a quantity on at least one item.' };
    await apiFetch(`/deliveries/${did}`, { method: 'PATCH', body: { ...headerBody(header), ...(items ? { items: itemsBody(items) } : {}) } });
  } catch (error) {
    return toResult(error, 'The delivery could not be saved.');
  }
  refresh(did);
  redirect(`/deliveries/${did}?saved=1`);
}

export interface PackagePayload {
  packageNumber: number;
  description: string;
  weight: string;
  dimensions: string;
  remarks: string;
  items: Array<{ deliveryItemId: string; quantity: number }>;
}

export async function setDeliveryPackagesAction(deliveryId: string, packages: PackagePayload[]): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  try {
    const body = packages.map((p) => {
      if (!Number.isInteger(p.packageNumber) || p.packageNumber < 1) throw new Error('Invalid package number');
      return {
        packageNumber: p.packageNumber,
        description: nullable(p.description),
        weight: nullable(p.weight),
        dimensions: nullable(p.dimensions),
        remarks: nullable(p.remarks),
        items: p.items.map((l) => {
          if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('Invalid package quantity');
          return { deliveryItemId: id(l.deliveryItemId, 'delivery item'), quantity: l.quantity };
        }),
      };
    });
    await apiFetch(`/deliveries/${did}/packages`, { method: 'PUT', body: { packages: body } });
  } catch (error) {
    return toResult(error, 'The packages could not be saved.');
  }
  refresh(did);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function scheduleDeliveryAction(deliveryId: string, expectedDate: string, remarks: string): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!DATE.test(expectedDate)) return { error: 'Enter the expected delivery date.' };
  try {
    await apiFetch(`/deliveries/${did}/schedule`, { method: 'POST', body: { expectedDate, ...(optional(remarks) ? { remarks: optional(remarks) } : {}) } });
  } catch (error) {
    return toResult(error, 'The delivery could not be scheduled.');
  }
  refresh(did);
  return { ok: true };
}

export async function changeDeliveryStatusAction(deliveryId: string, status: 'READY_FOR_DISPATCH' | 'IN_TRANSIT' | 'RETURNED', remarks: string): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!['READY_FOR_DISPATCH', 'IN_TRANSIT', 'RETURNED'].includes(status)) return { error: 'Invalid status.' };
  if (status === 'RETURNED' && !remarks.trim()) return { error: 'Give the reason the goods were returned.' };
  try {
    await apiFetch(`/deliveries/${did}/status`, { method: 'POST', body: { status, ...(optional(remarks) ? { remarks: optional(remarks) } : {}) } });
  } catch (error) {
    return toResult(error, 'The status could not be changed.');
  }
  refresh(did);
  return { ok: true };
}

export interface DispatchPayload {
  dispatchDate: string;
  dispatchTime: string;
  transportMode: TransportMode;
  transporterName: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
  courierCompany: string;
  trackingNumber: string;
  lrGrNumber: string;
  dispatchRemarks: string;
}

export async function dispatchDeliveryAction(deliveryId: string, p: DispatchPayload): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!DATE.test(p.dispatchDate)) return { error: 'Enter the dispatch date.' };
  if (p.dispatchTime && !TIME.test(p.dispatchTime)) return { error: 'Dispatch time must be HH:MM.' };
  if (!MODES.includes(p.transportMode)) return { error: 'Choose the transport mode.' };
  try {
    await apiFetch(`/deliveries/${did}/dispatch`, {
      method: 'POST',
      body: {
        dispatchDate: p.dispatchDate,
        dispatchTime: nullable(p.dispatchTime),
        transportMode: p.transportMode,
        transporterName: nullable(p.transporterName),
        vehicleNumber: nullable(p.vehicleNumber),
        driverName: nullable(p.driverName),
        driverContact: nullable(p.driverContact),
        courierCompany: nullable(p.courierCompany),
        trackingNumber: nullable(p.trackingNumber),
        lrGrNumber: nullable(p.lrGrNumber),
        dispatchRemarks: nullable(p.dispatchRemarks),
      },
    });
  } catch (error) {
    return toResult(error, 'The delivery could not be dispatched.');
  }
  refresh(did);
  return { ok: true };
}

export async function addTrackingAction(deliveryId: string, p: { status: string; location: string; remarks: string; eventAt: string; markInTransit: boolean }): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!p.status.trim()) return { error: 'Enter the shipment status.' };
  if (p.eventAt && Number.isNaN(Date.parse(p.eventAt))) return { error: 'Invalid event time.' };
  try {
    await apiFetch(`/deliveries/${did}/tracking`, {
      method: 'POST',
      body: {
        status: p.status.trim(),
        location: nullable(p.location),
        remarks: nullable(p.remarks),
        ...(p.eventAt ? { eventAt: new Date(p.eventAt).toISOString() } : {}),
        markInTransit: p.markInTransit,
      },
    });
  } catch (error) {
    return toResult(error, 'The tracking update could not be saved.');
  }
  refresh(did);
  return { ok: true };
}

export async function recordFailureAction(deliveryId: string, p: { failureDate: string; failureReason: string; nextAttemptDate: string; remarks: string }): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!DATE.test(p.failureDate)) return { error: 'Enter the failure date.' };
  if (!p.failureReason.trim()) return { error: 'Failure reason is required.' };
  if (p.nextAttemptDate && !DATE.test(p.nextAttemptDate)) return { error: 'Invalid next attempt date.' };
  try {
    await apiFetch(`/deliveries/${did}/failure`, {
      method: 'POST',
      body: { failureDate: p.failureDate, failureReason: p.failureReason.trim(), nextAttemptDate: nullable(p.nextAttemptDate), remarks: nullable(p.remarks) },
    });
  } catch (error) {
    return toResult(error, 'The delivery failure could not be recorded.');
  }
  refresh(did);
  return { ok: true };
}

export async function confirmDeliveryAction(
  deliveryId: string,
  p: { receiverName: string; receiverContact: string; actualDeliveryDate: string; deliveryConfirmation: boolean; remarks: string; items: Array<{ deliveryItemId: string; deliveredQuantity: number }> },
): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!p.receiverName.trim()) return { error: 'Receiver name is required.' };
  if (!DATE.test(p.actualDeliveryDate)) return { error: 'Enter the date the goods were received.' };
  if (!p.deliveryConfirmation) return { error: 'Tick the confirmation that the customer received the goods.' };
  try {
    const items = p.items.map((i) => {
      if (!Number.isInteger(i.deliveredQuantity) || i.deliveredQuantity < 0) throw new Error('Invalid received quantity');
      return { deliveryItemId: id(i.deliveryItemId, 'delivery item'), deliveredQuantity: i.deliveredQuantity };
    });
    await apiFetch(`/deliveries/${did}/confirm`, {
      method: 'POST',
      body: {
        receiverName: p.receiverName.trim(),
        receiverContact: nullable(p.receiverContact),
        actualDeliveryDate: p.actualDeliveryDate,
        deliveryConfirmation: true,
        remarks: nullable(p.remarks),
        items,
      },
    });
  } catch (error) {
    return toResult(error, 'The delivery could not be confirmed.');
  }
  refresh(did);
  return { ok: true };
}

export async function amendPodAction(deliveryId: string, p: { receiverName: string; receiverContact: string; actualDeliveryDate: string; remarks: string; amendmentReason: string }): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!p.receiverName.trim()) return { error: 'Receiver name is required.' };
  if (!DATE.test(p.actualDeliveryDate)) return { error: 'Enter the date the goods were received.' };
  if (!p.amendmentReason.trim()) return { error: 'Amendment reason is required.' };
  try {
    await apiFetch(`/deliveries/${did}/pod/amend`, {
      method: 'POST',
      body: { receiverName: p.receiverName.trim(), receiverContact: nullable(p.receiverContact), actualDeliveryDate: p.actualDeliveryDate, remarks: nullable(p.remarks), amendmentReason: p.amendmentReason.trim() },
    });
  } catch (error) {
    return toResult(error, 'The proof of delivery could not be amended.');
  }
  refresh(did);
  return { ok: true };
}

export async function cancelDeliveryAction(deliveryId: string, reason: string): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  if (!reason.trim()) return { error: 'Cancellation reason is required.' };
  try {
    await apiFetch(`/deliveries/${did}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
  } catch (error) {
    return toResult(error, 'The delivery could not be cancelled.');
  }
  refresh(did);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Proof of delivery documents
// ---------------------------------------------------------------------------

export async function uploadDeliveryDocumentAction(deliveryId: string, formData: FormData): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a file to upload.' };
  const kind = String(formData.get('kind') ?? '');
  const body = new FormData();
  body.set('file', file);
  if (UPLOAD_KINDS.includes(kind as DeliveryUploadKind)) body.set('kind', kind);
  try {
    await apiFetch(`/deliveries/${did}/documents`, { method: 'POST', formData: body });
  } catch (error) {
    return toResult(error, 'The document could not be uploaded.');
  }
  refresh(did);
  return { ok: true };
}

export async function removeDeliveryDocumentAction(deliveryId: string, documentId: string): Promise<ActionResult> {
  const did = id(deliveryId, 'delivery');
  try {
    await apiFetch(`/deliveries/${did}/documents/${id(documentId, 'document')}`, { method: 'DELETE' });
  } catch (error) {
    return toResult(error, 'The document could not be removed.');
  }
  refresh(did);
  return { ok: true };
}
