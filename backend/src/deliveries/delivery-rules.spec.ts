import { DeliveryStatus, TransportMode } from '@prisma/client';
import { CONFIRMED_STATES, DISPATCHED_STATES, EDITABLE, RELEASED, TRANSITIONS, dispatchProblems, invoiceDeliveryState, reservedQuantity } from './delivery-rules';

describe('delivery rules', () => {
  it('final states have no outgoing transitions', () => {
    for (const s of [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIALLY_DELIVERED, DeliveryStatus.CANCELLED, DeliveryStatus.RETURNED]) expect(TRANSITIONS[s]).toEqual([]);
  });

  it('cannot be cancelled once dispatched', () => {
    for (const s of DISPATCHED_STATES) expect(TRANSITIONS[s]).not.toContain(DeliveryStatus.CANCELLED);
  });

  it('cannot be confirmed delivered before dispatch', () => {
    for (const s of [DeliveryStatus.DRAFT, DeliveryStatus.SCHEDULED, DeliveryStatus.READY_FOR_DISPATCH]) {
      expect(TRANSITIONS[s]).not.toContain(DeliveryStatus.DELIVERED);
      expect(TRANSITIONS[s]).not.toContain(DeliveryStatus.PARTIALLY_DELIVERED);
    }
  });

  it('a failed delivery can be rescheduled or returned, nothing else', () => {
    expect([...TRANSITIONS[DeliveryStatus.DELIVERY_FAILED]].sort()).toEqual([DeliveryStatus.RETURNED, DeliveryStatus.SCHEDULED].sort());
  });

  it('only cancelled and returned deliveries release reserved quantity', () => {
    expect(RELEASED.sort()).toEqual([DeliveryStatus.CANCELLED, DeliveryStatus.RETURNED].sort());
    expect(CONFIRMED_STATES.some((s) => RELEASED.includes(s))).toBe(false);
  });

  it('only pre-dispatch deliveries are editable', () => {
    expect(EDITABLE.some((s) => DISPATCHED_STATES.includes(s))).toBe(false);
  });

  it('dispatch needs the identifying field of the transport mode', () => {
    expect(dispatchProblems(TransportMode.COURIER, {})).toHaveLength(1);
    expect(dispatchProblems(TransportMode.COURIER, { courierCompany: 'X' })).toEqual([]);
    expect(dispatchProblems(TransportMode.TRANSPORT, { vehicleNumber: 'X' })).toHaveLength(1);
    expect(dispatchProblems(TransportMode.TRANSPORT, { transporterName: 'X' })).toEqual([]);
    expect(dispatchProblems(TransportMode.OWN_VEHICLE, {})).toHaveLength(1);
    expect(dispatchProblems(TransportMode.OWN_VEHICLE, { vehicleNumber: 'MH01' })).toEqual([]);
  });

  it('derives the invoice delivery position from confirmed quantities', () => {
    expect(invoiceDeliveryState(10, 0)).toBe('NOT_DELIVERED');
    expect(invoiceDeliveryState(10, 4)).toBe('PARTIALLY_DELIVERED');
    expect(invoiceDeliveryState(10, 10)).toBe('DELIVERED');
  });

  describe('reservedQuantity', () => {
    it('reserves the full quantity while a delivery is open or fully delivered', () => {
      expect(reservedQuantity(DeliveryStatus.DRAFT, 5, null)).toBe(5);
      expect(reservedQuantity(DeliveryStatus.DISPATCHED, 5, null)).toBe(5);
      expect(reservedQuantity(DeliveryStatus.DELIVERED, 5, 5)).toBe(5);
    });

    it('releases everything for cancelled and returned deliveries', () => {
      expect(reservedQuantity(DeliveryStatus.CANCELLED, 5, null)).toBe(0);
      expect(reservedQuantity(DeliveryStatus.RETURNED, 5, 3)).toBe(0);
    });

    it('releases the shortfall of a partial delivery so it can be dispatched again', () => {
      expect(reservedQuantity(DeliveryStatus.PARTIALLY_DELIVERED, 10, 6)).toBe(6);
      expect(reservedQuantity(DeliveryStatus.PARTIALLY_DELIVERED, 10, null)).toBe(0);
      expect(reservedQuantity(DeliveryStatus.PARTIALLY_DELIVERED, 10, 12)).toBe(10);
    });
  });
});
