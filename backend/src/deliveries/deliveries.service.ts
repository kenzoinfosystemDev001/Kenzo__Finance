import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, DeliveryTrackingSource, FinalInvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { buildPaginatedResult, type PaginationQueryDto } from '../common/dto/pagination.dto';
import { normalizeName } from '../common/utils/normalize';
import { businessToday } from '../common/utils/business-date';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  AmendPodDto,
  CancelDeliveryDto,
  ConfirmDeliveryDto,
  CreateDeliveryDto,
  DeliveryItemDto,
  DeliveryReportQueryDto,
  DeliveryStatusDto,
  DispatchDeliveryDto,
  FailureDto,
  PackagesDto,
  QueryDeliveriesDto,
  ScheduleDeliveryDto,
  TrackingDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto';
import { CONFIRMED_STATES, dispatchProblems, DISPATCHED_STATES, EDITABLE, invoiceDeliveryState, label, OPEN_STATES, RELEASED, reservedQuantity, TRANSITIONS } from './delivery-rules';
import { DeliveryPdfService } from './delivery-pdf.service';

export const DELIVERY_ENTITY = 'Delivery';
type Tx = Prisma.TransactionClient;
const userSelect = { select: { id: true, fullName: true } } as const;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const DELIVERABLE: FinalInvoiceStatus[] = [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT];

