import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryStatus, FinalInvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { buildPaginatedResult } from '../common/dto/pagination.dto';
import type { CancelDeliveryDto, ConfirmDeliveryDto, CreateDeliveryDto, DispatchDeliveryDto, FailureDto, QueryDeliveriesDto, ScheduleDeliveryDto, TrackingDto, UpdateDeliveryDto } from './dto/delivery.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const dateOnly = (value: string) => new Date(`${value.slice(0,10)}T00:00:00.000Z`);
const userSelect = { select: { id: true, fullName: true } } as const;

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  DRAFT: [DeliveryStatus.SCHEDULED, DeliveryStatus.CANCELLED],
  SCHEDULED: [DeliveryStatus.READY_FOR_DISPATCH, DeliveryStatus.CANCELLED],
  READY_FOR_DISPATCH: [DeliveryStatus.DISPATCHED, DeliveryStatus.CANCELLED],
  DISPATCHED: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.RETURNED, DeliveryStatus.CANCELLED],
  IN_TRANSIT: [DeliveryStatus.PARTIALLY_DELIVERED, DeliveryStatus.DELIVERED, DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.RETURNED, DeliveryStatus.CANCELLED],
  PARTIALLY_DELIVERED: [DeliveryStatus.DELIVERY_FAILED, DeliveryStatus.DELIVERED, DeliveryStatus.RETURNED, DeliveryStatus.CANCELLED],
  DELIVERED: [],
  DELIVERY_FAILED: [DeliveryStatus.SCHEDULED, DeliveryStatus.RETURNED, DeliveryStatus.CANCELLED],
  RETURNED: [DeliveryStatus.SCHEDULED, DeliveryStatus.CANCELLED],
  CANCELLED: [],
};

