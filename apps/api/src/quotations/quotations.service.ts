import { businessDayEnd, businessDayStart } from '../common/utils/business-date';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { CustomersService } from '../customers/customers.service';
import { ProductsService } from '../products/products.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { BRANDING_SETTING_KEYS, SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { buildPaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { cleanMultiline, cleanOptional, normalizeName, normalizedNameFilter } from '../common/utils/normalize';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  CommunicationDto,
  CompanyProfileDto,
  CreateQuotationDto,
  QueryQuotationsDto,
  QuotationItemInputDto,
  RevisionContentDto,
  StatusActionDto,
  UpdateDraftDto,
} from './dto/quotation.dto';
import { calculateLine, calculateTotals } from './quotation-calc';
import { dateOnly, FINAL, label, REMARKS_REQUIRED, REVISABLE, todayUtc, TRANSITIONS } from './quotation-rules';
import { readSpecifications } from '../products/product-specs';
import { QuotationPdfService } from './quotation-pdf.service';

export const QUOTATION_ENTITY = 'Quotation';
/** Statuses in which the validity date still matters. */
const OPEN_STATUSES: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.APPROVED,
  QuotationStatus.SENT,
  QuotationStatus.UNDER_NEGOTIATION,
];
const userSelect = { select: { id: true, fullName: true } } as const;

const revisionInclude = {
  items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  createdBy: userSelect,
  pdfDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
} satisfies Prisma.QuotationRevisionInclude;

