import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnquiryStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { buildPaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  AssignEnquiryDto,
  ChangeStatusDto,
  CreateEnquiryDto,
  EnquiryItemInputDto,
  EnquirySourceDto,
  QueryEnquiriesDto,
  UpdateEnquiryDto,
  UpdateEnquirySourceDto,
} from './dto/enquiry.dto';
import { dateOnly, LOCKED_STATUSES, reasonRequired, STATUS_TRANSITIONS, todayUtc } from './enquiry-rules';

export const ENQUIRY_ENTITY = 'Enquiry';

const userSelect = { select: { id: true, fullName: true } } as const;

const listSelect = {
  id: true,
  enquiryNumber: true,
  enquiryDate: true,
  status: true,
  priority: true,
  nextFollowUpDate: true,
  createdAt: true,
  customer: { select: { id: true, customerCode: true, name: true, customerType: true, status: true } },
  customerContact: { select: { id: true, name: true, phone: true, email: true } },
  source: { select: { id: true, name: true } },
  assignedTo: userSelect,
  _count: { select: { items: true, followUps: true } },
} satisfies Prisma.EnquirySelect;

const detailInclude = {
  customer: {
    include: {
      category: { select: { id: true, name: true } },
      contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
      addresses: { where: { isDefault: true }, orderBy: { addressType: 'asc' } },
    },
  },
  customerContact: true,
  source: { select: { id: true, name: true } },
  assignedTo: userSelect,
  createdBy: userSelect,
  updatedBy: userSelect,
  convertedBy: userSelect,
  items: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      product: {
        select: { id: true, productCode: true, name: true, isActive: true, archivedAt: true, company: { select: { id: true, name: true } } },
      },
      productModel: { select: { id: true, modelCode: true, modelName: true, modelNumber: true, specifications: true, isActive: true } },
    },
  },
  followUps: {
    orderBy: [{ followUpDate: 'desc' }, { createdAt: 'desc' }],
    include: { contact: { select: { id: true, name: true } }, assignedTo: userSelect, createdBy: userSelect },
  },
  statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
  documents: {
    where: { archivedAt: null },
    select: {
      id: true,
      kind: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      replacesDocumentId: true,
      uploadedBy: userSelect,
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.EnquiryInclude;

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly customersService: CustomersService,
    private readonly productsService: ProductsService,
  ) {}

  // -------------------------------------------------------------------------
  // Shared validation
  // -------------------------------------------------------------------------

  /**
   * Every item must point at an existing product (and, if given, a model of
   * that product). Inactive products/models are refused unless the user may
   * use them; nothing is ever created from a typed name.
   */
  async validateItems(items: EnquiryItemInputDto[], actor: AuthenticatedUser) {
    for (const [index, item] of items.entries()) {
      try {
        await this.productsService.assertSelectableForTransaction(item.productId, item.productModelId ?? null, actor);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid product';
        throw new BadRequestException(`Item ${index + 1}: ${message}`);
      }
    }
  }

  async assertContactOfCustomer(customerId: string, contactId?: string | null) {
    if (!contactId) return;
    const contact = await this.prisma.customerContact.findFirst({ where: { id: contactId, customerId }, select: { id: true } });
    if (!contact) throw new BadRequestException('The selected contact person does not belong to this customer.');
  }

  async assertAssignableUser(userId?: string | null) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE, archivedAt: null },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('The selected employee does not exist or is not active.');
  }

  private async assertSourceUsable(sourceId?: string | null) {
    if (!sourceId) return;
    const source = await this.prisma.enquirySource.findUnique({ where: { id: sourceId }, select: { isActive: true } });
    if (!source) throw new BadRequestException('The selected enquiry source does not exist.');
    if (!source.isActive) throw new BadRequestException('The selected enquiry source is inactive.');
  }

  itemData(item: EnquiryItemInputDto, sortOrder: number) {
    return {
      productId: item.productId,
      productModelId: item.productModelId ?? null,
      quantity: item.quantity,
      unit: cleanOptional(item.unit) ?? 'Nos',
      technicalRequirements: cleanOptional(item.technicalRequirements) ?? null,
      remarks: cleanOptional(item.remarks) ?? null,
      sortOrder,
    };
  }

  async loadEditable(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException(`Enquiry ${id} was not found`);
    if (LOCKED_STATUSES.includes(enquiry.status)) {
      throw new BadRequestException(`This enquiry is ${enquiry.status.toLowerCase().replace(/_/g, ' ')} and can no longer be edited.`);
    }
    return enquiry;
  }

  recordStatus(tx: Prisma.TransactionClient, enquiryId: string, from: EnquiryStatus | null, to: EnquiryStatus, actor: AuthenticatedUser, reason?: string | null) {
    return tx.enquiryStatusHistory.create({
      data: { enquiryId, previousStatus: from, newStatus: to, reason: reason ?? null, changedById: actor.id },
    });
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(dto: CreateEnquiryDto, actor: AuthenticatedUser, context: RequestContext) {
    // Inactive customers are refused unless the user may use them (Module 3 rule).
    const customer = await this.customersService.assertSelectableForTransaction(dto.customerId, actor);
    await this.assertContactOfCustomer(dto.customerId, dto.customerContactId);
    await this.assertSourceUsable(dto.sourceId);
    await this.assertAssignableUser(dto.assignedToId);
    await this.validateItems(dto.items, actor);

    const status = dto.assignedToId ? EnquiryStatus.ASSIGNED : EnquiryStatus.NEW;

    return this.prisma.$transaction(async (tx) => {
      const enquiryNumber = await this.numberingService.allocate(SEQUENCE_KEYS.ENQUIRY, tx);
      const enquiry = await tx.enquiry.create({
        data: {
          enquiryNumber,
          enquiryDate: dto.enquiryDate ? dateOnly(dto.enquiryDate) : todayUtc(),
          status,
          priority: dto.priority,
          customerId: dto.customerId,
          customerContactId: dto.customerContactId ?? null,
          sourceId: dto.sourceId ?? null,
          assignedToId: dto.assignedToId ?? null,
          description: cleanOptional(dto.description) ?? null,
          internalRemarks: cleanOptional(dto.internalRemarks) ?? null,
          expectedDecisionDate: dto.expectedDecisionDate ? dateOnly(dto.expectedDecisionDate) : null,
          expectedBudget: dto.expectedBudget ?? null,
          currency: dto.currency ?? 'INR',
          expectedDeliveryTimeline: cleanOptional(dto.expectedDeliveryTimeline) ?? null,
          paymentPreference: cleanOptional(dto.paymentPreference) ?? null,
          commercialNotes: cleanOptional(dto.commercialNotes) ?? null,
          nextFollowUpDate: dto.nextFollowUpDate ? dateOnly(dto.nextFollowUpDate) : null,
          createdById: actor.id,
          updatedById: actor.id,
          items: { create: dto.items.map((item, i) => this.itemData(item, i)) },
        },
        select: { id: true, enquiryNumber: true },
      });
      await this.recordStatus(tx, enquiry.id, null, status, actor, 'Enquiry created');
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'enquiry.create',
          entityType: ENQUIRY_ENTITY,
          entityId: enquiry.id,
          summary: `Created enquiry ${enquiry.enquiryNumber} for ${customer.name} (${customer.customerCode}) with ${dto.items.length} product(s)`,
          after: { customerId: dto.customerId, status, priority: dto.priority ?? 'NORMAL', assignedToId: dto.assignedToId ?? null, items: dto.items.length },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return enquiry;
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findAll(query: QueryEnquiriesDto) {
    const where = this.buildWhere(query);
    const orderBy: Prisma.EnquiryOrderByWithRelationInput[] =
      query.sortBy === 'nextFollowUpDate'
        ? [{ nextFollowUpDate: { sort: query.sortDir, nulls: 'last' } }, { id: 'asc' }]
        : [{ [query.sortBy]: query.sortDir }, { id: 'asc' }];
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.enquiry.findMany({ where, select: listSelect, orderBy, skip: query.skip, take: query.take }),
      this.prisma.enquiry.count({ where }),
    ]);
    // The customer's primary contact stands in when no contact was chosen.
    const customerIds = [...new Set(items.filter((e) => !e.customerContact).map((e) => e.customer.id))];
    const primaries = customerIds.length
      ? await this.prisma.customerContact.findMany({
          where: { customerId: { in: customerIds }, isPrimary: true },
          select: { customerId: true, id: true, name: true, phone: true, email: true },
        })
      : [];
    const rows = items.map((e) => ({
      ...e,
      contact: e.customerContact ?? primaries.find((p) => p.customerId === e.customer.id) ?? null,
    }));
    return buildPaginatedResult(rows, totalItems, query.page, query.pageSize);
  }

  private buildWhere(query: QueryEnquiriesDto): Prisma.EnquiryWhereInput {
    const and: Prisma.EnquiryWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.priority) and.push({ priority: query.priority });
    if (query.sourceId) and.push({ sourceId: query.sourceId });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.productId) and.push({ items: { some: { productId: query.productId } } });
    if (query.dateFrom) and.push({ enquiryDate: { gte: dateOnly(query.dateFrom) } });
    if (query.dateTo) and.push({ enquiryDate: { lte: dateOnly(query.dateTo) } });
    if (query.overdueOnly) and.push({ nextFollowUpDate: { lt: todayUtc() }, status: { notIn: [...LOCKED_STATUSES] } });
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      const digits = query.search.replace(/\D/g, '');
      const phone = { contains: digits.length >= 4 ? digits : query.search };
      and.push({
        OR: [
          { enquiryNumber: text },
          { description: text },
          { customer: { OR: [{ name: text }, { normalizedName: { contains: normalizeName(query.search) } }, { customerCode: text }] } },
          { customer: { contacts: { some: { OR: [{ name: text }, { email: text }, { phone }] } } } },
          { items: { some: { OR: [{ product: { name: text } }, { product: { productCode: text } }, { productModel: { modelName: text } }, { productModel: { modelNumber: text } }] } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  async summary() {
    const count = (status: EnquiryStatus[]) => this.prisma.enquiry.count({ where: { status: { in: status } } });
    const [total, fresh, inProgress, followUpPending, quotationPending, converted, lostClosed, onHold, overdue] = await this.prisma.$transaction([
      this.prisma.enquiry.count(),
      count([EnquiryStatus.NEW]),
      count([EnquiryStatus.ASSIGNED, EnquiryStatus.IN_PROGRESS, EnquiryStatus.REQUIREMENT_CLARIFICATION]),
      count([EnquiryStatus.FOLLOW_UP_PENDING]),
      count([EnquiryStatus.READY_FOR_QUOTATION]),
      count([EnquiryStatus.CONVERTED]),
      count([EnquiryStatus.LOST, EnquiryStatus.CLOSED]),
      count([EnquiryStatus.ON_HOLD]),
      this.prisma.enquiry.count({ where: { nextFollowUpDate: { lt: todayUtc() }, status: { notIn: [...LOCKED_STATUSES] } } }),
    ]);
    return { total, new: fresh, inProgress, followUpPending, quotationPending, converted, lostClosed, onHold, overdueFollowUps: overdue, generatedAt: new Date().toISOString() };
  }

  async findOne(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, include: detailInclude });
    if (!enquiry) throw new NotFoundException(`Enquiry ${id} was not found`);
    return enquiry;
  }

  async findAllForExport(query: QueryEnquiriesDto) {
    return this.prisma.enquiry.findMany({
      where: this.buildWhere(query),
      select: {
        ...listSelect,
        expectedDecisionDate: true,
        expectedBudget: true,
        currency: true,
        items: { select: { quantity: true, unit: true, product: { select: { name: true } }, productModel: { select: { modelName: true } } } },
      },
      orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
      take: 5000,
    });
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = {
      OR: [{ entityType: ENQUIRY_ENTITY, entityId: id }, { parentEntityType: ENQUIRY_ENTITY, parentEntityId: id }],
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true, actor: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, pagination.page, pagination.pageSize);
  }

  /** Active users who can be assigned (the existing users table; no employee master). */
  async assignableUsers() {
    return this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE, archivedAt: null },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Update / assign / status / delete
  // -------------------------------------------------------------------------

  async update(id: string, dto: UpdateEnquiryDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadEditable(id);
    const customerId = dto.customerId ?? existing.customerId;
    if (dto.customerId && dto.customerId !== existing.customerId) {
      await this.customersService.assertSelectableForTransaction(dto.customerId, actor);
    }
    const contactId = dto.customerContactId !== undefined ? dto.customerContactId || null : dto.customerId ? null : existing.customerContactId;
    await this.assertContactOfCustomer(customerId, contactId);
    // Only a newly chosen source must be active; an enquiry keeps the source
    // it was recorded with even after that source is deactivated.
    if (dto.sourceId && dto.sourceId !== existing.sourceId) await this.assertSourceUsable(dto.sourceId);

    const data: Prisma.EnquiryUncheckedUpdateInput = { updatedById: actor.id, customerId, customerContactId: contactId };
    if (dto.enquiryDate) data.enquiryDate = dateOnly(dto.enquiryDate);
    if (dto.priority) data.priority = dto.priority;
    if (dto.sourceId !== undefined) data.sourceId = dto.sourceId || null;
    if (dto.description !== undefined) data.description = cleanOptional(dto.description) ?? null;
    if (dto.internalRemarks !== undefined) data.internalRemarks = cleanOptional(dto.internalRemarks) ?? null;
    if (dto.expectedDecisionDate !== undefined) data.expectedDecisionDate = dto.expectedDecisionDate ? dateOnly(dto.expectedDecisionDate) : null;
    if (dto.expectedBudget !== undefined) data.expectedBudget = dto.expectedBudget ?? null;
    if (dto.currency) data.currency = dto.currency;
    if (dto.expectedDeliveryTimeline !== undefined) data.expectedDeliveryTimeline = cleanOptional(dto.expectedDeliveryTimeline) ?? null;
    if (dto.paymentPreference !== undefined) data.paymentPreference = cleanOptional(dto.paymentPreference) ?? null;
    if (dto.commercialNotes !== undefined) data.commercialNotes = cleanOptional(dto.commercialNotes) ?? null;
    if (dto.nextFollowUpDate !== undefined) data.nextFollowUpDate = dto.nextFollowUpDate ? dateOnly(dto.nextFollowUpDate) : null;

    const keys = ['customerId', 'customerContactId', 'enquiryDate', 'priority', 'sourceId', 'description', 'internalRemarks', 'expectedDecisionDate', 'expectedBudget', 'currency', 'expectedDeliveryTimeline', 'paymentPreference', 'commercialNotes', 'nextFollowUpDate'] as const;
    const snap = (e: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, e[k] instanceof Date ? (e[k] as Date).toISOString().slice(0, 10) : e[k] === null || e[k] === undefined ? null : String(e[k])]));

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enquiry.update({ where: { id }, data });
      const before = snap(existing);
      const after = snap(updated);
      const changed = keys.filter((k) => before[k] !== after[k]);
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: changed.includes('priority') ? 'enquiry.update.priority' : 'enquiry.update',
          entityType: ENQUIRY_ENTITY,
          entityId: id,
          summary: changed.length
            ? `Updated ${changed.join(', ')}${changed.includes('priority') ? ` (priority ${existing.priority} → ${updated.priority})` : ''}${changed.includes('customerId') ? ' (customer changed)' : ''}`
            : 'Saved without changes',
          before,
          after,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  /** Assignment; assigning a NEW enquiry moves it to ASSIGNED. */
  async assign(id: string, dto: AssignEnquiryDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadEditable(id);
    const assignedToId = dto.assignedToId ?? null;
    await this.assertAssignableUser(assignedToId);
    if (existing.assignedToId === assignedToId) throw new BadRequestException('The enquiry is already assigned to this employee.');

    return this.prisma.$transaction(async (tx) => {
      const nextStatus = existing.status === EnquiryStatus.NEW && assignedToId ? EnquiryStatus.ASSIGNED : existing.status;
      const updated = await tx.enquiry.update({ where: { id }, data: { assignedToId, status: nextStatus, updatedById: actor.id }, include: { assignedTo: userSelect } });
      if (nextStatus !== existing.status) await this.recordStatus(tx, id, existing.status, nextStatus, actor, 'Assigned to an employee');
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'enquiry.assign',
          entityType: ENQUIRY_ENTITY,
          entityId: id,
          summary: assignedToId ? `Assigned to ${updated.assignedTo?.fullName}` : 'Unassigned',
          before: { assignedToId: existing.assignedToId },
          after: { assignedToId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  async changeStatus(id: string, dto: ChangeStatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.enquiry.findUnique({ where: { id }, select: { id: true, status: true, enquiryNumber: true } });
    if (!existing) throw new NotFoundException(`Enquiry ${id} was not found`);
    if (dto.status === EnquiryStatus.CONVERTED) {
      throw new BadRequestException('An enquiry becomes Converted only when a quotation is created from it in Quotation Management.');
    }
    if (!STATUS_TRANSITIONS[existing.status].includes(dto.status)) {
      throw new BadRequestException(`An enquiry cannot move from ${label(existing.status)} to ${label(dto.status)}.`);
    }
    if (reasonRequired(existing.status, dto.status) && !dto.reason) {
      throw new BadRequestException(`Give a reason for moving the enquiry to ${label(dto.status)}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Guarded on the previous status, so two simultaneous changes cannot both apply.
      const result = await tx.enquiry.updateMany({ where: { id, status: existing.status }, data: { status: dto.status, updatedById: actor.id } });
      if (result.count === 0) throw new ConflictException('The enquiry status changed in the meantime. Reload and try again.');
      await this.recordStatus(tx, id, existing.status, dto.status, actor, dto.reason);
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: dto.status === EnquiryStatus.CLOSED || dto.status === EnquiryStatus.LOST ? 'enquiry.close' : 'enquiry.status',
          entityType: ENQUIRY_ENTITY,
          entityId: id,
          summary: `Status ${label(existing.status)} → ${label(dto.status)}${dto.reason ? `: ${dto.reason}` : ''}`,
          before: { status: existing.status },
          after: { status: dto.status, reason: dto.reason ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return { id, status: dto.status };
    });
  }

  /**
   * Delete only an enquiry with no history (created by mistake): not
   * converted, no follow-ups and no attachments. Customer and products are
   * never touched.
   */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    const existing = await this.prisma.enquiry.findUnique({
      where: { id },
      include: { _count: { select: { followUps: true, documents: true, items: true } } },
    });
    if (!existing) throw new NotFoundException(`Enquiry ${id} was not found`);
    const blocking: Record<string, number> = {};
    if (existing.convertedAt) blocking.quotations = 1;
    if (existing._count.followUps) blocking.followUps = existing._count.followUps;
    if (existing._count.documents) blocking.attachments = existing._count.documents;
    if (Object.keys(blocking).length) {
      throw new ConflictException({
        message: 'This enquiry has history (follow-ups, attachments or a quotation) and cannot be deleted. Close it instead.',
        details: blocking,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiry.delete({ where: { id } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'enquiry.delete',
          entityType: ENQUIRY_ENTITY,
          entityId: id,
          summary: `Deleted enquiry ${existing.enquiryNumber} (${existing._count.items} item(s))`,
          before: { enquiryNumber: existing.enquiryNumber, customerId: existing.customerId, status: existing.status },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Quotation hand-off (Module 5 integration point)
  // -------------------------------------------------------------------------

  /**
   * Validates that an enquiry can become a quotation and returns everything
   * Quotation Management needs to pre-fill one. Creates nothing.
   */
  async conversionHandoff(id: string, actor: AuthenticatedUser) {
    const enquiry = await this.findOne(id);
    const problems: string[] = [];
    if (enquiry.convertedAt) problems.push(`Already converted on ${enquiry.convertedAt.toISOString().slice(0, 10)}.`);
    if (LOCKED_STATUSES.includes(enquiry.status) && !enquiry.convertedAt) problems.push(`The enquiry is ${label(enquiry.status)}.`);
    try {
      await this.customersService.assertSelectableForTransaction(enquiry.customerId, actor);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : 'The customer cannot be used.');
    }
    if (enquiry.items.length === 0) problems.push('The enquiry has no product requirements.');
    for (const [index, item] of enquiry.items.entries()) {
      try {
        await this.productsService.assertSelectableForTransaction(item.productId, item.productModelId, actor);
      } catch (error) {
        problems.push(`Item ${index + 1}: ${error instanceof Error ? error.message : 'invalid product'}`);
      }
    }

    return {
      ready: problems.length === 0,
      problems,
      enquiryId: enquiry.id,
      enquiryNumber: enquiry.enquiryNumber,
      customerId: enquiry.customerId,
      customerContactId: enquiry.customerContactId,
      currency: enquiry.currency,
      items: enquiry.items.map((item) => ({
        enquiryItemId: item.id,
        productId: item.productId,
        productModelId: item.productModelId,
        quantity: item.quantity,
        unit: item.unit,
        technicalRequirements: item.technicalRequirements,
      })),
      quotationModuleAvailable: true,
    };
  }

  /**
   * To be called by Quotation Management inside the transaction that creates
   * the quotation. The guarded update makes conversion happen exactly once,
   * so repeated clicks or retried requests cannot convert twice.
   */
  async markConverted(tx: Prisma.TransactionClient, enquiryId: string, quotationReference: string, actor: AuthenticatedUser) {
    const current = await tx.enquiry.findUnique({ where: { id: enquiryId }, select: { status: true } });
    if (!current) throw new NotFoundException(`Enquiry ${enquiryId} was not found`);
    const result = await tx.enquiry.updateMany({
      where: { id: enquiryId, convertedAt: null, status: { notIn: [EnquiryStatus.LOST, EnquiryStatus.CLOSED] } },
      data: { status: EnquiryStatus.CONVERTED, convertedAt: new Date(), convertedById: actor.id, convertedReference: quotationReference },
    });
    if (result.count === 0) throw new ConflictException('This enquiry has already been converted or is closed.');
    await this.recordStatus(tx, enquiryId, current.status, EnquiryStatus.CONVERTED, actor, `Quotation ${quotationReference}`);
    await this.auditService.record(
      { actorUserId: actor.id, action: 'enquiry.convert', entityType: ENQUIRY_ENTITY, entityId: enquiryId, summary: `Converted to quotation ${quotationReference}` },
      tx,
    );
  }

  /**
   * Undoes a conversion when its quotation is deleted before it was ever
   * issued (Quotation Management calls this inside the delete transaction).
   * The enquiry returns to Ready for Quotation so it can be converted again.
   */
  async revertConversion(tx: Prisma.TransactionClient, enquiryId: string, quotationReference: string, actor: AuthenticatedUser) {
    const result = await tx.enquiry.updateMany({
      where: { id: enquiryId, status: EnquiryStatus.CONVERTED, convertedReference: quotationReference },
      data: { status: EnquiryStatus.READY_FOR_QUOTATION, convertedAt: null, convertedById: null, convertedReference: null },
    });
    if (result.count === 0) return;
    await this.recordStatus(tx, enquiryId, EnquiryStatus.CONVERTED, EnquiryStatus.READY_FOR_QUOTATION, actor, `Draft quotation ${quotationReference} deleted`);
    await this.auditService.record(
      { actorUserId: actor.id, action: 'enquiry.conversion.revert', entityType: ENQUIRY_ENTITY, entityId: enquiryId, summary: `Conversion reverted: draft quotation ${quotationReference} was deleted` },
      tx,
    );
  }

  // -------------------------------------------------------------------------
  // Sources (configurable)
  // -------------------------------------------------------------------------

  listSources(includeInactive: boolean) {
    return this.prisma.enquirySource.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { enquiries: true } } },
    });
  }

  async createSource(dto: EnquirySourceDto, actor: AuthenticatedUser) {
    const normalizedName = normalizeName(dto.name);
    const clash = await this.prisma.enquirySource.findUnique({ where: { normalizedName } });
    if (clash) throw new ConflictException(`The source "${clash.name}" already exists.`);
    const source = await this.prisma.enquirySource.create({ data: { name: dto.name, normalizedName, description: cleanOptional(dto.description) ?? null } });
    await this.auditService.record({ actorUserId: actor.id, action: 'enquiry_source.create', entityType: 'EnquirySource', entityId: source.id, summary: `Created enquiry source ${source.name}` });
    return source;
  }

  async updateSource(id: string, dto: UpdateEnquirySourceDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.enquirySource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Source ${id} was not found`);
    if (dto.name && normalizeName(dto.name) !== existing.normalizedName) {
      const clash = await this.prisma.enquirySource.findUnique({ where: { normalizedName: normalizeName(dto.name) } });
      if (clash) throw new ConflictException(`The source "${clash.name}" already exists.`);
    }
    const updated = await this.prisma.enquirySource.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name, normalizedName: normalizeName(dto.name) } : {}),
        ...(dto.description !== undefined ? { description: cleanOptional(dto.description) ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'enquiry_source.update',
      entityType: 'EnquirySource',
      entityId: id,
      summary: `Updated enquiry source ${updated.name}`,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: updated.name, isActive: updated.isActive },
    });
    return updated;
  }

  async assertExists(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id }, select: { id: true, status: true, customerId: true } });
    if (!enquiry) throw new NotFoundException(`Enquiry ${id} was not found`);
    return enquiry;
  }
}

export function label(status: EnquiryStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}
