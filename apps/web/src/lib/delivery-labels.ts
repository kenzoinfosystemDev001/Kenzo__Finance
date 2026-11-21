import type { EnquiryTone } from './enquiry-labels';
import type { DeliveryListItem, DeliveryStatus, DeliveryUploadKind, InvoiceDeliveryState, TransportMode } from './types';

/**
 * Labels and lifecycle rules for Delivery Management. TRANSITIONS / EDITABLE
 * mirror apps/api/src/deliveries/delivery-rules.ts; the API re-checks every step.
 */

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery Failed',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
};

export const DELIVERY_STATUSES = Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[];

export const DELIVERY_STATUS_TONES: Record<DeliveryStatus, EnquiryTone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'sky',
  READY_FOR_DISPATCH: 'violet',
  DISPATCHED: 'accent',
  IN_TRANSIT: 'teal',
  PARTIALLY_DELIVERED: 'warning',
  DELIVERED: 'success',
  DELIVERY_FAILED: 'danger',
  RETURNED: 'danger',
  CANCELLED: 'neutral',
};

export const INVOICE_DELIVERY_STATE_LABELS: Record<InvoiceDeliveryState, string> = {
  NOT_DELIVERED: 'Not Delivered',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  DELIVERED: 'Fully Delivered',
};

export const INVOICE_DELIVERY_STATE_TONES: Record<InvoiceDeliveryState, EnquiryTone> = {
  NOT_DELIVERED: 'neutral',
  PARTIALLY_DELIVERED: 'warning',
  DELIVERED: 'success',
};

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  DIRECT: 'Direct (customer pickup / hand delivery)',
  OWN_VEHICLE: 'Own vehicle',
  TRANSPORT: 'Transporter',
  COURIER: 'Courier',
};

export const TRANSPORT_MODES = Object.keys(TRANSPORT_MODE_LABELS) as TransportMode[];

export const DELIVERY_UPLOAD_KINDS: Array<{ value: DeliveryUploadKind; label: string }> = [
  { value: 'DELIVERY_POD', label: 'Proof of delivery' },
  { value: 'DELIVERY_SIGNATURE', label: 'Receiver signature' },
  { value: 'DELIVERY_PHOTO', label: 'Delivery photo' },
  { value: 'DELIVERY_ATTACHMENT', label: 'Supporting document' },
];

export const DELIVERY_DOCUMENT_KIND_LABELS: Record<string, string> = {
  DELIVERY_CHALLAN: 'Delivery challan',
  PACKING_LIST: 'Packing list',
  ...Object.fromEntries(DELIVERY_UPLOAD_KINDS.map((k) => [k.value, k.label])),
};

export const isUploadKind = (kind: string): kind is DeliveryUploadKind => DELIVERY_UPLOAD_KINDS.some((k) => k.value === kind);

export const DELIVERY_SORT_FIELDS = [
  { value: 'createdAt', label: 'Created' },
  { value: 'deliveryNumber', label: 'Delivery no.' },
  { value: 'deliveryDate', label: 'Delivery date' },
  { value: 'expectedDate', label: 'Expected date' },
  { value: 'dispatchDate', label: 'Dispatch date' },
  { value: 'actualDeliveryDate', label: 'Delivered on' },
  { value: 'status', label: 'Status' },
] as const;

export const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['READY_FOR_DISPATCH', 'DISPATCHED', 'CANCELLED'],
  READY_FOR_DISPATCH: ['DISPATCHED', 'SCHEDULED', 'CANCELLED'],
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERY_FAILED', 'RETURNED'],
  IN_TRANSIT: ['DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERY_FAILED', 'RETURNED'],
  PARTIALLY_DELIVERED: [],
  DELIVERED: [],
  DELIVERY_FAILED: ['SCHEDULED', 'RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

/** Header and items are editable only here (and only before dispatch documents exist). */
export const EDITABLE: DeliveryStatus[] = ['DRAFT', 'SCHEDULED', 'READY_FOR_DISPATCH'];
/** Goods have left the premises. */
export const DISPATCHED_STATES: DeliveryStatus[] = ['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'DELIVERY_FAILED'];
/** Confirmed with proof of delivery. */
export const CONFIRMED_STATES: DeliveryStatus[] = ['DELIVERED', 'PARTIALLY_DELIVERED'];
/** On the way: tracking, failure and confirmation are possible. */
export const ON_THE_WAY: DeliveryStatus[] = ['DISPATCHED', 'IN_TRANSIT'];

export type DeliveryActionKey =
  | 'edit'
  | 'packages'
  | 'schedule'
  | 'ready'
  | 'dispatch'
  | 'inTransit'
  | 'tracking'
  | 'failure'
  | 'confirm'
  | 'returned'
  | 'amendPod'
  | 'cancel'
  | 'redeliver';

/** The actions valid for a delivery in its current status that the user has permission for. */
export function deliveryActions(
  d: { status: DeliveryStatus; canEditItems: boolean; hasProof: boolean; hasDispatchDocuments: boolean },
  permissions: string[],
): Set<DeliveryActionKey> {
  const can = (p: string) => permissions.includes(p);
  const next = TRANSITIONS[d.status];
  const out = new Set<DeliveryActionKey>();
  const editable = EDITABLE.includes(d.status) && !d.hasDispatchDocuments;
  if (editable && can('delivery.update')) {
    out.add('edit');
    out.add('packages');
  }
  if (next.includes('SCHEDULED') && can('delivery.schedule')) out.add('schedule');
  if (next.includes('READY_FOR_DISPATCH') && can('delivery.schedule')) out.add('ready');
  if (next.includes('DISPATCHED') && can('delivery.dispatch')) out.add('dispatch');
  if (next.includes('IN_TRANSIT') && can('delivery.track')) out.add('inTransit');
  if (ON_THE_WAY.includes(d.status) && can('delivery.track')) {
    out.add('tracking');
    out.add('failure');
  }
  if (ON_THE_WAY.includes(d.status) && can('delivery.confirm')) out.add('confirm');
  if (next.includes('RETURNED') && can('delivery.track')) out.add('returned');
  if (d.hasProof && can('delivery.confirm')) out.add('amendPod');
  if (next.includes('CANCELLED') && !DISPATCHED_STATES.includes(d.status) && can('delivery.cancel')) out.add('cancel');
  // Only a RETURNED delivery can be redelivered; a failed one is rescheduled instead.
  if (d.status === 'RETURNED' && can('delivery.create')) out.add('redeliver');
  return out;
}

/** The transporter / courier as shown in lists. */
export function carrierOf(d: Pick<DeliveryListItem, 'courierCompany' | 'transporterName'>): string | null {
  return d.courierCompany ?? d.transporterName ?? null;
}

/**
 * Received quantity of a list row. Only a confirmed delivery has one; a
 * dispatched delivery is never shown as delivered.
 */
export function deliveredQuantityOf(d: Pick<DeliveryListItem, 'status' | 'items'>): number | null {
  if (!CONFIRMED_STATES.includes(d.status)) return null;
  return d.items.reduce((s, i) => s + (i.deliveredQuantity ?? 0), 0);
}

/** The unit shared by every line, or null when the lines use different units. */
export function commonUnit(items: Array<{ unit: string }>): string | null {
  const units = new Set(items.map((i) => i.unit));
  return units.size === 1 ? [...units][0] : null;
}