@Injectable()
export class DeliveriesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly numbering: NumberingService) {}

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`You do not have permission to ${action}.`);
  }

  private auditTx(tx: Tx, actor: AuthenticatedUser, context: RequestContext | null, deliveryId: string, invoiceId: string, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.audit.record({
      actorUserId: actor.id, action, entityType: 'Delivery', entityId: deliveryId,
      parentEntityType: 'FinalInvoice', parentEntityId: invoiceId, summary, ...extra,
      ipAddress: context?.ipAddress ?? null, userAgent: context?.userAgent ?? null,
    }, tx);
  }

  private async lockInvoice(tx: Tx, invoiceId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM final_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Final invoice not found');
  }

  private async remainingByItem(tx: Tx, invoiceId: string) {
    const delivered = await tx.deliveryItem.groupBy({
      by: ['invoiceItemId'],
      where: { delivery: { finalInvoiceId: invoiceId, status: { notIn: [DeliveryStatus.CANCELLED] } } },
      _sum: { quantity: true },
    });
    const map = new Map(delivered.map((x) => [x.invoiceItemId, x._sum.quantity ?? 0]));
    const items = await tx.finalInvoiceItem.findMany({
      where: { finalInvoiceId: invoiceId },
      include: { product: { select: { id: true, name: true } }, productModel: { select: { id: true, modelName: true, modelNumber: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((i) => {
      const deliveredQuantity = map.get(i.id) ?? 0;
      return { ...i, previouslyDelivered: deliveredQuantity, remaining: i.quantity - deliveredQuantity };
    });
  }

  async eligibleInvoices(customerId: string) {
    if (!customerId) throw new BadRequestException('customerId is required');
    const invoices = await this.prisma.finalInvoice.findMany({
      where: { customerId, status: { in: [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT] }, invoiceNumber: { not: null } },
      include: { items: true, deliveries: { select: { id: true, status: true } } },
      orderBy: { invoiceDate: 'desc' },
    });
    const result = [];
    for (const inv of invoices) {
      const totals = await Promise.all(inv.items.map(async (item) => {
        const sum = await this.prisma.deliveryItem.aggregate({
          where: { invoiceItemId: item.id, delivery: { status: { not: DeliveryStatus.CANCELLED } } },
          _sum: { quantity: true },
        });
        return { item, delivered: sum._sum.quantity ?? 0 };
      }));
      const remaining = totals.reduce((n, x) => n + (x.item.quantity - x.delivered), 0);
      const invoiced = totals.reduce((n, x) => n + x.item.quantity, 0);
      if (remaining > 0) result.push({
        id: inv.id, invoiceNumber: inv.invoiceNumber, invoiceDate: inv.invoiceDate, currency: inv.currency, grandTotal: inv.grandTotal,
        invoicedQuantity: invoiced, deliveredQuantity: invoiced - remaining, remainingQuantity: remaining,
        deliveryStatus: remaining === 0 ? 'DELIVERED' : remaining < invoiced ? 'PARTIALLY_DELIVERED' : 'PENDING',
        items: totals.map((x) => ({ ...x.item, previouslyDelivered: x.delivered, remainingQuantity: x.item.quantity - x.delivered })),
      });
    }
    return result;
  }

  async findAll(query: QueryDeliveriesDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const where: Prisma.DeliveryWhereInput = {
      ...(query.search ? { OR: [
        { deliveryNumber: { contains: query.search, mode: 'insensitive' } },
        { trackingNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { finalInvoice: { invoiceNumber: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.finalInvoiceId ? { finalInvoiceId: query.finalInvoiceId } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.transporter ? { transporterName: { contains: query.transporter, mode: 'insensitive' } } : {}),
      ...(query.dateFrom || query.dateTo ? { deliveryDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } } : {}),
    };
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir ?? 'desc';
    const [items, totalItems] = await Promise.all([
      this.prisma.delivery.findMany({ where, include: { customer: { select: { id:true, name:true, customerCode:true } }, finalInvoice: { select: { id:true, invoiceNumber:true } }, items:true }, orderBy: { [sortBy]: sortDir }, skip:(page-1)*pageSize, take:pageSize }),
      this.prisma.delivery.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, page, pageSize);
  }

  async summary() {
    const [total, byStatus, delayed, partial] = await Promise.all([
      this.prisma.delivery.count(),
      this.prisma.delivery.groupBy({ by:['status'], _count:{_all:true} }),
      this.prisma.delivery.count({ where: { status:{ in:[DeliveryStatus.SCHEDULED,DeliveryStatus.READY_FOR_DISPATCH,DeliveryStatus.DISPATCHED,DeliveryStatus.IN_TRANSIT] }, expectedDate:{ lt:new Date() } } }),
      this.prisma.delivery.count({ where:{ status:DeliveryStatus.PARTIALLY_DELIVERED } }),
    ]);
    const count = (status: DeliveryStatus) => byStatus.find((x)=>x.status===status)?._count._all ?? 0;
    return { total, scheduled:count(DeliveryStatus.SCHEDULED), readyForDispatch:count(DeliveryStatus.READY_FOR_DISPATCH), dispatched:count(DeliveryStatus.DISPATCHED), inTransit:count(DeliveryStatus.IN_TRANSIT), delivered:count(DeliveryStatus.DELIVERED), delayed, partiallyDelivered:partial, cancelled:count(DeliveryStatus.CANCELLED) };
  }

  async findOne(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where:{id},
      include:{ customer:true, finalInvoice:{include:{items:true}}, items:{include:{invoiceItem:true}}, statusHistory:{include:{changedBy:userSelect},orderBy:{changedAt:'asc'}}, trackingEvents:{orderBy:{eventAt:'desc'}}, packingLists:{include:{items:true}}, proofOfDelivery:true, challanDocument:true, packingDocument:true, documents:{include:{uploadedBy:userSelect}}},
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async create(dto: CreateDeliveryDto, actor: AuthenticatedUser, context: RequestContext | null) {
    this.require(actor, PERMISSIONS.DELIVERY_CREATE, 'create deliveries');
    if (!dto.items?.length) throw new BadRequestException('At least one delivery item is required');
    const duplicate = new Set(dto.items.map((i)=>i.invoiceItemId));
    if (duplicate.size !== dto.items.length) throw new BadRequestException('Duplicate invoice items are not allowed');
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx,dto.finalInvoiceId);
      const invoice = await tx.finalInvoice.findUnique({where:{id:dto.finalInvoiceId},include:{items:true}});
      if (!invoice) throw new NotFoundException('Final invoice not found');
      if (invoice.customerId !== dto.customerId) throw new BadRequestException('The invoice does not belong to the selected customer');
      if (invoice.status !== FinalInvoiceStatus.ISSUED && invoice.status !== FinalInvoiceStatus.SENT) throw new BadRequestException('Only issued or sent final invoices can be delivered');
      const remaining = await this.remainingByItem(tx,dto.finalInvoiceId);
      const room = new Map(remaining.map((i)=>[i.id,i.remaining]));
      const prepared = [];
      for (const request of dto.items) {
        const item = remaining.find((i)=>i.id===request.invoiceItemId);
        if (!item) throw new BadRequestException(`Invoice item ${request.invoiceItemId} does not belong to this invoice`);
        if (request.quantity > (room.get(item.id) ?? 0)) throw new BadRequestException(`Quantity exceeds remaining deliverable quantity for ${item.productName} (${room.get(item.id)} ${item.unit} remaining)`);
        prepared.push({ invoiceItemId:item.id, productId:item.productId, productModelId:item.productModelId, productName:item.productName, productCode:item.productCode, brandName:item.brandName, modelName:item.modelName, modelNumber:item.modelNumber, description:item.description, quantity:request.quantity, unit:item.unit, packageCount:request.packageCount ?? null, remarks:request.remarks ?? null });
      }
      const number = await this.numbering.allocate('DELIVERY',tx);
      const delivery = await tx.delivery.create({data:{
        deliveryNumber:number, customerId:dto.customerId, finalInvoiceId:dto.finalInvoiceId,
        deliveryDate:dateOnly(dto.deliveryDate), expectedDate:dto.expectedDate ? dateOnly(dto.expectedDate) : null,
        deliveryAddress:dto.deliveryAddress, contactPerson:dto.contactPerson??null, contactNumber:dto.contactNumber??null, internalRemarks:dto.internalRemarks??null,
        createdById:actor.id, updatedById:actor.id,
        items:{create:prepared},
        statusHistory:{create:{previousStatus:null,newStatus:DeliveryStatus.DRAFT,changedById:actor.id,remarks:'Delivery created'}},
      },include:{items:true}});
      await this.auditTx(tx,actor,context,delivery.id,delivery.finalInvoiceId,'delivery.create',`Created delivery ${number}`);
      return delivery;
    });
}

  async update(id:string,dto:UpdateDeliveryDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_UPDATE,'update delivery drafts');
    return this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM deliveries WHERE id=${id}::uuid FOR UPDATE`;
      const delivery=await tx.delivery.findUnique({where:{id},include:{items:true}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      if(delivery.status!==DeliveryStatus.DRAFT) throw new BadRequestException('Only draft deliveries can be edited');
      await this.lockInvoice(tx,delivery.finalInvoiceId);
      const data: Prisma.DeliveryUpdateInput={}
      if(dto.deliveryDate) data.deliveryDate=dateOnly(dto.deliveryDate);
      if(dto.expectedDate!==undefined) data.expectedDate=dto.expectedDate ? dateOnly(dto.expectedDate) : null;
      if(dto.deliveryAddress!==undefined) data.deliveryAddress=dto.deliveryAddress;
      if(dto.contactPerson!==undefined) data.contactPerson=dto.contactPerson;
      if(dto.contactNumber!==undefined) data.contactNumber=dto.contactNumber;
      if(dto.internalRemarks!==undefined) data.internalRemarks=dto.internalRemarks;
      data.updatedBy={connect:{id:actor.id}};
      if(dto.items){
        if(!dto.items.length) throw new BadRequestException('At least one delivery item is required');
        const ids=new Set(dto.items.map((i)=>i.invoiceItemId)); if(ids.size!==dto.items.length) throw new ConflictException('Duplicate invoice items');
        const remaining=await this.remainingByItem(tx,delivery.finalInvoiceId);
        const existing= new Map(delivery.items.map((i)=>[i.invoiceItemId,i.quantity]));
        for(const request of dto.items){
          const item=remaining.find((i)=>i.id===request.invoiceItemId);
          if(!item) throw new BadRequestException('Delivery item does not belong to the invoice');
          const allowed=item.remaining+(existing.get(item.id)??0);
          if(request.quantity>allowed) throw new BadRequestException(`Quantity exceeds remaining deliverable quantity for ${item.productName}`);
        }
        await tx.deliveryItem.deleteMany({where:{deliveryId:id}});
        data.items={create:dto.items.map((request)=>{
          const item=remaining.find((i)=>i.id===request.invoiceItemId)!;
          return {invoiceItemId:item.id,productId:item.productId,productModelId:item.productModelId,productName:item.productName,productCode:item.productCode,brandName:item.brandName,modelName:item.modelName,modelNumber:item.modelNumber,description:item.description,quantity:request.quantity,unit:item.unit,packageCount:request.packageCount??null,remarks:request.remarks??null};
        })};
      }
      const updated=await tx.delivery.update({where:{id},data,include:{items:true}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.update',`Updated delivery ${delivery.deliveryNumber}`,{before:delivery,after:updated});
      return updated;
    });
  }

  private transitionPermission(to: DeliveryStatus) {
    if(to===DeliveryStatus.SCHEDULED||to===DeliveryStatus.READY_FOR_DISPATCH) return PERMISSIONS.DELIVERY_SCHEDULE;
    if(to===DeliveryStatus.DISPATCHED) return PERMISSIONS.DELIVERY_DISPATCH;
    if(to===DeliveryStatus.CANCELLED) return PERMISSIONS.DELIVERY_CANCEL;
    return PERMISSIONS.DELIVERY_UPDATE;
  }

  async transition(id:string,to:DeliveryStatus,remarks:string|undefined,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,this.transitionPermission(to),`change delivery status to ${to}`);
    return this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM deliveries WHERE id=${id}::uuid FOR UPDATE`;
      const delivery=await tx.delivery.findUnique({where:{id}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      if(!DELIVERY_TRANSITIONS[delivery.status].includes(to)) throw new BadRequestException(`Cannot change delivery status from ${delivery.status} to ${to}`);
      if(to===DeliveryStatus.DELIVERED) throw new BadRequestException('Delivered status requires proof of delivery confirmation');
      const updated=await tx.delivery.update({where:{id},data:{status:to,updatedBy:{connect:{id:actor.id}}},include:{items:true}});
      await tx.deliveryStatusHistory.create({data:{deliveryId:id,previousStatus:delivery.status,newStatus:to,remarks:remarks??null,changedById:actor.id}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.status',`Changed delivery ${delivery.deliveryNumber} from ${delivery.status} to ${to}`,{before:{status:delivery.status},after:{status:to,remarks}});
      return updated;
    });
  }

  schedule(id:string,dto:ScheduleDeliveryDto,actor:AuthenticatedUser,context:RequestContext|null) { return this.transition(id,DeliveryStatus.SCHEDULED,dto.remarks??undefined,actor,context).then(async()=>this.prisma.delivery.update({where:{id},data:{expectedDate:dateOnly(dto.expectedDate),updatedBy:{connect:{id:actor.id}}}})); }

  async dispatch(id:string,dto:DispatchDeliveryDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_DISPATCH,'dispatch deliveries');
    return this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM deliveries WHERE id=${id}::uuid FOR UPDATE`;
      const delivery=await tx.delivery.findUnique({where:{id}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      if(delivery.status!==DeliveryStatus.READY_FOR_DISPATCH && delivery.status!==DeliveryStatus.SCHEDULED) throw new BadRequestException('Delivery must be ready for dispatch');
      if(dto.transportMode===('COURIER' as any) && !dto.courierCompany) throw new BadRequestException('Courier company is required for courier dispatch');
      const updated=await tx.delivery.update({where:{id},data:{status:DeliveryStatus.DISPATCHED,dispatchDate:dateOnly(dto.dispatchDate??new Date().toISOString().slice(0,10)),dispatchTime:dto.dispatchTime??null,transportMode:dto.transportMode??null,transporterName:dto.transporterName??null,vehicleNumber:dto.vehicleNumber??null,driverName:dto.driverName??null,driverContact:dto.driverContact??null,courierCompany:dto.courierCompany??null,trackingNumber:dto.trackingNumber??null,lrGrNumber:dto.lrGrNumber??null,dispatchRemarks:dto.dispatchRemarks??null,updatedBy:{connect:{id:actor.id}}}});
      await tx.deliveryStatusHistory.create({data:{deliveryId:id,previousStatus:delivery.status,newStatus:DeliveryStatus.DISPATCHED,remarks:dto.dispatchRemarks??null,changedById:actor.id}});
      await tx.shipmentTrackingEvent.create({data:{deliveryId:id,status:'DISPATCHED',remarks:dto.dispatchRemarks??'Shipment dispatched',source:'MANUAL'}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.dispatch',`Dispatched delivery ${delivery.deliveryNumber}`);
      return updated;
    });
  }

  async tracking(id:string,dto:TrackingDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_TRACK,'update shipment tracking');
    return this.prisma.$transaction(async(tx)=>{
      const delivery=await tx.delivery.findUnique({where:{id}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      await tx.shipmentTrackingEvent.create({data:{deliveryId:id,status:dto.status,location:dto.location??null,remarks:dto.remarks??null,source:'MANUAL'}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.track',`Added tracking update '${dto.status}'`);
      return tx.delivery.findUnique({where:{id},include:{trackingEvents:{orderBy:{eventAt:'desc'}}}});
    });
  }

  async failure(id:string,dto:FailureDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_TRACK,'record delivery failure');
    return this.prisma.$transaction(async(tx)=>{
      const delivery=await tx.delivery.findUnique({where:{id}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      await tx.deliveryStatusHistory.create({data:{deliveryId:id,previousStatus:delivery.status,newStatus:DeliveryStatus.DELIVERY_FAILED,remarks:dto.remarks??dto.failureReason,changedById:actor.id}});
      await tx.shipmentTrackingEvent.create({data:{deliveryId:id,status:'DELIVERY_FAILED',remarks:dto.failureReason,source:'MANUAL'}});
      const updated=await tx.delivery.update({where:{id},data:{status:DeliveryStatus.DELIVERY_FAILED,failureDate:dateOnly(dto.failureDate),failureReason:dto.failureReason,nextAttemptDate:dto.nextAttemptDate?dateOnly(dto.nextAttemptDate):null,updatedBy:{connect:{id:actor.id}}}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.failure',`Recorded delivery failure: ${dto.failureReason}`);
      return updated;
    });
  }

  async confirm(id:string,dto:ConfirmDeliveryDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_CONFIRM,'confirm deliveries');
    if(!dto.deliveryConfirmation) throw new BadRequestException('Delivery confirmation must be acknowledged');
    return this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM deliveries WHERE id=${id}::uuid FOR UPDATE`;
      const delivery=await tx.delivery.findUnique({where:{id},include:{items:true,proofOfDelivery:true}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      if(delivery.proofOfDelivery) throw new ConflictException('Proof of delivery already exists; amendments must preserve history');
      if(delivery.status!==DeliveryStatus.DISPATCHED && delivery.status!==DeliveryStatus.IN_TRANSIT && delivery.status!==DeliveryStatus.PARTIALLY_DELIVERED) throw new BadRequestException('Only dispatched or in-transit deliveries can be confirmed');
      const allItems=await this.remainingByItem(tx,delivery.finalInvoiceId);
      const dispatchedTotal=delivery.items.reduce((n,i)=>n+i.quantity,0);
      const invoiceRemaining=allItems.reduce((n,i)=>n+(i.remaining),0);
      const complete=invoiceRemaining===0;
      const pod=await tx.proofOfDelivery.create({data:{deliveryId:id,receiverName:dto.receiverName,receiverContact:dto.receiverContact??null,actualDeliveryDate:dateOnly(dto.actualDeliveryDate),deliveryConfirmation:true,remarks:dto.remarks??null,confirmedById:actor.id}});
      const updated=await tx.delivery.update({where:{id},data:{status:complete?DeliveryStatus.DELIVERED:DeliveryStatus.PARTIALLY_DELIVERED,actualDeliveryDate:dateOnly(dto.actualDeliveryDate),updatedBy:{connect:{id:actor.id}}}});
      await tx.deliveryStatusHistory.create({data:{deliveryId:id,previousStatus:delivery.status,newStatus:updated.status,remarks:dto.remarks??'Proof of delivery confirmed',changedById:actor.id}});
      await tx.shipmentTrackingEvent.create({data:{deliveryId:id,status:updated.status,remarks:dto.remarks??'Customer delivery confirmed',source:'MANUAL'}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.confirm',`Confirmed delivery ${delivery.deliveryNumber}`);
      return { delivery:updated, proofOfDelivery:pod };
    });
  }

  async cancel(id:string,dto:CancelDeliveryDto,actor:AuthenticatedUser,context:RequestContext|null) {
    this.require(actor,PERMISSIONS.DELIVERY_CANCEL,'cancel deliveries');
    return this.prisma.$transaction(async(tx)=>{
      const delivery=await tx.delivery.findUnique({where:{id}});
      if(!delivery) throw new NotFoundException('Delivery not found');
      if(delivery.status===DeliveryStatus.DELIVERED||delivery.status===DeliveryStatus.CANCELLED) throw new BadRequestException('Delivered or already cancelled deliveries cannot be cancelled');
      const updated=await tx.delivery.update({where:{id},data:{status:DeliveryStatus.CANCELLED,updatedBy:{connect:{id:actor.id}}}});
      await tx.deliveryStatusHistory.create({data:{deliveryId:id,previousStatus:delivery.status,newStatus:DeliveryStatus.CANCELLED,remarks:dto.reason,changedById:actor.id}});
      await this.auditTx(tx,actor,context,id,delivery.finalInvoiceId,'delivery.cancel',`Cancelled delivery ${delivery.deliveryNumber}: ${dto.reason}`);
      return updated;
    });
  }

  async customerHistory(customerId:string) {
    const deliveries=await this.prisma.delivery.findMany({where:{customerId},include:{finalInvoice:{select:{id:true,invoiceNumber:true}},items:true},orderBy:{createdAt:'desc'}});
    const count=(statuses:DeliveryStatus[])=>deliveries.filter((d)=>statuses.includes(d.status)).length;
    return { total:deliveries.length, scheduled:count([DeliveryStatus.SCHEDULED]), inTransit:count([DeliveryStatus.DISPATCHED,DeliveryStatus.IN_TRANSIT]), completed:count([DeliveryStatus.DELIVERED,DeliveryStatus.PARTIALLY_DELIVERED]), delayed:deliveries.filter((d)=>d.expectedDate&&d.expectedDate<new Date()&&d.status!==DeliveryStatus.DELIVERED&&d.status!==DeliveryStatus.CANCELLED).length, deliveries };
  }

  async invoiceHistory(finalInvoiceId:string) {
    const invoice=await this.prisma.finalInvoice.findUnique({where:{id:finalInvoiceId},include:{items:true}});
    if(!invoice) throw new NotFoundException('Final invoice not found');
    const deliveries=await this.prisma.delivery.findMany({where:{finalInvoiceId,status:{not:DeliveryStatus.CANCELLED}},include:{items:true},orderBy:{createdAt:'asc'}});
    const sum=(statusFilter?:DeliveryStatus[])=>deliveries.filter((d)=>!statusFilter||statusFilter.includes(d.status)).flatMap((d)=>d.items).reduce((n,i)=>n+i.quantity,0);
    const invoiced=invoice.items.reduce((n,i)=>n+i.quantity,0);
    const dispatched=sum([DeliveryStatus.DISPATCHED,DeliveryStatus.IN_TRANSIT,DeliveryStatus.PARTIALLY_DELIVERED,DeliveryStatus.DELIVERED]);
    const confirmed=sum([DeliveryStatus.DELIVERED,DeliveryStatus.PARTIALLY_DELIVERED]);
    return { invoiceId:finalInvoiceId, invoicedQuantity:invoiced, dispatchedQuantity:dispatched, confirmedDeliveredQuantity:confirmed, remainingQuantity:Math.max(0,invoiced-confirmed), numberOfDeliveries:deliveries.length, deliveryStatus:confirmed>=invoiced?'DELIVERED':confirmed>0?'PARTIALLY_DELIVERED':'PENDING', deliveries };
  }

  async reports() {
    const deliveries=await this.prisma.delivery.findMany({include:{customer:{select:{id:true,name:true,customerCode:true}},finalInvoice:{select:{id:true,invoiceNumber:true}},items:true},orderBy:{createdAt:'desc'}});
    return { register:deliveries, dailyDispatch:deliveries.filter((d)=>d.dispatchDate), inTransit:deliveries.filter((d)=>d.status===DeliveryStatus.IN_TRANSIT), delivered:deliveries.filter((d)=>d.status===DeliveryStatus.DELIVERED), failed:deliveries.filter((d)=>d.status===DeliveryStatus.DELIVERY_FAILED), partial:deliveries.filter((d)=>d.status===DeliveryStatus.PARTIALLY_DELIVERED), delayed:deliveries.filter((d)=>d.expectedDate&&d.expectedDate<new Date()&&d.status!==DeliveryStatus.DELIVERED&&d.status!==DeliveryStatus.CANCELLED) };
  }
}