type Tx = Prisma.TransactionClient;

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly customersService: CustomersService,
    private readonly productsService: ProductsService,
    private readonly enquiriesService: EnquiriesService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: QuotationPdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException(`You do not have permission to ${action}.`);
    }
  }

  private audit(tx: Tx | undefined, actor: AuthenticatedUser, context: RequestContext | null, quotationId: string, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.auditService.record(
      {
        actorUserId: actor.id,
        action,
        entityType: QUOTATION_ENTITY,
        entityId: quotationId,
        summary,
        ...extra,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
      tx,
    );
  }

  /** Customer details as of now; stored on the revision and frozen once issued. */
  async customerSnapshot(customerId: string, contactId: string | null, client: Tx | PrismaService = this.prisma) {
    const customer = await client.customer.findUnique({
      where: { id: customerId },
      include: {
        contacts: { where: contactId ? { id: contactId } : { isPrimary: true }, take: 1 },
        addresses: { where: { isDefault: true, addressType: { in: ['BILLING', 'SHIPPING'] } } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found.');
    const pick = (type: 'BILLING' | 'SHIPPING') => {
      const a = customer.addresses.find((x) => x.addressType === type);
      return a ? { addressLine1: a.addressLine1, addressLine2: a.addressLine2, city: a.city, state: a.state, postalCode: a.postalCode, country: a.country } : null;
    };
    const contact = customer.contacts[0];
    return {
      customerCode: customer.customerCode,
      name: customer.name,
      customerType: customer.customerType,
      contactName: contact?.name ?? null,
      contactDesignation: contact?.designation ?? null,
      phone: contact?.phone ?? null,
      email: contact?.email ?? null,
      billingAddress: pick('BILLING'),
      shippingAddress: pick('SHIPPING'),
      taxCountry: customer.taxCountry,
      gstin: customer.gstin,
      pan: customer.pan,
      taxRegistrationNumber: customer.taxRegistrationNumber,
    };
  }

  /**
   * Validates items against the shared catalogue, snapshots product/model
   * details and computes every amount on the server.
   */
  async buildRevisionContent(dto: RevisionContentDto, actor: AuthenticatedUser, enquiryItemIds: Set<string> | null) {
    const lines = [];
    for (const [index, item] of dto.items.entries()) {
      await this.productsService.assertSelectableForTransaction(item.productId, item.productModelId ?? null, actor).catch((error: Error) => {
        throw new BadRequestException(`Item ${index + 1}: ${error.message}`);
      });
      if (item.enquiryItemId && (!enquiryItemIds || !enquiryItemIds.has(item.enquiryItemId))) {
        throw new BadRequestException(`Item ${index + 1}: the referenced enquiry requirement does not belong to this enquiry.`);
      }
      const result = calculateLine(item, index);
      lines.push({ ...item, result });
    }
    const totals = calculateTotals(lines, dto.additionalDiscount, dto.otherCharges);

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const modelIds = dto.items.map((i) => i.productModelId).filter((v): v is string => Boolean(v));
    const [products, models] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, productCode: true, description: true, company: { select: { name: true } } } }),
      this.prisma.productModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, modelName: true, modelNumber: true, description: true, specifications: true } }),
    ]);

    const items = lines.map((line: QuotationItemInputDto & { result: ReturnType<typeof calculateLine> }, index) => {
      const product = products.find((p) => p.id === line.productId)!;
      const model = line.productModelId ? models.find((m) => m.id === line.productModelId) : undefined;
      const specs = model ? readSpecifications(model.specifications) : [];
      return {
        sortOrder: index,
        productId: line.productId,
        productModelId: line.productModelId ?? null,
        enquiryItemId: line.enquiryItemId ?? null,
        productName: product.name,
        productCode: product.productCode,
        brandName: product.company.name,
        modelName: model?.modelName ?? null,
        modelNumber: model?.modelNumber ?? null,
        description: cleanMultiline(line.description) ?? model?.description ?? product.description ?? null,
        specifications: specs.length ? (specs as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        quantity: line.quantity,
        unit: cleanOptional(line.unit) ?? 'Nos',
        unitPrice: new Prisma.Decimal(line.unitPrice),
        discountType: line.discountType ?? 'NONE',
        discountValue: new Prisma.Decimal(line.discountValue ?? 0),
        discountAmount: line.result.discountAmount,
        taxLabel: cleanOptional(line.taxLabel) ?? null,
        taxRate: new Prisma.Decimal(line.taxRate ?? 0),
        taxAmount: line.result.taxAmount,
        lineTotal: line.result.lineTotal,
        remarks: cleanMultiline(line.remarks) ?? null,
      };
    });

    const content = {
      quotationDate: dto.quotationDate ? dateOnly(dto.quotationDate) : todayUtc(),
      validUntil: dto.validUntil ? dateOnly(dto.validUntil) : null,
      termsAndConditions: cleanMultiline(dto.termsAndConditions) ?? null,
      paymentTerms: cleanMultiline(dto.paymentTerms) ?? null,
      deliveryTerms: cleanMultiline(dto.deliveryTerms) ?? null,
      warrantyTerms: cleanMultiline(dto.warrantyTerms) ?? null,
      notes: cleanMultiline(dto.notes) ?? null,
      internalRemarks: cleanMultiline(dto.internalRemarks) ?? null,
      otherChargesLabel: cleanOptional(dto.otherChargesLabel) ?? null,
      subtotal: totals.subtotal,
      itemDiscountTotal: totals.itemDiscountTotal,
      additionalDiscount: totals.additionalDiscount,
      taxableAmount: totals.taxableAmount,
      taxTotal: totals.taxTotal,
      otherCharges: totals.otherCharges,
      grandTotal: totals.grandTotal,
      taxBreakdown: totals.taxBreakdown as unknown as Prisma.InputJsonValue,
    };
    if (content.validUntil && content.validUntil < content.quotationDate) {
      throw new BadRequestException('The validity date cannot be before the quotation date.');
    }
    return { content, items };
  }

  private async lockQuotation(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "quotations" WHERE "id" = ${id}::uuid FOR UPDATE`;
  }

  private async currentRevision(tx: Tx | PrismaService, quotationId: string) {
    const quotation = await tx.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) throw new NotFoundException(`Quotation ${quotationId} was not found`);
    const revision = await tx.quotationRevision.findUnique({
      where: { quotationId_revisionNumber: { quotationId, revisionNumber: quotation.currentRevisionNumber } },
      include: { items: true },
    });
    if (!revision) throw new NotFoundException('Current revision not found.');
    return { quotation, revision };
  }

  private async assertAssignable(userId?: string | null) {
    if (userId) await this.enquiriesService.assertAssignableUser(userId);
  }

  // -------------------------------------------------------------------------
  // Create (from enquiry or manual)
  // -------------------------------------------------------------------------

  /** What the create form pre-fills from an enquiry (Module 4 hand-off). */
  async enquiryConvertData(enquiryId: string, actor: AuthenticatedUser) {
    this.require(actor, PERMISSIONS.QUOTATION_CREATE, 'create quotations');
    // Converting is its own permission (the web shows the button only with
    // it); without this check a user with quotation.create alone could
    // convert any enquiry by opening the create form directly.
    this.require(actor, PERMISSIONS.ENQUIRY_CONVERT, 'convert enquiries');
    const handoff = await this.enquiriesService.conversionHandoff(enquiryId, actor);
    const enquiry = await this.enquiriesService.findOne(enquiryId);
    const defaultTerms = await this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.QUOTATION_DEFAULT_TERMS);
    return {
      ...handoff,
      quotationModuleAvailable: true,
      enquiry: {
        id: enquiry.id,
        enquiryNumber: enquiry.enquiryNumber,
        description: enquiry.description,
        commercialNotes: enquiry.commercialNotes,
        expectedDeliveryTimeline: enquiry.expectedDeliveryTimeline,
        paymentPreference: enquiry.paymentPreference,
        assignedTo: enquiry.assignedTo,
        customer: { id: enquiry.customer.id, name: enquiry.customer.name, customerCode: enquiry.customer.customerCode },
        customerContact: enquiry.customerContact ? { id: enquiry.customerContact.id, name: enquiry.customerContact.name } : null,
        items: enquiry.items,
      },
      defaultTerms: defaultTerms ?? null,
    };
  }

  async create(dto: CreateQuotationDto, actor: AuthenticatedUser, context: RequestContext) {
    let customerId: string;
    let contactId: string | null = dto.contactId ?? null;
    let assignedToId = dto.assignedToId ?? null;
    let enquiryItemIds: Set<string> | null = null;
    let enquiryNumber: string | null = null;

    if (dto.enquiryId) {
      this.require(actor, PERMISSIONS.QUOTATION_CREATE, 'create quotations');
      this.require(actor, PERMISSIONS.ENQUIRY_CONVERT, 'convert enquiries');
      const handoff = await this.enquiriesService.conversionHandoff(dto.enquiryId, actor);
      if (!handoff.ready) {
        throw new BadRequestException({ message: 'This enquiry cannot be converted yet.', details: { problems: handoff.problems } });
      }
      customerId = handoff.customerId;
      contactId = contactId ?? handoff.customerContactId;
      enquiryItemIds = new Set(handoff.items.map((i) => i.enquiryItemId));
      enquiryNumber = handoff.enquiryNumber;
      if (!assignedToId) {
        const enquiry = await this.prisma.enquiry.findUnique({ where: { id: dto.enquiryId }, select: { assignedToId: true } });
        assignedToId = enquiry?.assignedToId ?? null;
      }
    } else {
      this.require(actor, PERMISSIONS.QUOTATION_CREATE_MANUAL, 'create quotations without an enquiry');
      if (!dto.customerId) throw new BadRequestException('Select a customer, or create the quotation from an enquiry.');
      customerId = dto.customerId;
      await this.customersService.assertSelectableForTransaction(customerId, actor);
    }
    await this.enquiriesService.assertContactOfCustomer(customerId, contactId);
    await this.assertAssignable(assignedToId);

    const { content, items } = await this.buildRevisionContent(dto, actor, enquiryItemIds);

    return this.prisma.$transaction(async (tx) => {
      const quotationNumber = await this.numberingService.allocate(SEQUENCE_KEYS.QUOTATION, tx);
      const quotation = await tx.quotation.create({
        data: {
          quotationNumber,
          customerId,
          enquiryId: dto.enquiryId ?? null,
          contactId,
          assignedToId,
          subject: cleanOptional(dto.subject) ?? null,
          referenceNumber: cleanOptional(dto.referenceNumber) ?? null,
          currency: dto.currency ?? 'INR',
          status: QuotationStatus.DRAFT,
          currentRevisionNumber: 1,
          currentTotal: content.grandTotal,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      const revision = await tx.quotationRevision.create({
        data: {
          quotationId: quotation.id,
          revisionNumber: 1,
          status: QuotationStatus.DRAFT,
          customerSnapshot: (await this.customerSnapshot(customerId, contactId, tx)) as unknown as Prisma.InputJsonValue,
          ...content,
          createdById: actor.id,
          items: { create: items },
        },
      });
      await tx.quotationStatusHistory.create({
        data: { quotationId: quotation.id, revisionId: revision.id, previousStatus: null, newStatus: QuotationStatus.DRAFT, remarks: 'Quotation created', changedById: actor.id },
      });
      // Converting is part of the same transaction: either both happen or neither,
      // and the guarded update refuses a second conversion of the same enquiry.
      if (dto.enquiryId) {
        await this.enquiriesService.markConverted(tx, dto.enquiryId, quotationNumber, actor);
      }
      await this.audit(tx, actor, context, quotation.id, 'quotation.create',
        `Created ${quotationNumber} revision 1${enquiryNumber ? ` from enquiry ${enquiryNumber}` : ' (manual)'} · ${items.length} item(s) · total ${quotation.currency} ${content.grandTotal.toFixed(2)}`,
        { after: { customerId, enquiryId: dto.enquiryId ?? null, grandTotal: content.grandTotal.toFixed(2) } });
      return quotation;
    }).catch((error) => {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
      const onEnquiry = Array.isArray(target) ? target.includes('enquiryId') : String(target ?? '').includes('enquiryId');
      // Other unique keys (e.g. a quotation-number collision) fall through to
      // the global filter's generic conflict message.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && onEnquiry) {
        throw new ConflictException('A quotation already exists for this enquiry.');
      }
      throw error;
    });
  }

  // -------------------------------------------------------------------------
  // Draft editing and revisions
  // -------------------------------------------------------------------------

  /** Replaces the content of the current revision; only while it is a DRAFT. */
  async updateDraft(id: string, dto: UpdateDraftDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.QUOTATION_UPDATE, 'edit quotations');
    const { quotation, revision } = await this.currentRevision(this.prisma, id);
    if (revision.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException('Only a draft revision can be edited. Create a new revision to change an issued quotation.');
    }
    const contactId = dto.header?.contactId !== undefined ? dto.header.contactId : quotation.contactId;
    await this.enquiriesService.assertContactOfCustomer(quotation.customerId, contactId);
    if (dto.header?.assignedToId) await this.assertAssignable(dto.header.assignedToId);

    const enquiryItemIds = quotation.enquiryId
      ? new Set((await this.prisma.enquiryItem.findMany({ where: { enquiryId: quotation.enquiryId }, select: { id: true } })).map((i) => i.id))
      : null;
    const { content, items } = await this.buildRevisionContent(dto, actor, enquiryItemIds);

    return this.prisma.$transaction(async (tx) => {
      await this.lockQuotation(tx, id);
      const fresh = await tx.quotationRevision.findUnique({ where: { id: revision.id }, select: { status: true } });
      if (fresh?.status !== QuotationStatus.DRAFT) throw new ConflictException('The revision was issued in the meantime.');
      await tx.quotationItem.deleteMany({ where: { revisionId: revision.id } });
      await tx.quotationRevision.update({
        where: { id: revision.id },
        data: {
          ...content,
          customerSnapshot: (await this.customerSnapshot(quotation.customerId, contactId ?? null, tx)) as unknown as Prisma.InputJsonValue,
          items: { create: items },
        },
      });
      await tx.quotation.update({
        where: { id },
        data: {
          currentTotal: content.grandTotal,
          updatedById: actor.id,
          ...(dto.header?.contactId !== undefined ? { contactId: dto.header.contactId } : {}),
          ...(dto.header?.assignedToId !== undefined ? { assignedToId: dto.header.assignedToId } : {}),
          ...(dto.header?.subject !== undefined ? { subject: cleanOptional(dto.header.subject) ?? null } : {}),
          ...(dto.header?.referenceNumber !== undefined ? { referenceNumber: cleanOptional(dto.header.referenceNumber) ?? null } : {}),
          ...(dto.header?.currency ? { currency: dto.header.currency } : {}),
        },
      });
      await this.audit(tx, actor, context, id, 'quotation.update',
        `Edited draft revision ${revision.revisionNumber}: ${items.length} item(s), total ${content.grandTotal.toFixed(2)}`,
        { before: { grandTotal: revision.grandTotal.toFixed(2), items: revision.items.length }, after: { grandTotal: content.grandTotal.toFixed(2), items: items.length } });
      return { id, revisionNumber: revision.revisionNumber };
    });
  }

  /**
   * Starts a new revision as a DRAFT copy of the current one. The previous
   * revision is marked SUPERSEDED and stays exactly as issued.
   */
  async createRevision(id: string, remarks: string | undefined, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.QUOTATION_REVISE, 'create revisions');
    return this.prisma.$transaction(async (tx) => {
      await this.lockQuotation(tx, id);
      const { quotation, revision } = await this.currentRevision(tx, id);
      if (revision.status === QuotationStatus.DRAFT) throw new BadRequestException('The current revision is still a draft; edit it instead.');
      if (FINAL.includes(quotation.status) || !REVISABLE.includes(revision.status)) {
        throw new BadRequestException(`A ${label(revision.status)} quotation cannot be revised.`);
      }
      const nextNumber = revision.revisionNumber + 1;
      const { id: _id, quotationId: _q, revisionNumber: _r, status: _s, issuedAt: _i, pdfDocumentId: _p, createdAt: _c, updatedAt: _u, createdById: _cb, items, ...content } = revision;
      const created = await tx.quotationRevision.create({
        data: {
          ...content,
          customerSnapshot: content.customerSnapshot as Prisma.InputJsonValue,
          taxBreakdown: (content.taxBreakdown ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          quotationId: id,
          revisionNumber: nextNumber,
          status: QuotationStatus.DRAFT,
          quotationDate: todayUtc(),
          createdById: actor.id,
          items: {
            create: items.map(({ id: _iid, revisionId: _rid, createdAt: _ic, updatedAt: _iu, ...item }) => ({
              ...item,
              specifications: (item.specifications ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            })),
          },
        },
      });
      await tx.quotationRevision.update({ where: { id: revision.id }, data: { status: QuotationStatus.SUPERSEDED } });
      await tx.quotationStatusHistory.createMany({
        data: [
          { quotationId: id, revisionId: revision.id, previousStatus: revision.status, newStatus: QuotationStatus.SUPERSEDED, remarks: `Superseded by revision ${nextNumber}`, changedById: actor.id },
          { quotationId: id, revisionId: created.id, previousStatus: null, newStatus: QuotationStatus.DRAFT, remarks: cleanOptional(remarks) ?? `Revision ${nextNumber} created`, changedById: actor.id },
        ],
      });
      await tx.quotation.update({ where: { id }, data: { currentRevisionNumber: nextNumber, status: QuotationStatus.DRAFT, updatedById: actor.id } });
      await this.audit(tx, actor, context, id, 'quotation.revise', `Created revision ${nextNumber} from revision ${revision.revisionNumber}${remarks ? `: ${remarks}` : ''}`);
      return { id, revisionNumber: nextNumber, revisionId: created.id };
    });
  }

  // -------------------------------------------------------------------------
  // Status lifecycle (current revision only)
  // -------------------------------------------------------------------------

  async changeStatus(id: string, dto: StatusActionDto, actor: AuthenticatedUser, context: RequestContext) {
    const approvalRequired = await this.settingsService.getBoolean(SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED);
    const target = dto.status;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockQuotation(tx, id);
      const { quotation, revision } = await this.currentRevision(tx, id);
      const from = revision.status;

      if (!(TRANSITIONS[from] ?? []).includes(target)) {
        throw new BadRequestException(`A ${label(from)} quotation cannot be moved to ${label(target)}.`);
      }
      if (REMARKS_REQUIRED.includes(target) && !dto.remarks) throw new BadRequestException(`Give remarks for marking the quotation ${label(target)}.`);

      // Permission and policy per action.
      switch (target) {
        case QuotationStatus.PENDING_APPROVAL:
          this.require(actor, PERMISSIONS.QUOTATION_SUBMIT, 'submit quotations for approval');
          if (!approvalRequired) throw new BadRequestException('Approval is not enabled; the quotation can be marked as sent directly.');
          break;
        case QuotationStatus.APPROVED:
          this.require(actor, PERMISSIONS.QUOTATION_APPROVE, 'approve quotations');
          break;
        case QuotationStatus.DRAFT:
          this.require(actor, PERMISSIONS.QUOTATION_APPROVE, 'send quotations back for changes');
          if (!dto.remarks) throw new BadRequestException('Say what needs to change when sending the quotation back.');
          break;
        case QuotationStatus.SENT:
          this.require(actor, PERMISSIONS.QUOTATION_SEND, 'mark quotations as sent');
          if (approvalRequired && from !== QuotationStatus.APPROVED) throw new BadRequestException('This quotation must be approved before it is sent.');
          if (revision.validUntil && revision.validUntil < todayUtc()) throw new BadRequestException('The validity date has passed. Edit the draft or create a new revision first.');
          break;
        case QuotationStatus.CANCELLED:
          this.require(actor, PERMISSIONS.QUOTATION_CANCEL, 'cancel quotations');
          break;
        default:
          this.require(actor, PERMISSIONS.QUOTATION_SEND, 'record customer responses');
      }

      const now = new Date();
      const issuing = target === QuotationStatus.SENT && !revision.issuedAt;
      await tx.quotationRevision.update({
        where: { id: revision.id },
        data: {
          status: target,
          // Issuing freezes the revision with the customer details as they are now.
          ...(issuing ? { issuedAt: now, customerSnapshot: (await this.customerSnapshot(quotation.customerId, quotation.contactId, tx)) as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      await tx.quotation.update({
        where: { id },
        data: {
          status: target,
          updatedById: actor.id,
          // Acceptance is pinned to this exact revision.
          ...(target === QuotationStatus.ACCEPTED ? { acceptedRevisionId: revision.id } : {}),
        },
      });
      await tx.quotationStatusHistory.create({
        data: { quotationId: id, revisionId: revision.id, previousStatus: from, newStatus: target, remarks: dto.remarks ?? null, changedById: actor.id },
      });
      const action = target === QuotationStatus.APPROVED ? 'quotation.approve' : from === QuotationStatus.PENDING_APPROVAL && target === QuotationStatus.DRAFT ? 'quotation.approval.reject' : target === QuotationStatus.PENDING_APPROVAL ? 'quotation.submit' : 'quotation.status';
      await this.audit(tx, actor, context, id, action,
        `Revision ${revision.revisionNumber}: ${label(from)} → ${label(target)}${dto.remarks ? ` (${dto.remarks})` : ''}`,
        { before: { status: from }, after: { status: target, remarks: dto.remarks ?? null } });
      return { id, revisionNumber: revision.revisionNumber, revisionId: revision.id, status: target, issued: issuing };
    });
    // The issued document is rendered once from the frozen snapshot and stored;
    // if that fails here it is produced on the first download instead.
    if (result.issued) await this.pdfService.storeIssuedById(result.revisionId, actor);
    return result;
  }

  /** Delete a quotation that was never issued (single draft revision, no documents). */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      // Checked under the row lock: otherwise a concurrent DRAFT -> SENT could
      // commit between the check and the delete, removing an issued quotation.
      await this.lockQuotation(tx, id);
      const quotation = await tx.quotation.findUnique({
        where: { id },
        include: { _count: { select: { revisions: true, documents: { where: { archivedAt: null } } } }, revisions: { select: { issuedAt: true, status: true } } },
      });
      if (!quotation) throw new NotFoundException(`Quotation ${id} was not found`);
      if (quotation._count.revisions > 1 || quotation.revisions.some((r) => r.issuedAt || r.status !== QuotationStatus.DRAFT) || quotation._count.documents > 0) {
        throw new ConflictException('Only a never-issued draft without documents can be deleted. Cancel this quotation instead.');
      }
      // Removed (archived) attachments still reference the quotation through a
      // RESTRICT foreign key, which made such a draft impossible to delete.
      await tx.document.updateMany({ where: { quotationId: id, archivedAt: { not: null } }, data: { quotationId: null } });
      // The enquiry goes back to Ready for Quotation so it can be converted again.
      if (quotation.enquiryId) await this.enquiriesService.revertConversion(tx, quotation.enquiryId, quotation.quotationNumber, actor);
      await tx.quotation.delete({ where: { id } });
      await this.audit(tx, actor, context, id, 'quotation.delete', `Deleted draft quotation ${quotation.quotationNumber}`, { before: { quotationNumber: quotation.quotationNumber, customerId: quotation.customerId, enquiryId: quotation.enquiryId } });
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private buildWhere(query: QueryQuotationsDto): Prisma.QuotationWhereInput {
    const and: Prisma.QuotationWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.enquiryId) and.push({ enquiryId: query.enquiryId });
    if (query.revisedOnly) and.push({ currentRevisionNumber: { gt: 1 } });
    if (query.amountMin) and.push({ currentTotal: { gte: new Prisma.Decimal(query.amountMin) } });
    if (query.amountMax) and.push({ currentTotal: { lte: new Prisma.Decimal(query.amountMax) } });
    if (query.dateFrom || query.dateTo) {
      and.push({ createdAt: { ...(query.dateFrom ? { gte: businessDayStart(query.dateFrom) } : {}), ...(query.dateTo ? { lt: businessDayEnd(query.dateTo) } : {}) } });
    }
    if (query.validFrom || query.validTo) {
      and.push({ revisions: { some: { status: { not: QuotationStatus.SUPERSEDED }, validUntil: { ...(query.validFrom ? { gte: dateOnly(query.validFrom) } : {}), ...(query.validTo ? { lte: dateOnly(query.validTo) } : {}) } } } });
    }
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { quotationNumber: text },
          { subject: text },
          { referenceNumber: text },
          { customer: { OR: [{ name: text }, { normalizedName: normalizedNameFilter(query.search) }, { customerCode: text }] } },
          { enquiry: { enquiryNumber: text } },
          { assignedTo: { fullName: text } },
          { revisions: { some: { items: { some: { OR: [{ productName: text }, { productCode: text }, { modelName: text }, { modelNumber: text }] } } } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  async findAll(query: QueryQuotationsDto) {
    const where = this.buildWhere(query);
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          currency: true,
          currentRevisionNumber: true,
          currentTotal: true,
          createdAt: true,
          customer: { select: { id: true, name: true, customerCode: true } },
          enquiry: { select: { id: true, enquiryNumber: true } },
          assignedTo: userSelect,
          revisions: { orderBy: { revisionNumber: 'desc' }, take: 1, select: { quotationDate: true, validUntil: true } },
        },
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    const today = todayUtc();
    const items = rows.map(({ revisions, ...q }) => ({
      ...q,
      quotationDate: revisions[0]?.quotationDate ?? null,
      validUntil: revisions[0]?.validUntil ?? null,
      // Past validity but not yet marked expired: flagged, never changed silently.
      pastValidity: Boolean(revisions[0]?.validUntil && revisions[0].validUntil < today && OPEN_STATUSES.includes(q.status)),
    }));
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async summary() {
    const count = (status: QuotationStatus) => this.prisma.quotation.count({ where: { status } });
    const [total, draft, pending, approved, sent, negotiation, accepted, rejected, expired, cancelled] = await this.prisma.$transaction([
      this.prisma.quotation.count(),
      count(QuotationStatus.DRAFT),
      count(QuotationStatus.PENDING_APPROVAL),
      count(QuotationStatus.APPROVED),
      count(QuotationStatus.SENT),
      count(QuotationStatus.UNDER_NEGOTIATION),
      count(QuotationStatus.ACCEPTED),
      count(QuotationStatus.REJECTED),
      count(QuotationStatus.EXPIRED),
      count(QuotationStatus.CANCELLED),
    ]);
    const approvalRequired = await this.settingsService.getBoolean(SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED);
    const pastValidity = await this.prisma.quotation.count({
      where: { status: { in: OPEN_STATUSES }, revisions: { some: { status: { not: QuotationStatus.SUPERSEDED }, validUntil: { lt: todayUtc() } } } },
    });
    return { pastValidity, total, draft, pendingApproval: pending, approved, sent, underNegotiation: negotiation, accepted, rejected, expired, cancelled, approvalRequired, generatedAt: new Date().toISOString() };
  }

  async findOne(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerCode: true, customerType: true, status: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
        enquiry: { select: { id: true, enquiryNumber: true, status: true } },
        assignedTo: userSelect,
        createdBy: userSelect,
        updatedBy: userSelect,
        revisions: { orderBy: { revisionNumber: 'desc' }, include: revisionInclude },
        statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect, revision: { select: { revisionNumber: true } } } },
        communications: { orderBy: { occurredAt: 'desc' }, include: { createdBy: userSelect } },
        documents: {
          where: { archivedAt: null },
          select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!quotation) throw new NotFoundException(`Quotation ${id} was not found`);
    const approvalRequired = await this.settingsService.getBoolean(SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED);
    return { ...quotation, approvalRequired };
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      OR: [{ entityType: QUOTATION_ENTITY, entityId: id }, { parentEntityType: QUOTATION_ENTITY, parentEntityId: id }],
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

  async revision(quotationId: string, revisionNumber: number) {
    const revision = await this.prisma.quotationRevision.findUnique({
      where: { quotationId_revisionNumber: { quotationId, revisionNumber } },
      include: { ...revisionInclude, quotation: { select: { quotationNumber: true, currency: true, subject: true, referenceNumber: true, acceptedRevisionId: true, enquiry: { select: { enquiryNumber: true } } } } },
    });
    if (!revision) throw new NotFoundException(`Revision ${revisionNumber} was not found`);
    return revision;
  }

  /** Field-by-field differences between two revisions of the same quotation. */
  async compare(quotationId: string, fromNumber: number, toNumber: number) {
    const [from, to] = await Promise.all([this.revision(quotationId, fromNumber), this.revision(quotationId, toNumber)]);
    const key = (i: { productId: string; productModelId: string | null }) => `${i.productId}|${i.productModelId ?? ''}`;
    const fields = ['quantity', 'unit', 'unitPrice', 'discountType', 'discountValue', 'discountAmount', 'taxLabel', 'taxRate', 'taxAmount', 'lineTotal', 'description', 'remarks'] as const;
    const str = (v: unknown) => (v === null || v === undefined ? null : v instanceof Prisma.Decimal ? v.toFixed(2) : String(v));
    // Lines repeating the same product/model are paired in order of appearance.
    const keyed = <T extends { productId: string; productModelId: string | null }>(items: T[]) => {
      const seen = new Map<string, number>();
      return items.map((i) => {
        const n = (seen.get(key(i)) ?? 0) + 1;
        seen.set(key(i), n);
        return [`${key(i)}#${n}`, i] as const;
      });
    };
    const fromEntries = keyed(from.items);
    const toEntries = keyed(to.items);
    const fromMap = new Map(fromEntries);
    const toMap = new Map(toEntries);
    const describe = (i: { productName: string; modelName: string | null }) => `${i.productName}${i.modelName ? ` - ${i.modelName}` : ''}`;

    const items = [
      ...toEntries.filter(([k]) => !fromMap.has(k)).map(([, i]) => ({ change: 'added' as const, item: describe(i), fields: [] })),
      ...fromEntries.filter(([k]) => !toMap.has(k)).map(([, i]) => ({ change: 'removed' as const, item: describe(i), fields: [] })),
      ...toEntries
        .filter(([k]) => fromMap.has(k))
        .map(([k, i]) => {
          const before = fromMap.get(k)!;
          const changed = fields
            .filter((f) => str(before[f]) !== str(i[f]))
            .map((f) => ({ field: f, from: str(before[f]), to: str(i[f]) }));
          return { change: changed.length ? ('modified' as const) : ('unchanged' as const), item: describe(i), fields: changed };
        })
        .filter((row) => row.change === 'modified'),
    ];
    const headerFields = ['quotationDate', 'validUntil', 'subtotal', 'itemDiscountTotal', 'additionalDiscount', 'taxTotal', 'otherCharges', 'grandTotal', 'termsAndConditions', 'paymentTerms', 'deliveryTerms', 'warrantyTerms', 'notes', 'internalRemarks'] as const;
    const fmt = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : str(v));
    const header = headerFields.filter((f) => fmt(from[f]) !== fmt(to[f])).map((f) => ({ field: f, from: fmt(from[f]), to: fmt(to[f]) }));
    return { from: { revisionNumber: from.revisionNumber, status: from.status }, to: { revisionNumber: to.revisionNumber, status: to.status }, items, header };
  }

  /**
   * Proforma Invoice hand-off contract (Module 6). Only the accepted revision
   * qualifies. Creates nothing: the PI module will create its own document
   * and keep this quotation/revision reference.
   */
  async proformaHandoff(quotationId: string, revisionNumber: number) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id: quotationId }, select: { id: true, quotationNumber: true, customerId: true, currency: true, acceptedRevisionId: true, enquiryId: true } });
    if (!quotation) throw new NotFoundException(`Quotation ${quotationId} was not found`);
    const revision = await this.revision(quotationId, revisionNumber);
    const ready = quotation.acceptedRevisionId === revision.id;
    return {
      ready,
      problems: ready ? [] : ['Only the revision the customer accepted can become a Proforma Invoice.'],
      proformaModuleAvailable: false,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      enquiryId: quotation.enquiryId,
      customerId: quotation.customerId,
      currency: quotation.currency,
      totals: {
        subtotal: revision.subtotal.toFixed(2),
        itemDiscountTotal: revision.itemDiscountTotal.toFixed(2),
        additionalDiscount: revision.additionalDiscount.toFixed(2),
        taxTotal: revision.taxTotal.toFixed(2),
        otherCharges: revision.otherCharges.toFixed(2),
        grandTotal: revision.grandTotal.toFixed(2),
      },
      items: revision.items.map((i) => ({
        quotationItemId: i.id,
        productId: i.productId,
        productModelId: i.productModelId,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice.toFixed(2),
        discountAmount: i.discountAmount.toFixed(2),
        taxLabel: i.taxLabel,
        taxRate: i.taxRate.toFixed(2),
        taxAmount: i.taxAmount.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Communication log
  // -------------------------------------------------------------------------

  async addCommunication(id: string, dto: CommunicationDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.QUOTATION_SEND, 'record customer communication');
    const quotation = await this.prisma.quotation.findUnique({ where: { id }, select: { currentRevisionNumber: true } });
    if (!quotation) throw new NotFoundException(`Quotation ${id} was not found`);
    if (new Date(dto.occurredAt) > new Date(Date.now() + 5 * 60_000)) throw new BadRequestException('Communication records describe what already happened; the date cannot be in the future.');
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.quotationCommunication.create({
        data: { quotationId: id, revisionNumber: quotation.currentRevisionNumber, occurredAt: new Date(dto.occurredAt), channel: dto.channel, contactName: cleanOptional(dto.contactName) ?? null, summary: dto.summary, createdById: actor.id },
      });
      await this.audit(tx, actor, context, id, 'quotation.communication', `Logged ${dto.channel.toLowerCase()} communication`);
      return entry;
    });
  }

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  async reports(query: { dateFrom?: string; dateTo?: string }) {
    const created: Prisma.DateTimeFilter = {
      ...(query.dateFrom ? { gte: businessDayStart(query.dateFrom) } : {}),
      ...(query.dateTo ? { lt: businessDayEnd(query.dateTo) } : {}),
    };
    const where: Prisma.QuotationWhereInput = Object.keys(created).length ? { createdAt: created } : {};
    const [statusRows, customerRows, employeeRows, revisionStats, enquiriesTotal, enquiriesConverted] = await Promise.all([
      this.prisma.quotation.groupBy({ by: ['status', 'currency'], where, _count: { _all: true }, _sum: { currentTotal: true } }),
      this.prisma.quotation.groupBy({ by: ['customerId', 'currency'], where, _count: { _all: true }, _sum: { currentTotal: true } }),
      this.prisma.quotation.groupBy({ by: ['assignedToId', 'currency'], where, _count: { _all: true }, _sum: { currentTotal: true } }),
      this.prisma.quotation.aggregate({ where, _avg: { currentRevisionNumber: true }, _max: { currentRevisionNumber: true }, _count: { _all: true } }),
      this.prisma.enquiry.count({ where: Object.keys(created).length ? { createdAt: created } : {} }),
      this.prisma.enquiry.count({ where: { convertedAt: { not: null }, ...(Object.keys(created).length ? { createdAt: created } : {}) } }),
    ]);

    // Amounts are never added across currencies: each row carries one total per currency.
    type Row = { _count: { _all: number }; _sum: { currentTotal: Prisma.Decimal | null }; currency: string };
    const rollUp = <K extends string | null>(rows: Array<Row & { key: K }>) => {
      const map = new Map<K, { key: K; count: number; totals: Map<string, Prisma.Decimal> }>();
      for (const r of rows) {
        const entry = map.get(r.key) ?? { key: r.key, count: 0, totals: new Map<string, Prisma.Decimal>() };
        entry.count += r._count._all;
        entry.totals.set(r.currency, (entry.totals.get(r.currency) ?? new Prisma.Decimal(0)).plus(r._sum.currentTotal ?? 0));
        map.set(r.key, entry);
      }
      return [...map.values()]
        .sort((x, y) => y.count - x.count)
        .map((e) => ({ key: e.key, count: e.count, totals: [...e.totals.entries()].map(([currency, total]) => ({ currency, total: total.toFixed(2) })) }));
    };
    const byStatus = rollUp(statusRows.map((r) => ({ ...r, key: r.status })));
    const byCustomer = rollUp(customerRows.map((r) => ({ ...r, key: r.customerId }))).slice(0, 20);
    const byEmployee = rollUp(employeeRows.map((r) => ({ ...r, key: r.assignedToId }))).slice(0, 20);

    const [customers, users] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: byCustomer.map((r) => r.key) } }, select: { id: true, name: true, customerCode: true } }),
      this.prisma.user.findMany({ where: { id: { in: byEmployee.map((r) => r.key).filter((v): v is string => Boolean(v)) } }, select: { id: true, fullName: true } }),
    ]);
    const accepted = byStatus.find((r) => r.key === QuotationStatus.ACCEPTED)?.count ?? 0;
    const rejected = byStatus.find((r) => r.key === QuotationStatus.REJECTED)?.count ?? 0;
    return {
      byStatus: byStatus.map(({ key, ...r }) => ({ status: key, ...r })),
      byCustomer: byCustomer.map(({ key, ...r }) => ({ customer: customers.find((c) => c.id === key) ?? null, ...r })),
      byEmployee: byEmployee.map(({ key, ...r }) => ({ employee: users.find((u) => u.id === key) ?? null, ...r })),
      acceptedVsRejected: { accepted, rejected, acceptanceRate: accepted + rejected ? Math.round((accepted / (accepted + rejected)) * 1000) / 10 : null },
      conversion: { enquiries: enquiriesTotal, converted: enquiriesConverted, rate: enquiriesTotal ? Math.round((enquiriesConverted / enquiriesTotal) * 1000) / 10 : null },
      revisions: { quotations: revisionStats._count._all, average: revisionStats._avg.currentRevisionNumber, max: revisionStats._max.currentRevisionNumber },
    };
  }

  async findAllForExport(query: QueryQuotationsDto) {
    return this.prisma.quotation.findMany({
      where: this.buildWhere(query),
      select: {
        quotationNumber: true,
        status: true,
        currency: true,
        currentRevisionNumber: true,
        currentTotal: true,
        createdAt: true,
        customer: { select: { name: true, customerCode: true } },
        enquiry: { select: { enquiryNumber: true } },
        assignedTo: userSelect,
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1, select: { quotationDate: true, validUntil: true } },
      },
      orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
      take: 5000,
    });
  }

  // -------------------------------------------------------------------------
  // Settings (default terms, company profile for documents)
  // -------------------------------------------------------------------------

  async getSettingsFor(actor: AuthenticatedUser) {
    if (!actor.permissions.includes(PERMISSIONS.QUOTATION_READ) && !actor.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)) {
      throw new ForbiddenException('You do not have permission to view quotation settings.');
    }
    return this.getSettings();
  }

  async getSettings() {
    const [defaultTerms, companyProfile, approvalRequired] = await Promise.all([
      this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.QUOTATION_DEFAULT_TERMS),
      this.settingsService.get<Record<string, string> | null>(BRANDING_SETTING_KEYS.COMPANY_PROFILE),
      this.settingsService.getBoolean(SETTING_KEYS.QUOTATION_APPROVAL_REQUIRED),
    ]);
    return { defaultTerms: defaultTerms ?? '', companyProfile: companyProfile ?? {}, approvalRequired };
  }

  async updateSettings(input: { defaultTerms?: string; companyProfile?: CompanyProfileDto }, actor: AuthenticatedUser) {
    if (input.defaultTerms !== undefined) {
      await this.settingsService.set(BRANDING_SETTING_KEYS.QUOTATION_DEFAULT_TERMS, input.defaultTerms.trim() || null, actor);
    }
    if (input.companyProfile !== undefined) {
      const cleaned = Object.fromEntries(Object.entries(input.companyProfile).filter(([, v]) => typeof v === 'string' && v.trim()));
      await this.settingsService.set(BRANDING_SETTING_KEYS.COMPANY_PROFILE, Object.keys(cleaned).length ? cleaned : null, actor);
    }
    return this.getSettings();
  }
}