/**
 * Module 9 - Delivery Management. Deliveries of final-invoice items to the
 * customer. Independent of payment: nothing here touches invoice amounts or
 * payment records, and no payment state is required to deliver.
 *
 * Over-delivery is impossible: every allocation check (create, edit) runs in
 * the same transaction that holds a FOR UPDATE lock on the invoice row, so two
 * users cannot both take the last remaining quantity.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numbering: NumberingService,
    private readonly pdf: DeliveryPdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`You do not have permission to ${action}.`);
  }

  private audit(tx: Tx, actor: AuthenticatedUser, context: RequestContext | null, delivery: { id: string; finalInvoiceId: string }, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.auditService.record(
      { actorUserId: actor.id, action, entityType: DELIVERY_ENTITY, entityId: delivery.id, parentEntityType: 'FinalInvoice', parentEntityId: delivery.finalInvoiceId, summary, ...extra, ipAddress: context?.ipAddress ?? null, userAgent: context?.userAgent ?? null },
      tx,
    );
  }

  private async lockInvoice(tx: Tx, invoiceId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM final_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException(`Final invoice ${invoiceId} was not found`);
  }

  /** Locks a delivery and returns it (with its invoice id for ordering locks). */
  private async lockDelivery(tx: Tx, id: string) {
    const head = await tx.delivery.findUnique({ where: { id }, select: { finalInvoiceId: true } });
    if (!head) throw new NotFoundException(`Delivery ${id} was not found`);
    // Lock order everywhere: invoice, then delivery.
    await this.lockInvoice(tx, head.finalInvoiceId);
    await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.delivery.findUniqueOrThrow({ where: { id }, include: { items: true } });
  }

  /** Per invoice item: invoiced, reserved by other deliveries (not released), and what is left. */
  private async positions(tx: Tx | PrismaService, invoiceId: string, excludeDeliveryId?: string) {
    const [items, lines] = await Promise.all([
      tx.finalInvoiceItem.findMany({ where: { finalInvoiceId: invoiceId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      tx.deliveryItem.findMany({
        where: { delivery: { finalInvoiceId: invoiceId, status: { notIn: RELEASED }, ...(excludeDeliveryId ? { id: { not: excludeDeliveryId } } : {}) } },
        select: { invoiceItemId: true, quantity: true, deliveredQuantity: true, delivery: { select: { status: true } } },
      }),
    ]);
    const reserved = new Map<string, number>();
    for (const line of lines) {
      const held = reservedQuantity(line.delivery.status, line.quantity, line.deliveredQuantity);
      reserved.set(line.invoiceItemId, (reserved.get(line.invoiceItemId) ?? 0) + held);
    }
    return items.map((i) => ({ item: i, reserved: reserved.get(i.id) ?? 0, remaining: i.quantity - (reserved.get(i.id) ?? 0) }));
  }

  /** Validates requested lines against the remaining quantities and snapshots the catalogue details. */
  private prepareItems(requests: DeliveryItemDto[], positions: Awaited<ReturnType<DeliveriesService['positions']>>) {
    const ids = requests.map((r) => r.invoiceItemId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each invoice item may appear only once in a delivery.');
    return requests.map((r) => {
      const pos = positions.find((p) => p.item.id === r.invoiceItemId);
      if (!pos) throw new BadRequestException('An item does not belong to the selected invoice.');
      if (r.quantity > pos.remaining) {
        throw new BadRequestException(`${pos.item.productName}${pos.item.modelName ? ` (${pos.item.modelName})` : ''}: ${r.quantity} ${pos.item.unit} exceeds the remaining deliverable quantity of ${Math.max(pos.remaining, 0)} ${pos.item.unit}.`);
      }
      const i = pos.item;
      return {
        invoiceItemId: i.id,
        productId: i.productId,
        productModelId: i.productModelId,
        productName: i.productName,
        productCode: i.productCode,
        brandName: i.brandName,
        modelName: i.modelName,
        modelNumber: i.modelNumber,
        description: i.description,
        quantity: r.quantity,
        unit: i.unit,
        packageCount: r.packageCount ?? null,
        remarks: r.remarks ?? null,
      };
    });
  }

  private async history(tx: Tx, deliveryId: string, from: DeliveryStatus | null, to: DeliveryStatus, actor: AuthenticatedUser, remarks?: string | null) {
    await tx.deliveryStatusHistory.create({ data: { deliveryId, previousStatus: from, newStatus: to, remarks: remarks ?? null, changedById: actor.id } });
  }

  private assertTransition(from: DeliveryStatus, to: DeliveryStatus) {
    if (!TRANSITIONS[from].includes(to)) throw new BadRequestException(`A ${label(from)} delivery cannot be moved to ${label(to)}.`);
  }

  // -------------------------------------------------------------------------
  // Invoices that can be delivered
  // -------------------------------------------------------------------------

  async eligibleInvoices(customerId: string) {
    const invoices = await this.prisma.finalInvoice.findMany({
      where: { customerId, status: { in: DELIVERABLE } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, currency: true, grandTotal: true, customerSnapshot: true },
      orderBy: { invoiceDate: 'desc' },
    });
    const result = [];
    for (const inv of invoices) {
      const positions = await this.positions(this.prisma, inv.id);
      const invoiced = positions.reduce((s, p) => s + p.item.quantity, 0);
      const reserved = positions.reduce((s, p) => s + p.reserved, 0);
      const delivered = await this.confirmedQuantity(inv.id);
      if (invoiced - reserved <= 0) continue;
      result.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        currency: inv.currency,
        grandTotal: inv.grandTotal,
        customerSnapshot: inv.customerSnapshot,
        invoicedQuantity: invoiced,
        allocatedQuantity: reserved,
        deliveredQuantity: delivered,
        remainingQuantity: invoiced - reserved,
        deliveryState: invoiceDeliveryState(invoiced, delivered),
      });
    }
    return result;
  }

  /** Remaining deliverable quantities of one invoice, for the item picker. */
  async invoiceItems(finalInvoiceId: string, customerId?: string) {
    const invoice = await this.prisma.finalInvoice.findUnique({ where: { id: finalInvoiceId }, select: { id: true, customerId: true, status: true, invoiceNumber: true } });
    if (!invoice) throw new NotFoundException(`Final invoice ${finalInvoiceId} was not found`);
    if (customerId && invoice.customerId !== customerId) throw new BadRequestException('The invoice does not belong to the selected customer.');
    const positions = await this.positions(this.prisma, finalInvoiceId);
    const delivered = await this.prisma.deliveryItem.groupBy({
      by: ['invoiceItemId'],
      where: { delivery: { finalInvoiceId, status: { in: CONFIRMED_STATES } } },
      _sum: { deliveredQuantity: true, quantity: true },
    });
    return positions.map(({ item, reserved, remaining }) => {
      const d = delivered.find((x) => x.invoiceItemId === item.id);
      return {
        invoiceItemId: item.id,
        productId: item.productId,
        productModelId: item.productModelId,
        productName: item.productName,
        productCode: item.productCode,
        brandName: item.brandName,
        modelName: item.modelName,
        modelNumber: item.modelNumber,
        description: item.description,
        unit: item.unit,
        invoicedQuantity: item.quantity,
        allocatedQuantity: reserved,
        confirmedDeliveredQuantity: d?._sum.deliveredQuantity ?? 0,
        remainingQuantity: Math.max(remaining, 0),
      };
    });
  }

  private async confirmedQuantity(invoiceId: string) {
    const agg = await this.prisma.deliveryItem.aggregate({ where: { delivery: { finalInvoiceId: invoiceId, status: { in: CONFIRMED_STATES } } }, _sum: { deliveredQuantity: true } });
    return agg._sum.deliveredQuantity ?? 0;
  }

  // -------------------------------------------------------------------------
  // Create / edit
  // -------------------------------------------------------------------------

  async create(dto: CreateDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_CREATE, 'create deliveries');
    const deliveryDate = dto.deliveryDate ? dateOnly(dto.deliveryDate) : businessToday();
    const expectedDate = dto.expectedDate ? dateOnly(dto.expectedDate) : null;
    if (expectedDate && expectedDate < deliveryDate) throw new BadRequestException('The expected delivery date cannot be before the delivery date.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, dto.finalInvoiceId);
      const invoice = await tx.finalInvoice.findUniqueOrThrow({ where: { id: dto.finalInvoiceId }, select: { id: true, customerId: true, status: true, invoiceNumber: true } });
      if (invoice.customerId !== dto.customerId) throw new BadRequestException('The invoice does not belong to the selected customer.');
      if (!DELIVERABLE.includes(invoice.status)) throw new BadRequestException(`Only issued invoices can be delivered (this one is ${invoice.status.toLowerCase()}).`);
      if (dto.redeliveryOfId) {
        const original = await tx.delivery.findUnique({ where: { id: dto.redeliveryOfId }, select: { finalInvoiceId: true, status: true, deliveryNumber: true } });
        if (!original || original.finalInvoiceId !== invoice.id) throw new BadRequestException('A redelivery must refer to a delivery of the same invoice.');
        if (original.status !== DeliveryStatus.RETURNED) throw new BadRequestException(`Delivery ${original.deliveryNumber} is ${label(original.status)}; only a returned delivery can be redelivered (reschedule a failed one instead).`);
      }
      const items = this.prepareItems(dto.items, await this.positions(tx, invoice.id));
      const deliveryNumber = await this.numbering.allocate('DELIVERY', tx);
      const delivery = await tx.delivery.create({
        data: {
          deliveryNumber,
          customerId: invoice.customerId,
          finalInvoiceId: invoice.id,
          redeliveryOfId: dto.redeliveryOfId ?? null,
          status: DeliveryStatus.DRAFT,
          deliveryDate,
          expectedDate,
          deliveryAddress: dto.deliveryAddress,
          contactPerson: dto.contactPerson ?? null,
          contactNumber: dto.contactNumber ?? null,
          internalRemarks: dto.internalRemarks ?? null,
          createdById: actor.id,
          updatedById: actor.id,
          items: { create: items },
        },
        select: { id: true, deliveryNumber: true, finalInvoiceId: true },
      });
      await this.history(tx, delivery.id, null, DeliveryStatus.DRAFT, actor, dto.redeliveryOfId ? 'Redelivery of a returned delivery' : null);
      await this.audit(tx, actor, context, delivery, 'delivery.create', `Created delivery ${deliveryNumber} for invoice ${invoice.invoiceNumber}: ${items.map((i) => `${i.quantity} ${i.unit} ${i.productName}`).join(', ')}`, { after: { items: items.map((i) => ({ invoiceItemId: i.invoiceItemId, quantity: i.quantity })) } });
      return delivery;
    });
  }

  async update(id: string, dto: UpdateDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_UPDATE, 'edit deliveries');
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockDelivery(tx, id);
      if (!EDITABLE.includes(current.status)) throw new BadRequestException(`A ${label(current.status)} delivery cannot be edited.`);
      if (current.packingDocumentId || current.challanDocumentId) throw new BadRequestException('This delivery already has issued documents and cannot be edited.');
      const data: Prisma.DeliveryUncheckedUpdateInput = { updatedById: actor.id };
      if (dto.deliveryDate) data.deliveryDate = dateOnly(dto.deliveryDate);
      if (dto.expectedDate !== undefined) data.expectedDate = dto.expectedDate ? dateOnly(dto.expectedDate) : null;
      if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress;
      if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
      if (dto.contactNumber !== undefined) data.contactNumber = dto.contactNumber;
      if (dto.internalRemarks !== undefined) data.internalRemarks = dto.internalRemarks;
      const delivered = (data.deliveryDate as Date | undefined) ?? current.deliveryDate;
      const expected = data.expectedDate !== undefined ? (data.expectedDate as Date | null) : current.expectedDate;
      if (expected && expected < delivered) throw new BadRequestException('The expected delivery date cannot be before the delivery date.');
      if (dto.items) {
        const items = this.prepareItems(dto.items, await this.positions(tx, current.finalInvoiceId, id));
        await tx.packingList.deleteMany({ where: { deliveryId: id } }); // packages refer to the old lines
        await tx.deliveryItem.deleteMany({ where: { deliveryId: id } });
        data.items = { create: items };
      }
      const updated = await tx.delivery.update({ where: { id }, data, select: { id: true, deliveryNumber: true, finalInvoiceId: true } });
      await this.audit(tx, actor, context, current, 'delivery.update', `Edited delivery ${current.deliveryNumber}`, {
        before: { deliveryDate: current.deliveryDate, expectedDate: current.expectedDate, items: current.items.map((i) => ({ invoiceItemId: i.invoiceItemId, quantity: i.quantity })) },
        after: { ...dto },
      });
      return updated;
    });
  }

  /** Replaces the packages of a not-yet-dispatched delivery. Weight / dimensions only as entered. */
  async setPackages(id: string, dto: PackagesDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_UPDATE, 'edit deliveries');
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockDelivery(tx, id);
      if (!EDITABLE.includes(current.status)) throw new BadRequestException('Packages can only be changed before dispatch.');
      const numbers = dto.packages.map((p) => p.packageNumber);
      if (new Set(numbers).size !== numbers.length) throw new BadRequestException('Package numbers must be unique.');
      const packed = new Map<string, number>();
      for (const pkg of dto.packages) {
        for (const line of pkg.items) {
          if (!current.items.some((i) => i.id === line.deliveryItemId)) throw new BadRequestException('A package contains an item that is not on this delivery.');
          packed.set(line.deliveryItemId, (packed.get(line.deliveryItemId) ?? 0) + line.quantity);
        }
      }
      for (const item of current.items) {
        if ((packed.get(item.id) ?? 0) > item.quantity) throw new BadRequestException(`${item.productName}: packed quantity exceeds the ${item.quantity} ${item.unit} on this delivery.`);
      }
      await tx.packingList.deleteMany({ where: { deliveryId: id } });
      for (const pkg of dto.packages) {
        const packingNumber = await this.numbering.allocate('PACKING_LIST', tx);
        await tx.packingList.create({
          data: {
            deliveryId: id,
            packingNumber,
            packageNumber: pkg.packageNumber,
            description: pkg.description ?? null,
            weight: pkg.weight ?? null,
            dimensions: pkg.dimensions ?? null,
            remarks: pkg.remarks ?? null,
            items: { create: pkg.items.map((l) => ({ deliveryItemId: l.deliveryItemId, quantity: l.quantity })) },
          },
        });
      }
      await this.audit(tx, actor, context, current, 'delivery.packages', `Set ${dto.packages.length} package(s) on ${current.deliveryNumber}`);
      return { id, packages: dto.packages.length };
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async schedule(id: string, dto: ScheduleDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_SCHEDULE, 'schedule deliveries');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      this.assertTransition(d.status, DeliveryStatus.SCHEDULED);
      const expectedDate = dateOnly(dto.expectedDate);
      if (expectedDate < d.deliveryDate) throw new BadRequestException('The expected delivery date cannot be before the delivery date.');
      // Rescheduling after a failure clears the failure's next-attempt marker but keeps its history.
      const updated = await tx.delivery.update({ where: { id }, data: { status: DeliveryStatus.SCHEDULED, expectedDate, updatedById: actor.id }, select: { id: true, status: true, expectedDate: true } });
      await this.history(tx, id, d.status, DeliveryStatus.SCHEDULED, actor, dto.remarks ?? `Expected ${dto.expectedDate.slice(0, 10)}`);
      await this.audit(tx, actor, context, d, d.status === DeliveryStatus.DELIVERY_FAILED ? 'delivery.reschedule' : 'delivery.schedule', `${d.deliveryNumber}: ${label(d.status)} → scheduled for ${dto.expectedDate.slice(0, 10)}`);
      return updated;
    });
  }

  /** Simple steps: ready for dispatch, in transit, returned. */
  async changeStatus(id: string, dto: DeliveryStatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const permission = dto.status === DeliveryStatus.READY_FOR_DISPATCH ? PERMISSIONS.DELIVERY_SCHEDULE : PERMISSIONS.DELIVERY_TRACK;
    this.require(actor, permission, `mark deliveries ${label(dto.status)}`);
    if (dto.status === DeliveryStatus.RETURNED && !dto.remarks) throw new BadRequestException('Give the reason the goods were returned.');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      this.assertTransition(d.status, dto.status);
      await tx.delivery.update({ where: { id }, data: { status: dto.status, updatedById: actor.id, ...(dto.status === DeliveryStatus.RETURNED ? { returnReason: dto.remarks } : {}) } });
      await this.history(tx, id, d.status, dto.status, actor, dto.remarks);
      if (dto.status !== DeliveryStatus.READY_FOR_DISPATCH) {
        await tx.shipmentTrackingEvent.create({ data: { deliveryId: id, status: label(dto.status), remarks: dto.remarks ?? null, source: DeliveryTrackingSource.MANUAL, recordedById: actor.id } });
      }
      await this.audit(tx, actor, context, d, `delivery.${dto.status.toLowerCase()}`, `${d.deliveryNumber}: ${label(d.status)} → ${label(dto.status)}${dto.remarks ? ` (${dto.remarks})` : ''}`);
      return { id, status: dto.status };
    });
  }

  async dispatch(id: string, dto: DispatchDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_DISPATCH, 'dispatch deliveries');
    const problems = dispatchProblems(dto.transportMode, dto);
    if (problems.length) throw new BadRequestException({ message: problems[0], details: { problems } });
    const dispatchDate = dateOnly(dto.dispatchDate);
    if (dispatchDate > businessToday()) throw new BadRequestException('The dispatch date cannot be in the future.');
    const result = await this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      this.assertTransition(d.status, DeliveryStatus.DISPATCHED);
      const invoice = await tx.finalInvoice.findUniqueOrThrow({ where: { id: d.finalInvoiceId }, select: { status: true, invoiceNumber: true } });
      if (!DELIVERABLE.includes(invoice.status)) throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is ${invoice.status.toLowerCase()}; it can no longer be delivered.`);
      await tx.delivery.update({
        where: { id },
        data: {
          status: DeliveryStatus.DISPATCHED,
          dispatchDate,
          dispatchedAt: new Date(),
          dispatchTime: dto.dispatchTime ?? null,
          transportMode: dto.transportMode,
          transporterName: dto.transporterName ?? null,
          vehicleNumber: dto.vehicleNumber ?? null,
          driverName: dto.driverName ?? null,
          driverContact: dto.driverContact ?? null,
          courierCompany: dto.courierCompany ?? null,
          trackingNumber: dto.trackingNumber ?? null,
          lrGrNumber: dto.lrGrNumber ?? null,
          dispatchRemarks: dto.dispatchRemarks ?? null,
          updatedById: actor.id,
        },
      });
      await this.history(tx, id, d.status, DeliveryStatus.DISPATCHED, actor, dto.dispatchRemarks);
      await tx.shipmentTrackingEvent.create({ data: { deliveryId: id, status: 'dispatched', remarks: dto.dispatchRemarks ?? null, source: DeliveryTrackingSource.MANUAL, eventAt: new Date(), recordedById: actor.id } });
      await this.audit(tx, actor, context, d, 'delivery.dispatch', `Dispatched ${d.deliveryNumber} by ${dto.transportMode.toLowerCase().replace('_', ' ')}${dto.courierCompany ? ` (${dto.courierCompany}${dto.trackingNumber ? ` ${dto.trackingNumber}` : ''})` : dto.transporterName ? ` (${dto.transporterName})` : ''}`, { after: { ...dto } });
      return { id, status: DeliveryStatus.DISPATCHED };
    });
    // The dispatch documents are rendered once now and kept as the historical record.
    await this.pdf.storeDispatchDocuments(id, actor);
    return result;
  }

  /** Manual tracking update. External updates would come through a TrackingProvider and be marked EXTERNAL. */
  async track(id: string, dto: TrackingDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_TRACK, 'update shipment tracking');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      if (!([DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT] as DeliveryStatus[]).includes(d.status)) throw new BadRequestException(`Tracking can be updated only while a delivery is on its way (this one is ${label(d.status)}).`);
      const eventAt = dto.eventAt ? new Date(dto.eventAt) : new Date();
      if (eventAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('A tracking update cannot be in the future.');
      await tx.shipmentTrackingEvent.create({ data: { deliveryId: id, status: dto.status, location: dto.location ?? null, remarks: dto.remarks ?? null, eventAt, source: DeliveryTrackingSource.MANUAL, recordedById: actor.id } });
      if (dto.markInTransit && d.status === DeliveryStatus.DISPATCHED) {
        await tx.delivery.update({ where: { id }, data: { status: DeliveryStatus.IN_TRANSIT, updatedById: actor.id } });
        await this.history(tx, id, d.status, DeliveryStatus.IN_TRANSIT, actor, dto.status);
      }
      await this.audit(tx, actor, context, d, 'delivery.track', `${d.deliveryNumber}: tracking "${dto.status}"${dto.location ? ` at ${dto.location}` : ''} (manual)`);
      return { id, status: dto.markInTransit && d.status === DeliveryStatus.DISPATCHED ? DeliveryStatus.IN_TRANSIT : d.status };
    });
  }

  async fail(id: string, dto: FailureDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_TRACK, 'record delivery failures');
    const failureDate = dateOnly(dto.failureDate);
    if (failureDate > businessToday()) throw new BadRequestException('The failure date cannot be in the future.');
    if (dto.nextAttemptDate && dateOnly(dto.nextAttemptDate) < failureDate) throw new BadRequestException('The next attempt cannot be before the failure date.');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      this.assertTransition(d.status, DeliveryStatus.DELIVERY_FAILED);
      if (d.dispatchDate && failureDate < d.dispatchDate) throw new BadRequestException('The failure date cannot be before the dispatch date.');
      await tx.delivery.update({
        where: { id },
        data: { status: DeliveryStatus.DELIVERY_FAILED, failureDate, failureReason: dto.failureReason, failureRemarks: dto.remarks ?? null, nextAttemptDate: dto.nextAttemptDate ? dateOnly(dto.nextAttemptDate) : null, updatedById: actor.id },
      });
      await this.history(tx, id, d.status, DeliveryStatus.DELIVERY_FAILED, actor, dto.failureReason);
      await tx.shipmentTrackingEvent.create({ data: { deliveryId: id, status: 'delivery failed', remarks: dto.failureReason, source: DeliveryTrackingSource.MANUAL, recordedById: actor.id } });
      await this.audit(tx, actor, context, d, 'delivery.fail', `${d.deliveryNumber}: delivery failed - ${dto.failureReason}`, { after: { ...dto } });
      return { id, status: DeliveryStatus.DELIVERY_FAILED };
    });
  }

  /** Delivered only with proof of delivery; per-item received quantities decide DELIVERED vs PARTIALLY_DELIVERED. */
  async confirm(id: string, dto: ConfirmDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_CONFIRM, 'confirm deliveries');
    if (!dto.deliveryConfirmation) throw new BadRequestException('Tick the confirmation that the customer received the goods.');
    const actual = dateOnly(dto.actualDeliveryDate);
    if (actual > businessToday()) throw new BadRequestException('The delivery date cannot be in the future.');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      if (!([DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT] as DeliveryStatus[]).includes(d.status)) throw new BadRequestException(`Only a dispatched or in-transit delivery can be confirmed (this one is ${label(d.status)}).`);
      if (d.dispatchDate && actual < d.dispatchDate) throw new BadRequestException('The delivery date cannot be before the dispatch date.');
      const received = new Map((dto.items ?? []).map((i) => [i.deliveryItemId, i.deliveredQuantity]));
      for (const id2 of received.keys()) if (!d.items.some((i) => i.id === id2)) throw new BadRequestException('A received quantity refers to an item that is not on this delivery.');
      let complete = true;
      for (const item of d.items) {
        const qty = received.has(item.id) ? received.get(item.id)! : item.quantity;
        if (qty > item.quantity) throw new BadRequestException(`${item.productName}: received ${qty} exceeds the ${item.quantity} ${item.unit} dispatched.`);
        if (qty < item.quantity) complete = false;
        await tx.deliveryItem.update({ where: { id: item.id }, data: { deliveredQuantity: qty } });
      }
      if (d.items.every((i) => (received.has(i.id) ? received.get(i.id)! : i.quantity) === 0)) throw new BadRequestException('Nothing was received: record a delivery failure or return instead.');
      const to = complete ? DeliveryStatus.DELIVERED : DeliveryStatus.PARTIALLY_DELIVERED;
      const pod = await tx.proofOfDelivery.create({
        data: { deliveryId: id, receiverName: dto.receiverName, receiverContact: dto.receiverContact ?? null, actualDeliveryDate: actual, deliveryConfirmation: true, remarks: dto.remarks ?? null, confirmedById: actor.id },
        select: { id: true },
      });
      await tx.delivery.update({ where: { id }, data: { status: to, actualDeliveryDate: actual, updatedById: actor.id } });
      await this.history(tx, id, d.status, to, actor, `Received by ${dto.receiverName}${complete ? '' : ' (short delivery)'}`);
      await tx.shipmentTrackingEvent.create({ data: { deliveryId: id, status: label(to), remarks: `Received by ${dto.receiverName}`, source: DeliveryTrackingSource.MANUAL, recordedById: actor.id } });
      await this.audit(tx, actor, context, d, 'delivery.confirm', `${d.deliveryNumber}: ${label(to)}, received by ${dto.receiverName} on ${dto.actualDeliveryDate.slice(0, 10)}`, { after: { podId: pod.id, items: d.items.map((i) => ({ id: i.id, dispatched: i.quantity, received: received.has(i.id) ? received.get(i.id) : i.quantity })) } });
      return { id, status: to, proofOfDeliveryId: pod.id };
    });
  }

  /** Corrects recorded proof by adding an amendment; the original stays. */
  async amendPod(id: string, dto: AmendPodDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_CONFIRM, 'amend proof of delivery');
    const actual = dateOnly(dto.actualDeliveryDate);
    if (actual > businessToday()) throw new BadRequestException('The delivery date cannot be in the future.');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      const latest = await tx.proofOfDelivery.findFirst({ where: { deliveryId: id, amendedBy: null }, orderBy: { confirmedAt: 'desc' } });
      if (!latest) throw new BadRequestException('This delivery has no proof of delivery to amend.');
      const pod = await tx.proofOfDelivery.create({
        data: { deliveryId: id, receiverName: dto.receiverName, receiverContact: dto.receiverContact ?? null, actualDeliveryDate: actual, deliveryConfirmation: true, remarks: dto.remarks ?? null, confirmedById: actor.id, amendsId: latest.id, amendmentReason: dto.amendmentReason },
        select: { id: true },
      });
      await tx.delivery.update({ where: { id }, data: { actualDeliveryDate: actual, updatedById: actor.id } });
      await this.audit(tx, actor, context, d, 'delivery.pod.amend', `${d.deliveryNumber}: proof of delivery amended - ${dto.amendmentReason}`, {
        before: { receiverName: latest.receiverName, receiverContact: latest.receiverContact, actualDeliveryDate: latest.actualDeliveryDate },
        after: { receiverName: dto.receiverName, receiverContact: dto.receiverContact ?? null, actualDeliveryDate: dto.actualDeliveryDate.slice(0, 10) },
      });
      return { id, proofOfDeliveryId: pod.id };
    });
  }

  async cancel(id: string, dto: CancelDeliveryDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.DELIVERY_CANCEL, 'cancel deliveries');
    return this.prisma.$transaction(async (tx) => {
      const d = await this.lockDelivery(tx, id);
      if (DISPATCHED_STATES.includes(d.status)) throw new BadRequestException('The goods have left: record a delivery failure or return instead of cancelling.');
      this.assertTransition(d.status, DeliveryStatus.CANCELLED);
      await tx.delivery.update({ where: { id }, data: { status: DeliveryStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: dto.reason, updatedById: actor.id } });
      await this.history(tx, id, d.status, DeliveryStatus.CANCELLED, actor, dto.reason);
      await this.audit(tx, actor, context, d, 'delivery.cancel', `Cancelled ${d.deliveryNumber}: ${dto.reason}`);
      return { id, status: DeliveryStatus.CANCELLED };
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private buildWhere(q: QueryDeliveriesDto): Prisma.DeliveryWhereInput {
    const and: Prisma.DeliveryWhereInput[] = [];
    const range = (from?: string, to?: string) => ({ ...(from ? { gte: dateOnly(from) } : {}), ...(to ? { lte: dateOnly(to) } : {}) });
    if (q.status?.length) and.push({ status: { in: q.status } });
    if (q.customerId) and.push({ customerId: q.customerId });
    if (q.finalInvoiceId) and.push({ finalInvoiceId: q.finalInvoiceId });
    if (q.dateFrom || q.dateTo) and.push({ deliveryDate: range(q.dateFrom, q.dateTo) });
    if (q.dispatchFrom || q.dispatchTo) and.push({ dispatchDate: range(q.dispatchFrom, q.dispatchTo) });
    if (q.expectedFrom || q.expectedTo) and.push({ expectedDate: range(q.expectedFrom, q.expectedTo) });
    if (q.deliveredFrom || q.deliveredTo) and.push({ actualDeliveryDate: range(q.deliveredFrom, q.deliveredTo) });
    if (q.transporter) and.push({ OR: [{ transporterName: { contains: q.transporter, mode: 'insensitive' } }, { courierCompany: { contains: q.transporter, mode: 'insensitive' } }] });
    if (q.location) and.push({ deliveryAddress: { contains: q.location, mode: 'insensitive' } });
    if (q.delayedOnly) and.push({ status: { in: OPEN_STATES }, expectedDate: { lt: businessToday() } });
    if (q.search) {
      const text = { contains: q.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { deliveryNumber: text },
          { trackingNumber: text },
          { lrGrNumber: text },
          { transporterName: text },
          { courierCompany: text },
          { deliveryAddress: text },
          { finalInvoice: { invoiceNumber: text } },
          { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: { contains: normalizeName(q.search) } }] } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private listSelect = {
    id: true,
    deliveryNumber: true,
    status: true,
    deliveryDate: true,
    expectedDate: true,
    dispatchDate: true,
    actualDeliveryDate: true,
    transportMode: true,
    transporterName: true,
    courierCompany: true,
    trackingNumber: true,
    deliveryAddress: true,
    createdAt: true,
    customer: { select: { id: true, name: true, customerCode: true } },
    finalInvoice: { select: { id: true, invoiceNumber: true } },
    items: { select: { quantity: true, deliveredQuantity: true, unit: true } },
  } satisfies Prisma.DeliverySelect;

  private withFlags<T extends { status: DeliveryStatus; expectedDate: Date | null; items: Array<{ quantity: number; deliveredQuantity: number | null }> }>(row: T) {
    return {
      ...row,
      totalQuantity: row.items.reduce((s, i) => s + i.quantity, 0),
      delayed: Boolean(row.expectedDate && row.expectedDate < businessToday() && OPEN_STATES.includes(row.status)),
    };
  }

  async findAll(q: QueryDeliveriesDto) {
    const where = this.buildWhere(q);
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({ where, select: this.listSelect, orderBy: [{ [q.sortBy]: q.sortBy === 'createdAt' || q.sortBy === 'deliveryNumber' || q.sortBy === 'status' || q.sortBy === 'deliveryDate' ? q.sortDir : { sort: q.sortDir, nulls: 'last' } }, { id: 'asc' }], skip: q.skip, take: q.take }),
      this.prisma.delivery.count({ where }),
    ]);
    return buildPaginatedResult(rows.map((r) => this.withFlags(r)), totalItems, q.page, q.pageSize);
  }

  async findAllForExport(q: QueryDeliveriesDto) {
    const rows = await this.prisma.delivery.findMany({ where: this.buildWhere(q), select: this.listSelect, orderBy: [{ [q.sortBy]: q.sortDir }, { id: 'asc' }], take: 10_000 });
    return rows.map((r) => this.withFlags(r));
  }

  async summary() {
    const today = businessToday();
    const [grouped, delayed] = await Promise.all([
      this.prisma.delivery.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.delivery.count({ where: { status: { in: OPEN_STATES }, expectedDate: { lt: today } } }),
    ]);
    const c = (s: DeliveryStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      total: grouped.reduce((s, g) => s + g._count._all, 0),
      draft: c(DeliveryStatus.DRAFT),
      scheduled: c(DeliveryStatus.SCHEDULED),
      readyForDispatch: c(DeliveryStatus.READY_FOR_DISPATCH),
      dispatched: c(DeliveryStatus.DISPATCHED),
      inTransit: c(DeliveryStatus.IN_TRANSIT),
      delivered: c(DeliveryStatus.DELIVERED),
      partiallyDelivered: c(DeliveryStatus.PARTIALLY_DELIVERED),
      failed: c(DeliveryStatus.DELIVERY_FAILED),
      returned: c(DeliveryStatus.RETURNED),
      cancelled: c(DeliveryStatus.CANCELLED),
      delayed,
      generatedAt: new Date().toISOString(),
    };
  }

  async findOne(id: string) {
    const d = await this.prisma.delivery.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerCode: true } },
        finalInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, status: true, proformaInvoiceId: true, quotationId: true } },
        items: { include: { packingItems: { select: { quantity: true, packingList: { select: { packageNumber: true } } } } } },
        statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
        trackingEvents: { orderBy: { eventAt: 'desc' }, include: { recordedBy: userSelect } },
        packingLists: { orderBy: { packageNumber: 'asc' }, include: { items: { include: { deliveryItem: { select: { productName: true, modelName: true, unit: true } } } } } },
        proofsOfDelivery: { orderBy: { confirmedAt: 'asc' }, include: { confirmedBy: userSelect } },
        redeliveryOf: { select: { id: true, deliveryNumber: true, status: true } },
        redeliveries: { select: { id: true, deliveryNumber: true, status: true } },
        challanDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
        packingDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
        documents: {
          where: { archivedAt: null },
          select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
          orderBy: { createdAt: 'desc' },
        },
        createdBy: userSelect,
        updatedBy: userSelect,
      },
    });
    if (!d) throw new NotFoundException(`Delivery ${id} was not found`);
    const positions = await this.invoiceItems(d.finalInvoiceId);
    return {
      ...this.withFlags(d),
      invoicePositions: positions,
      canEditItems: EDITABLE.includes(d.status) && !d.challanDocumentId,
    };
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: DELIVERY_ENTITY, entityId: id }, { parentEntityType: DELIVERY_ENTITY, parentEntityId: id }] };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true, actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, pagination.page, pagination.pageSize);
  }

  async assertExists(id: string) {
    const d = await this.prisma.delivery.findUnique({ where: { id }, select: { id: true, status: true, deliveryNumber: true, proofsOfDelivery: { select: { id: true }, take: 1 } } });
    if (!d) throw new NotFoundException(`Delivery ${id} was not found`);
    return { ...d, confirmed: d.proofsOfDelivery.length > 0 };
  }

  /** Delivery position of one invoice: never touches its amounts or payments. */
  async invoiceHistory(finalInvoiceId: string) {
    const positions = await this.invoiceItems(finalInvoiceId);
    const deliveries = await this.prisma.delivery.findMany({ where: { finalInvoiceId }, select: this.listSelect, orderBy: { createdAt: 'asc' } });
    const invoiced = positions.reduce((s, p) => s + p.invoicedQuantity, 0);
    const dispatched = await this.prisma.deliveryItem.aggregate({ where: { delivery: { finalInvoiceId, status: { in: DISPATCHED_STATES } } }, _sum: { quantity: true } });
    const delivered = positions.reduce((s, p) => s + p.confirmedDeliveredQuantity, 0);
    return {
      finalInvoiceId,
      invoicedQuantity: invoiced,
      dispatchedQuantity: dispatched._sum.quantity ?? 0,
      confirmedDeliveredQuantity: delivered,
      remainingQuantity: Math.max(invoiced - delivered, 0),
      unallocatedQuantity: positions.reduce((s, p) => s + p.remainingQuantity, 0),
      numberOfDeliveries: deliveries.filter((d) => d.status !== DeliveryStatus.CANCELLED).length,
      deliveryState: invoiceDeliveryState(invoiced, delivered),
      items: positions,
      deliveries: deliveries.map((d) => this.withFlags(d)),
    };
  }

  async customerHistory(customerId: string) {
    const deliveries = await this.prisma.delivery.findMany({ where: { customerId }, select: this.listSelect, orderBy: { createdAt: 'desc' }, take: 300 });
    const rows = deliveries.map((d) => this.withFlags(d));
    const count = (s: DeliveryStatus[]) => rows.filter((d) => s.includes(d.status)).length;
    return {
      total: rows.length,
      scheduled: count([DeliveryStatus.SCHEDULED, DeliveryStatus.READY_FOR_DISPATCH]),
      inTransit: count([DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT]),
      completed: count([DeliveryStatus.DELIVERED]),
      partiallyDelivered: count([DeliveryStatus.PARTIALLY_DELIVERED]),
      failed: count([DeliveryStatus.DELIVERY_FAILED]),
      delayed: rows.filter((d) => d.delayed).length,
      deliveries: rows,
    };
  }

  /** Reports from the database (bounded, filtered). */
  async reports(q: DeliveryReportQueryDto) {
    const from = q.dateFrom ? dateOnly(q.dateFrom) : null;
    const to = q.dateTo ? dateOnly(q.dateTo) : null;
    const customer = q.customerId ?? null;
    const transporter = q.transporter ? `%${q.transporter}%` : null;
    const base = Prisma.sql`(${customer}::uuid IS NULL OR d."customerId" = ${customer}::uuid)
      AND (${transporter}::text IS NULL OR d."transporterName" ILIKE ${transporter}::text OR d."courierCompany" ILIKE ${transporter}::text)`;
    const onDate = (col: Prisma.Sql) => Prisma.sql`(${from}::date IS NULL OR ${col} >= ${from}::date) AND (${to}::date IS NULL OR ${col} <= ${to}::date)`;
    type Row = { key: string; count: bigint; quantity: bigint | null };
    const [dailyDispatch, monthly, byCustomer, byInvoice, byTransporter] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`SELECT to_char(d."dispatchDate", 'YYYY-MM-DD') AS key, COUNT(DISTINCT d.id) AS count, SUM(di.quantity) AS quantity FROM deliveries d JOIN delivery_items di ON di."deliveryId" = d.id WHERE d."dispatchDate" IS NOT NULL AND ${onDate(Prisma.sql`d."dispatchDate"`)} AND ${base} GROUP BY 1 ORDER BY 1 DESC LIMIT 366`,
      this.prisma.$queryRaw<Array<Row & { delivered: bigint }>>`SELECT to_char(d."deliveryDate", 'YYYY-MM') AS key, COUNT(*) AS count, COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered, NULL::bigint AS quantity FROM deliveries d WHERE ${onDate(Prisma.sql`d."deliveryDate"`)} AND ${base} GROUP BY 1 ORDER BY 1 DESC`,
      this.prisma.$queryRaw<Array<Row & { name: string; delivered: bigint }>>`SELECT c.id AS key, c.name, COUNT(*) AS count, COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered, NULL::bigint AS quantity FROM deliveries d JOIN customers c ON c.id = d."customerId" WHERE ${onDate(Prisma.sql`d."deliveryDate"`)} AND ${base} GROUP BY 1, 2 ORDER BY count DESC LIMIT 200`,
      this.prisma.$queryRaw<Array<Row & { invoiceNumber: string | null; delivered: bigint | null }>>`
        SELECT fi.id AS key, fi."invoiceNumber", COUNT(DISTINCT d.id) AS count,
               SUM(di.quantity) FILTER (WHERE d.status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERED','DELIVERY_FAILED')) AS quantity,
               SUM(di."deliveredQuantity") FILTER (WHERE d.status IN ('DELIVERED','PARTIALLY_DELIVERED')) AS delivered
        FROM deliveries d JOIN final_invoices fi ON fi.id = d."finalInvoiceId" JOIN delivery_items di ON di."deliveryId" = d.id
        WHERE ${onDate(Prisma.sql`d."deliveryDate"`)} AND ${base} GROUP BY 1, 2 ORDER BY 2 LIMIT 300`,
      this.prisma.$queryRaw<Array<Row & { delivered: bigint; failed: bigint }>>`
        SELECT COALESCE(NULLIF(TRIM(COALESCE(d."courierCompany", d."transporterName")), ''), 'Not recorded') AS key, COUNT(*) AS count,
               COUNT(*) FILTER (WHERE d.status = 'DELIVERED') AS delivered, COUNT(*) FILTER (WHERE d.status = 'DELIVERY_FAILED') AS failed, NULL::bigint AS quantity
        FROM deliveries d WHERE d.status NOT IN ('DRAFT','CANCELLED') AND ${onDate(Prisma.sql`d."deliveryDate"`)} AND ${base} GROUP BY 1 ORDER BY count DESC LIMIT 100`,
    ]);
    const list = (where: Prisma.DeliveryWhereInput) =>
      this.prisma.delivery.findMany({ where: { ...where, ...(customer ? { customerId: customer } : {}) }, select: this.listSelect, orderBy: { deliveryDate: 'asc' }, take: 300 }).then((r) => r.map((x) => this.withFlags(x)));
    const today = businessToday();
    const dateWhere = from || to ? { deliveryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
    const [scheduled, inTransit, delivered, delayed, failed, partial] = await Promise.all([
      list({ status: { in: [DeliveryStatus.SCHEDULED, DeliveryStatus.READY_FOR_DISPATCH] }, ...dateWhere }),
      list({ status: { in: [DeliveryStatus.DISPATCHED, DeliveryStatus.IN_TRANSIT] }, ...dateWhere }),
      list({ status: DeliveryStatus.DELIVERED, ...dateWhere }),
      list({ status: { in: OPEN_STATES }, expectedDate: { lt: today } }),
      list({ status: DeliveryStatus.DELIVERY_FAILED, ...dateWhere }),
      list({ status: DeliveryStatus.PARTIALLY_DELIVERED, ...dateWhere }),
    ]);
    const num = (v: bigint | null | undefined) => Number(v ?? 0);
    return {
      filters: { dateFrom: q.dateFrom ?? null, dateTo: q.dateTo ?? null, customerId: customer, transporter: q.transporter ?? null },
      dailyDispatch: dailyDispatch.map((r) => ({ date: r.key, deliveries: num(r.count), quantity: num(r.quantity) })),
      monthly: monthly.map((r) => ({ month: r.key, deliveries: num(r.count), delivered: num(r.delivered) })),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.key, name: r.name }, deliveries: num(r.count), delivered: num(r.delivered) })),
      byInvoice: byInvoice.map((r) => ({ invoice: { id: r.key, invoiceNumber: r.invoiceNumber }, deliveries: num(r.count), dispatchedQuantity: num(r.quantity), deliveredQuantity: num(r.delivered) })),
      byTransporter: byTransporter.map((r) => ({ transporter: r.key, deliveries: num(r.count), delivered: num(r.delivered), failed: num(r.failed) })),
      scheduled,
      inTransit,
      delivered,
      delayed,
      failed,
      partial,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Before a document is removed: proof is frozen once the delivery is confirmed. */
  async assertDocumentsEditable(id: string) {
    const d = await this.assertExists(id);
    if (d.confirmed) throw new ConflictException('Proof of delivery is confirmed; its documents are kept. Add a new document or amend the proof instead.');
    if (d.status === DeliveryStatus.CANCELLED) throw new BadRequestException('Documents of a cancelled delivery cannot be changed.');
    return d;
  }
}
