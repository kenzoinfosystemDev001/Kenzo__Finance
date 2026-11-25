import { DeliveryStatus, TransportMode } from '@prisma/client';

/**
 * Delivery lifecycle (validated on the server; every change is recorded).
 *
 *   DRAFT ─▶ SCHEDULED ─▶ READY_FOR_DISPATCH ─▶ DISPATCHED ─▶ IN_TRANSIT
 *   DISPATCHED / IN_TRANSIT ─▶ DELIVERED | PARTIALLY_DELIVERED   (confirm with proof of delivery only)
 *   DISPATCHED / IN_TRANSIT ─▶ DELIVERY_FAILED ─▶ SCHEDULED (reattempt) | RETURNED
 *   any not-yet-dispatched state ─▶ CANCELLED
 *
 * - A delivery's DELIVERED / PARTIALLY_DELIVERED is about THIS delivery: was
 *   everything dispatched on it received? Whether the INVOICE is fully
 *   delivered is derived separately from all its deliveries.
 * - Quantities on DRAFT..DELIVERED deliveries are reserved against the
 *   invoice (no double allocation). CANCELLED and RETURNED deliveries release
 *   them, so the goods can be delivered again (a redelivery links back).
 * - Once dispatched, a delivery can no longer be cancelled: it is either
 *   delivered, failed or returned (goods physically left).
 */
export const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  DRAFT: [DeliveryStatus.SCHEDULED, DeliveryStatus.CANCELLED],
  SCHEDULED: [DeliveryStatus.READY_FOR_DISPATCH, DeliveryStatus.DISPATCHED, DeliveryStatus.CANCELLED],
  READY_FOR_DISPATCH: [DeliveryStatus.DISPATCHED, DeliveryStatus.SCHEDULED, DeliveryStatus.CANCELLED],
  DISPATCHED: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_DELIVERED, DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.RETURNED],
  IN_TRANSIT: [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_DELIVERED, DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.RETURNED],
  PARTIALLY_DELIVERED: [],
  DELIVERED: [],
  DELIVERY_FAILED: [DeliveryStatus.SCHEDULED, DeliveryStatus.RETURNED],
  RETURNED: [],
  CANCELLED: [],
};

/** Statuses whose quantities do NOT count against the invoice. */
export const RELEASED: DeliveryStatus[] = [DeliveryStatus.CANCELLED, DeliveryStatus.RETURNED];
/** Goods have left the premises. */
export const DISPATCHED_STATES: DeliveryStatus[] = [DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.PARTIALLY_DELIVERED, DeliveryStatus.DELIVERED, DeliveryStatus.DELIVERY_FAILED];
/** Confirmed received by the customer (with proof of delivery). */
export const CONFIRMED_STATES: DeliveryStatus[] = [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_DELIVERED];
/** Still expected to arrive (used for "delayed"). */
export const OPEN_STATES: DeliveryStatus[] = [DeliveryStatus.SCHEDULED, DeliveryStatus.READY_FOR_DISPATCH, DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.DELIVERY_FAILED];
/** Header and items are editable only here. */
export const EDITABLE: DeliveryStatus[] = [DeliveryStatus.DRAFT, DeliveryStatus.SCHEDULED, DeliveryStatus.READY_FOR_DISPATCH];

export const label = (s: DeliveryStatus) => s.toLowerCase().replace(/_/g, ' ');

/** Which dispatch fields each transport mode needs (nothing irrelevant is required). */
export function dispatchProblems(mode: TransportMode, d: { transporterName?: string | null; vehicleNumber?: string | null; courierCompany?: string | null; trackingNumber?: string | null }): string[] {
  switch (mode) {
    case TransportMode.COURIER:
      return d.courierCompany ? [] : ['Courier company is required for courier dispatch.'];
    case TransportMode.TRANSPORT:
      return d.transporterName ? [] : ['Transporter name is required for dispatch through a transporter.'];
    case TransportMode.OWN_VEHICLE:
      return d.vehicleNumber ? [] : ['Vehicle number is required for dispatch in an own vehicle.'];
    default:
      return [];
  }
}

/** Invoice-level delivery position derived from confirmed quantities. */
export function invoiceDeliveryState(invoiced: number, delivered: number): 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' {
  if (delivered <= 0) return 'NOT_DELIVERED';
  return delivered >= invoiced ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
}
