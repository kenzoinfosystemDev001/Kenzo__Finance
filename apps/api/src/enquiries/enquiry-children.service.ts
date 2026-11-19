import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { buildPaginatedResult } from '../common/dto/pagination.dto';
import { cleanOptional } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  ENQUIRY_DOCUMENT_KINDS,
  type EnquiryDocumentKind,
  type EnquiryItemInputDto,
  type FollowUpInputDto,
  type FollowUpQueryDto,
  type UpdateEnquiryItemDto,
  type UpdateFollowUpDto,
} from './dto/enquiry.dto';
import { ENQUIRY_ENTITY, EnquiriesService } from './enquiries.service';
import { dateOnly, OPEN_STATUSES, todayUtc } from './enquiry-rules';

const userSelect = { select: { id: true, fullName: true } } as const;

/**
 * Items, follow-ups and attachments of an enquiry. Every write is audited
 * with the enquiry as parent so it shows in the enquiry's activity history.
 */
@Injectable()
export class EnquiryChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly enquiries: EnquiriesService,
  ) {}

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    context: RequestContext | null,
    enquiryId: string,
    entry: { action: string; entityType: string; entityId: string; summary: string; before?: unknown; after?: unknown },
  ) {
    return this.auditService.record(
      {
        ...entry,
        actorUserId: actor.id,
        parentEntityType: ENQUIRY_ENTITY,
        parentEntityId: enquiryId,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
      tx,
    );
  }

  private async describeItem(productId: string, modelId: string | null) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
    const model = modelId ? await this.prisma.productModel.findUnique({ where: { id: modelId }, select: { modelName: true } }) : null;
    return `${product?.name ?? 'product'}${model ? ` - ${model.modelName}` : ''}`;
  }

  // -------------------------------------------------------------------------
  // Items (existing products / models only)
  // -------------------------------------------------------------------------

  async listItems(enquiryId: string) {
    await this.enquiries.assertExists(enquiryId);
    return this.prisma.enquiryItem.findMany({
      where: { enquiryId },
      include: {
        product: { select: { id: true, productCode: true, name: true, company: { select: { name: true } } } },
        productModel: { select: { id: true, modelName: true, modelNumber: true, specifications: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async addItem(enquiryId: string, dto: EnquiryItemInputDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.enquiries.loadEditable(enquiryId);
    await this.enquiries.validateItems([dto], actor);
    const label = await this.describeItem(dto.productId, dto.productModelId ?? null);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.enquiryItem.findFirst({ where: { enquiryId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
      const item = await tx.enquiryItem.create({ data: { enquiryId, ...this.enquiries.itemData(dto, (last?.sortOrder ?? -1) + 1) } });
      await tx.enquiry.update({ where: { id: enquiryId }, data: { updatedById: actor.id } });
      await this.audit(tx, actor, context, enquiryId, {
        action: 'enquiry.item.add',
        entityType: 'EnquiryItem',
        entityId: item.id,
        summary: `Added ${label} × ${item.quantity} ${item.unit}`,
        after: { productId: item.productId, productModelId: item.productModelId, quantity: item.quantity, unit: item.unit },
      });
      return item;
    });
  }

  async updateItem(itemId: string, dto: UpdateEnquiryItemDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.enquiryItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundException('Enquiry item was not found.');
    await this.enquiries.loadEditable(existing.enquiryId);

    const merged: EnquiryItemInputDto = {
      productId: dto.productId ?? existing.productId,
      productModelId: dto.productId && dto.productId !== existing.productId ? dto.productModelId : dto.productModelId !== undefined ? dto.productModelId : existing.productModelId ?? undefined,
      quantity: dto.quantity ?? existing.quantity,
      unit: dto.unit !== undefined ? dto.unit : existing.unit,
      technicalRequirements: dto.technicalRequirements !== undefined ? dto.technicalRequirements : existing.technicalRequirements ?? undefined,
      remarks: dto.remarks !== undefined ? dto.remarks : existing.remarks ?? undefined,
    };
    if (merged.productId !== existing.productId || (merged.productModelId ?? null) !== existing.productModelId) {
      await this.enquiries.validateItems([merged], actor);
    }
    const label = await this.describeItem(merged.productId, merged.productModelId ?? null);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enquiryItem.update({ where: { id: itemId }, data: this.enquiries.itemData(merged, existing.sortOrder) });
      await tx.enquiry.update({ where: { id: existing.enquiryId }, data: { updatedById: actor.id } });
      await this.audit(tx, actor, context, existing.enquiryId, {
        action: 'enquiry.item.update',
        entityType: 'EnquiryItem',
        entityId: itemId,
        summary: `Updated ${label}`,
        before: { productId: existing.productId, productModelId: existing.productModelId, quantity: existing.quantity, unit: existing.unit, technicalRequirements: existing.technicalRequirements, remarks: existing.remarks },
        after: { productId: updated.productId, productModelId: updated.productModelId, quantity: updated.quantity, unit: updated.unit, technicalRequirements: updated.technicalRequirements, remarks: updated.remarks },
      });
      return updated;
    });
  }

  async removeItem(itemId: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.enquiryItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundException('Enquiry item was not found.');
    await this.enquiries.loadEditable(existing.enquiryId);
    const remaining = await this.prisma.enquiryItem.count({ where: { enquiryId: existing.enquiryId } });
    if (remaining <= 1) throw new BadRequestException('An enquiry needs at least one product requirement.');
    const label = await this.describeItem(existing.productId, existing.productModelId);
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiryItem.delete({ where: { id: itemId } });
      await this.audit(tx, actor, context, existing.enquiryId, {
        action: 'enquiry.item.remove',
        entityType: 'EnquiryItem',
        entityId: itemId,
        summary: `Removed ${label}`,
        before: { productId: existing.productId, productModelId: existing.productModelId, quantity: existing.quantity },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Follow-ups
  // -------------------------------------------------------------------------

  /** Keeps enquiry.nextFollowUpDate equal to the latest follow-up's plan. */
  private async syncNextFollowUp(tx: Prisma.TransactionClient, enquiryId: string) {
    const latest = await tx.enquiryFollowUp.findFirst({
      where: { enquiryId },
      orderBy: [{ followUpDate: 'desc' }, { createdAt: 'desc' }],
      select: { nextFollowUpDate: true },
    });
    if (latest) await tx.enquiry.update({ where: { id: enquiryId }, data: { nextFollowUpDate: latest.nextFollowUpDate } });
  }

  private async validateFollowUp(enquiryId: string, customerId: string, dto: Partial<FollowUpInputDto>) {
    await this.enquiries.assertContactOfCustomer(customerId, dto.contactId);
    await this.enquiries.assertAssignableUser(dto.assignedToId);
    if (dto.followUpDate && new Date(dto.followUpDate) > new Date(Date.now() + 5 * 60 * 1000)) {
      throw new BadRequestException('A follow-up records an interaction that happened; its date cannot be in the future. Use the next follow-up date to plan one.');
    }
    if (dto.nextFollowUpDate && dto.followUpDate && dateOnly(dto.nextFollowUpDate) < dateOnly(dto.followUpDate)) {
      throw new BadRequestException('The next follow-up date cannot be before this follow-up.');
    }
  }

  async listFollowUps(enquiryId: string) {
    await this.enquiries.assertExists(enquiryId);
    return this.prisma.enquiryFollowUp.findMany({
      where: { enquiryId },
      include: { contact: { select: { id: true, name: true } }, assignedTo: userSelect, createdBy: userSelect },
      orderBy: [{ followUpDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addFollowUp(enquiryId: string, dto: FollowUpInputDto, actor: AuthenticatedUser, context: RequestContext) {
    const enquiry = await this.enquiries.assertExists(enquiryId);
    if (enquiry.status === 'CONVERTED') throw new BadRequestException('This enquiry has been converted; record follow-ups on the quotation instead.');
    await this.validateFollowUp(enquiryId, enquiry.customerId, dto);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.enquiryFollowUp.create({
        data: {
          enquiryId,
          contactId: dto.contactId ?? null,
          followUpDate: new Date(dto.followUpDate),
          method: dto.method,
          discussionSummary: dto.discussionSummary,
          customerResponse: cleanOptional(dto.customerResponse) ?? null,
          outcome: dto.outcome,
          nextFollowUpDate: dto.nextFollowUpDate ? dateOnly(dto.nextFollowUpDate) : null,
          assignedToId: dto.assignedToId ?? null,
          internalNotes: cleanOptional(dto.internalNotes) ?? null,
          createdById: actor.id,
        },
      });
      await this.syncNextFollowUp(tx, enquiryId);
      await this.audit(tx, actor, context, enquiryId, {
        action: 'enquiry.followup.create',
        entityType: 'EnquiryFollowUp',
        entityId: followUp.id,
        summary: `Follow-up by ${dto.method.toLowerCase()}: ${dto.outcome.toLowerCase().replace(/_/g, ' ')}${dto.nextFollowUpDate ? ` · next on ${dto.nextFollowUpDate.slice(0, 10)}` : ''}`,
        after: { followUpDate: dto.followUpDate, method: dto.method, outcome: dto.outcome, nextFollowUpDate: dto.nextFollowUpDate ?? null },
      });
      return followUp;
    });
  }

  /** Edits keep the full previous values in the audit trail (never silent). */
  async updateFollowUp(followUpId: string, dto: UpdateFollowUpDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.enquiryFollowUp.findUnique({ where: { id: followUpId }, include: { enquiry: { select: { customerId: true } } } });
    if (!existing) throw new NotFoundException('Follow-up was not found.');
    if (dto.discussionSummary !== undefined && !dto.discussionSummary?.trim()) throw new BadRequestException('Discussion summary is required.');
    await this.validateFollowUp(existing.enquiryId, existing.enquiry.customerId, {
      ...dto,
      followUpDate: dto.followUpDate ?? existing.followUpDate.toISOString(),
    });
    const { enquiry: _enquiry, ...before } = existing;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enquiryFollowUp.update({
        where: { id: followUpId },
        data: {
          ...(dto.followUpDate ? { followUpDate: new Date(dto.followUpDate) } : {}),
          ...(dto.contactId !== undefined ? { contactId: dto.contactId || null } : {}),
          ...(dto.method ? { method: dto.method } : {}),
          ...(dto.discussionSummary ? { discussionSummary: dto.discussionSummary } : {}),
          ...(dto.customerResponse !== undefined ? { customerResponse: cleanOptional(dto.customerResponse) ?? null } : {}),
          ...(dto.outcome ? { outcome: dto.outcome } : {}),
          ...(dto.nextFollowUpDate !== undefined ? { nextFollowUpDate: dto.nextFollowUpDate ? dateOnly(dto.nextFollowUpDate) : null } : {}),
          ...(dto.assignedToId !== undefined ? { assignedToId: dto.assignedToId || null } : {}),
          ...(dto.internalNotes !== undefined ? { internalNotes: cleanOptional(dto.internalNotes) ?? null } : {}),
        },
      });
      await this.syncNextFollowUp(tx, existing.enquiryId);
      await this.audit(tx, actor, context, existing.enquiryId, {
        action: 'enquiry.followup.update',
        entityType: 'EnquiryFollowUp',
        entityId: followUpId,
        summary: `Edited follow-up of ${existing.followUpDate.toISOString().slice(0, 10)}`,
        before,
        after: updated,
      });
      return updated;
    });
  }

  async removeFollowUp(followUpId: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.enquiryFollowUp.findUnique({ where: { id: followUpId } });
    if (!existing) throw new NotFoundException('Follow-up was not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiryFollowUp.delete({ where: { id: followUpId } });
      await this.syncNextFollowUp(tx, existing.enquiryId);
      await this.audit(tx, actor, context, existing.enquiryId, {
        action: 'enquiry.followup.delete',
        entityType: 'EnquiryFollowUp',
        entityId: followUpId,
        summary: `Removed follow-up of ${existing.followUpDate.toISOString().slice(0, 10)}`,
        before: existing,
      });
    });
  }

  /**
   * Follow-up dashboard. Today / upcoming / overdue are open enquiries by
   * their planned next follow-up date; completed lists recorded follow-ups.
   */
  async followUpBoard(query: FollowUpQueryDto) {
    const today = todayUtc();
    const view = query.view ?? 'today';

    if (view === 'completed') {
      const where: Prisma.EnquiryFollowUpWhereInput = {
        ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
        ...(query.customerId ? { enquiry: { customerId: query.customerId } } : {}),
        ...(query.dateFrom || query.dateTo
          ? { followUpDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lt: new Date(dateOnly(query.dateTo).getTime() + 86_400_000) } : {}) } }
          : {}),
      };
      const [items, totalItems] = await this.prisma.$transaction([
        this.prisma.enquiryFollowUp.findMany({
          where,
          include: {
            enquiry: { select: { id: true, enquiryNumber: true, status: true, customer: { select: { id: true, name: true } } } },
            contact: { select: { name: true } },
            assignedTo: userSelect,
            createdBy: userSelect,
          },
          orderBy: { followUpDate: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.enquiryFollowUp.count({ where }),
      ]);
      return { view, ...buildPaginatedResult(items, totalItems, query.page, query.pageSize) };
    }

    const tomorrow = new Date(today.getTime() + 86_400_000);
    const dateFilter: Prisma.DateTimeNullableFilter =
      view === 'today' ? { gte: today, lt: tomorrow } : view === 'overdue' ? { lt: today } : { gte: tomorrow };
    if (query.dateFrom) dateFilter.gte = dateOnly(query.dateFrom);
    if (query.dateTo) dateFilter.lte = dateOnly(query.dateTo);

    const where: Prisma.EnquiryWhereInput = {
      status: { in: OPEN_STATUSES },
      nextFollowUpDate: dateFilter,
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.enquiry.findMany({
        where,
        select: {
          id: true,
          enquiryNumber: true,
          status: true,
          priority: true,
          nextFollowUpDate: true,
          customer: { select: { id: true, name: true } },
          customerContact: { select: { name: true, phone: true } },
          assignedTo: userSelect,
          followUps: { orderBy: { followUpDate: 'desc' }, take: 1, select: { followUpDate: true, outcome: true, discussionSummary: true } },
        },
        orderBy: [{ nextFollowUpDate: 'asc' }, { priority: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.enquiry.count({ where }),
    ]);
    return { view, ...buildPaginatedResult(items, totalItems, query.page, query.pageSize) };
  }

  async followUpCounts(assignedToId?: string) {
    const today = todayUtc();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const base = { status: { in: OPEN_STATUSES }, ...(assignedToId ? { assignedToId } : {}) };
    const [todayCount, upcoming, overdue, completed] = await this.prisma.$transaction([
      this.prisma.enquiry.count({ where: { ...base, nextFollowUpDate: { gte: today, lt: tomorrow } } }),
      this.prisma.enquiry.count({ where: { ...base, nextFollowUpDate: { gte: tomorrow } } }),
      this.prisma.enquiry.count({ where: { ...base, nextFollowUpDate: { lt: today } } }),
      this.prisma.enquiryFollowUp.count({ where: assignedToId ? { assignedToId } : {} }),
    ]);
    return { today: todayCount, upcoming, overdue, completed };
  }

  // -------------------------------------------------------------------------
  // Attachments (shared private document store)
  // -------------------------------------------------------------------------

  async listDocuments(enquiryId: string) {
    await this.enquiries.assertExists(enquiryId);
    return this.prisma.document.findMany({
      where: { enquiryId, archivedAt: null },
      select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(enquiryId: string, file: { buffer: Buffer; originalname: string } | undefined, kind: EnquiryDocumentKind | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.enquiries.assertExists(enquiryId);
    return this.documentsService.upload({ buffer: file.buffer, originalFilename: file.originalname, kind: kind ?? DocumentKind.ENQUIRY_OTHER, enquiryId }, actor);
  }

  async replaceDocument(enquiryId: string, documentId: string, file: { buffer: Buffer; originalname: string } | undefined, kind: EnquiryDocumentKind | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const current = await this.assertOwned(enquiryId, documentId);
    return this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: kind ?? current.kind, enquiryId, replacesDocumentId: current.id },
      actor,
    );
  }

  async removeDocument(enquiryId: string, documentId: string, actor: AuthenticatedUser) {
    await this.assertOwned(enquiryId, documentId);
    return this.documentsService.archive(documentId, actor);
  }

  async openDocument(enquiryId: string, documentId: string, actor: AuthenticatedUser, preview: boolean) {
    await this.assertOwned(enquiryId, documentId);
    return this.documentsService.openForDownload(documentId, actor, { preview });
  }

  private async assertOwned(enquiryId: string, documentId: string) {
    const document = await this.documentsService.findActive(documentId);
    if (document.enquiryId !== enquiryId || !(ENQUIRY_DOCUMENT_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document as typeof document & { kind: EnquiryDocumentKind };
  }
}

