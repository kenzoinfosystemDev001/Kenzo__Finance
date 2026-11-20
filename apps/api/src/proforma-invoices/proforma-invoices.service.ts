import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProformaStatus, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { CustomersService } from '../customers/customers.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { QuotationsService } from '../quotations/quotations.service';
import { BRANDING_SETTING_KEYS, SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { buildPaginatedResult, type PaginationQueryDto } from '../common/dto/pagination.dto';
import { normalizeName } from '../common/utils/normalize';
import { businessToday } from '../common/utils/business-date';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  BankDetailsDto,
  CreateProformaDto,
  EligibleQuotationsQueryDto,
  ProformaDetailsDto,
  ProformaSettingsDto,
  ProformaStatusDto,
  QueryProformasDto,
  UpdateProformaDto,
} from './dto/proforma.dto';
import { EDITABLE, ISSUED_STATES, label, TRANSITIONS } from './proforma-rules';
import { ProformaPdfService, type BankDetails } from './proforma-pdf.service';

export const PROFORMA_ENTITY = 'ProformaInvoice';
type Tx = Prisma.TransactionClient;
const userSelect = { select: { id: true, fullName: true } } as const;
const D = Prisma.Decimal;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/** Bank details with empty fields removed; null when nothing is left. */
function cleanBank(value: BankDetailsDto | BankDetails | null | undefined): BankDetails | null {
  if (!value) return null;
  const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' && v.trim());
  return entries.length ? (Object.fromEntries(entries.map(([k, v]) => [k, (v as string).trim()])) as BankDetails) : null;
}

/**
 * Module 6 - Proforma Invoice Management.
 *
 * A PI is raised from the revision of a quotation that the customer accepted
 * (Module 5). Customer details, lines and every amount are copied from that
 * revision - the PI never recalculates or accepts prices from the client - so
 * the PI always equals what the customer accepted. Only PI-specific details
 * (dates, contact, terms, bank details, advance) can be edited, and only while
 * the PI is a draft. Issuing freezes it and stores the PDF.
 *
 * Payment Management (Module 7) will attach payments to a PI through
 * paymentHandoff(); payment status is never set by hand here.
 */
@Injectable()
export class ProformaInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly customersService: CustomersService,
    private readonly enquiriesService: EnquiriesService,
    private readonly quotationsService: QuotationsService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: ProformaPdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`You do not have permission to ${action}.`);
  }

  private audit(tx: Tx | undefined, actor: AuthenticatedUser, context: RequestContext | null, piId: string, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.auditService.record(
      { actorUserId: actor.id, action, entityType: PROFORMA_ENTITY, entityId: piId, summary, ...extra, ipAddress: context?.ipAddress ?? null, userAgent: context?.userAgent ?? null },
      tx,
    );
  }

  /** Row lock so concurrent edits / status changes of one PI are serialised. */
  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM proforma_invoices WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(`Proforma invoice ${id} was not found`);
  }

  private async assertAssignable(userId?: string | null) {
    if (userId) await this.enquiriesService.assertAssignableUser(userId);
  }

  /** Validates PI-specific values against the grand total and each other. */
  private validateDetails(dto: ProformaDetailsDto, current: { piDate: Date; dueDate: Date | null; grandTotal: Prisma.Decimal }) {
    const piDate = dto.piDate ? dateOnly(dto.piDate) : current.piDate;
    const dueDate = dto.dueDate === undefined ? current.dueDate : dto.dueDate ? dateOnly(dto.dueDate) : null;
    if (dueDate && dueDate < piDate) throw new BadRequestException('The payment due date cannot be before the PI date.');
    if (dto.advanceAmount) {
      const advance = new D(dto.advanceAmount);
      if (advance.greaterThan(current.grandTotal)) throw new BadRequestException('The advance amount cannot exceed the grand total.');
    }
    return { piDate, dueDate };
  }

  // -------------------------------------------------------------------------
  // Settings (bank details and default payment instructions)
  // -------------------------------------------------------------------------

  async getSettings() {
    const [bankDetails, paymentInstructions, approvalRequired] = await Promise.all([
      this.settingsService.get<BankDetails | null>(BRANDING_SETTING_KEYS.PROFORMA_BANK_DETAILS),
      this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.PROFORMA_PAYMENT_INSTRUCTIONS),
      this.settingsService.getBoolean(SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED),
    ]);
    return { bankDetails: bankDetails ?? null, paymentInstructions: paymentInstructions ?? '', approvalRequired };
  }

  async getSettingsFor(actor: AuthenticatedUser) {
    if (!actor.permissions.includes(PERMISSIONS.PROFORMA_READ) && !actor.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)) {
      throw new ForbiddenException('You do not have permission to view proforma invoice settings.');
    }
    return this.getSettings();
  }

  async updateSettings(dto: ProformaSettingsDto, actor: AuthenticatedUser) {
    if (dto.bankDetails !== undefined) await this.settingsService.set(BRANDING_SETTING_KEYS.PROFORMA_BANK_DETAILS, cleanBank(dto.bankDetails), actor);
    if (dto.paymentInstructions !== undefined) await this.settingsService.set(BRANDING_SETTING_KEYS.PROFORMA_PAYMENT_INSTRUCTIONS, dto.paymentInstructions || null, actor);
    return this.getSettings();
  }

  // -------------------------------------------------------------------------
  // Quotation integration
  // -------------------------------------------------------------------------

  /** Accepted quotations whose accepted revision has no live PI. */
  async eligibleQuotations(query: EligibleQuotationsQueryDto) {
    const and: Prisma.QuotationWhereInput[] = [
      { status: QuotationStatus.ACCEPTED, acceptedRevisionId: { not: null } },
      { proformaInvoices: { none: { activeRevisionId: { not: null } } } },
    ];
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({ OR: [{ quotationNumber: text }, { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: { contains: normalizeName(query.search) } }] } }] });
    }
    const where: Prisma.QuotationWhereInput = { AND: and };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        select: {
          id: true,
          quotationNumber: true,
          currency: true,
          customer: { select: { id: true, name: true, customerCode: true } },
          assignedTo: userSelect,
          acceptedRevision: { select: { id: true, revisionNumber: true, grandTotal: true, quotationDate: true } },
          statusHistory: { where: { newStatus: QuotationStatus.ACCEPTED }, orderBy: { changedAt: 'desc' }, take: 1, select: { changedAt: true } },
          proformaInvoices: { where: { status: ProformaStatus.CANCELLED }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, piNumber: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    const items = rows.map(({ statusHistory, acceptedRevision, proformaInvoices, ...q }) => ({
      ...q,
      revisionId: acceptedRevision!.id,
      revisionNumber: acceptedRevision!.revisionNumber,
      quotationDate: acceptedRevision!.quotationDate,
      grandTotal: acceptedRevision!.grandTotal,
      acceptedAt: statusHistory[0]?.changedAt ?? null,
      /** A cancelled PI exists: a new one will be recorded as its replacement. */
      cancelledProforma: proformaInvoices[0] ?? null,
    }));
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  /** Loads a quotation and its accepted revision, refusing anything that cannot become a PI. */
  private async loadAccepted(quotationId: string, client: Tx | PrismaService = this.prisma) {
    const quotation = await client.quotation.findUnique({
      where: { id: quotationId },
      include: {
        acceptedRevision: { include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } },
        enquiry: { select: { id: true, enquiryNumber: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
      },
    });
    if (!quotation) throw new NotFoundException(`Quotation ${quotationId} was not found`);
    if (quotation.status !== QuotationStatus.ACCEPTED || !quotation.acceptedRevision) {
      throw new BadRequestException({
        message: 'Only a quotation the customer accepted can become a proforma invoice.',
        details: { problems: [`Quotation ${quotation.quotationNumber} is ${quotation.status.toLowerCase().replace(/_/g, ' ')}.`] },
      });
    }
    return { ...quotation, acceptedRevision: quotation.acceptedRevision };
  }

  private async livePiFor(revisionId: string, client: Tx | PrismaService = this.prisma) {
    return client.proformaInvoice.findUnique({ where: { activeRevisionId: revisionId }, select: { id: true, piNumber: true, status: true } });
  }

  /** What the create form pre-fills: everything comes from the accepted revision. Creates nothing. */
  async fromQuotation(quotationId: string, actor: AuthenticatedUser) {
    this.require(actor, PERMISSIONS.PROFORMA_CREATE, 'create proforma invoices');
    const quotation = await this.loadAccepted(quotationId);
    const revision = quotation.acceptedRevision;
    const [existing, settings, contacts, accepted, cancelled] = await Promise.all([
      this.livePiFor(revision.id),
      this.getSettings(),
      this.prisma.customerContact.findMany({ where: { customerId: quotation.customerId }, select: { id: true, name: true, designation: true, isPrimary: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      this.prisma.quotationStatusHistory.findFirst({ where: { quotationId, revisionId: revision.id, newStatus: QuotationStatus.ACCEPTED }, orderBy: { changedAt: 'desc' }, select: { changedAt: true } }),
      this.prisma.proformaInvoice.findFirst({ where: { quotationRevisionId: revision.id, status: ProformaStatus.CANCELLED, replacedBy: null }, orderBy: { createdAt: 'desc' }, select: { id: true, piNumber: true } }),
    ]);
    const problems: string[] = [];
    if (existing) problems.push(`Proforma invoice ${existing.piNumber} already exists for this quotation (${label(existing.status)}). Cancel it first to raise a replacement.`);
    return {
      ready: problems.length === 0,
      problems,
      existingProforma: existing,
      replaces: cancelled,
      quotation: {
        id: quotation.id,
        quotationNumber: quotation.quotationNumber,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        quotationDate: revision.quotationDate,
        acceptedAt: accepted?.changedAt ?? null,
        subject: quotation.subject,
        referenceNumber: quotation.referenceNumber,
        enquiry: quotation.enquiry,
      },
      customer: quotation.customer,
      customerSnapshot: await this.quotationsService.customerSnapshot(quotation.customerId, quotation.contactId),
      contacts,
      contactId: quotation.contactId,
      assignedToId: quotation.assignedToId,
      currency: quotation.currency,
      items: revision.items.map((i) => ({
        quotationItemId: i.id,
        productId: i.productId,
        productModelId: i.productModelId,
        productName: i.productName,
        productCode: i.productCode,
        brandName: i.brandName,
        modelName: i.modelName,
        modelNumber: i.modelNumber,
        description: i.description,
        specifications: i.specifications,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        discountType: i.discountType,
        discountValue: i.discountValue,
        discountAmount: i.discountAmount,
        taxLabel: i.taxLabel,
        taxRate: i.taxRate,
        taxAmount: i.taxAmount,
        lineTotal: i.lineTotal,
        remarks: i.remarks,
      })),
      totals: {
        subtotal: revision.subtotal,
        itemDiscountTotal: revision.itemDiscountTotal,
        additionalDiscount: revision.additionalDiscount,
        taxableAmount: revision.taxableAmount,
        taxTotal: revision.taxTotal,
        otherChargesLabel: revision.otherChargesLabel,
        otherCharges: revision.otherCharges,
        grandTotal: revision.grandTotal,
        taxBreakdown: revision.taxBreakdown,
      },
      terms: {
        paymentTerms: revision.paymentTerms,
        deliveryTerms: revision.deliveryTerms,
        warrantyTerms: revision.warrantyTerms,
        termsAndConditions: revision.termsAndConditions,
        notes: revision.notes,
      },
      defaults: {
        piDate: businessToday().toISOString().slice(0, 10),
        bankDetails: settings.bankDetails,
        paymentInstructions: settings.paymentInstructions || null,
      },
      approvalRequired: settings.approvalRequired,
    };
  }

  // -------------------------------------------------------------------------
  // Create / edit / delete
  // -------------------------------------------------------------------------

  async create(dto: CreateProformaDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PROFORMA_CREATE, 'create proforma invoices');
    const quotation = await this.loadAccepted(dto.quotationId);
    const revision = quotation.acceptedRevision;
    await this.customersService.assertSelectableForTransaction(quotation.customerId, actor);

    const contactId = dto.contactId !== undefined ? dto.contactId : quotation.contactId;
    await this.enquiriesService.assertContactOfCustomer(quotation.customerId, contactId ?? null);
    const assignedToId = dto.assignedToId !== undefined ? dto.assignedToId : quotation.assignedToId;
    // Only a newly chosen assignee must be active; the quotation's own assignee may have left.
    if (dto.assignedToId && dto.assignedToId !== quotation.assignedToId) await this.assertAssignable(dto.assignedToId);
    const { piDate, dueDate } = this.validateDetails(dto, { piDate: businessToday(), dueDate: null, grandTotal: revision.grandTotal });

    const settings = await this.getSettings();
    const existing = await this.livePiFor(revision.id);
    if (existing) {
      throw new ConflictException({ message: `Proforma invoice ${existing.piNumber} already exists for this quotation.`, details: { proformaInvoiceId: existing.id, piNumber: existing.piNumber } });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replaces = await tx.proformaInvoice.findFirst({
          where: { quotationRevisionId: revision.id, status: ProformaStatus.CANCELLED, replacedBy: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, piNumber: true },
        });
        const piNumber = await this.numberingService.allocate(SEQUENCE_KEYS.PROFORMA_INVOICE, tx);
        const snapshot = await this.quotationsService.customerSnapshot(quotation.customerId, contactId ?? null, tx);
        const pi = await tx.proformaInvoice.create({
          data: {
            piNumber,
            quotationId: quotation.id,
            quotationRevisionId: revision.id,
            // The unique column that makes a second live PI for this revision impossible.
            activeRevisionId: revision.id,
            replacesId: replaces?.id ?? null,
            customerId: quotation.customerId,
            contactId: contactId ?? null,
            assignedToId: assignedToId ?? null,
            status: ProformaStatus.DRAFT,
            piDate,
            dueDate,
            currency: quotation.currency,
            subject: dto.subject !== undefined ? dto.subject : quotation.subject,
            referenceNumber: dto.referenceNumber !== undefined ? dto.referenceNumber : quotation.referenceNumber,
            internalRemarks: dto.internalRemarks ?? null,
            customerSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            subtotal: revision.subtotal,
            itemDiscountTotal: revision.itemDiscountTotal,
            additionalDiscount: revision.additionalDiscount,
            taxableAmount: revision.taxableAmount,
            taxTotal: revision.taxTotal,
            otherChargesLabel: revision.otherChargesLabel,
            otherCharges: revision.otherCharges,
            grandTotal: revision.grandTotal,
            taxBreakdown: (revision.taxBreakdown ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            advanceAmount: dto.advanceAmount ? new D(dto.advanceAmount) : null,
            paymentTerms: dto.paymentTerms !== undefined ? dto.paymentTerms : revision.paymentTerms,
            deliveryTerms: dto.deliveryTerms !== undefined ? dto.deliveryTerms : revision.deliveryTerms,
            warrantyTerms: dto.warrantyTerms !== undefined ? dto.warrantyTerms : revision.warrantyTerms,
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : revision.termsAndConditions,
            notes: dto.notes !== undefined ? dto.notes : revision.notes,
            paymentInstructions: dto.paymentInstructions !== undefined ? dto.paymentInstructions : settings.paymentInstructions || null,
            bankDetails: (cleanBank(dto.bankDetails !== undefined ? dto.bankDetails : settings.bankDetails) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            createdById: actor.id,
            updatedById: actor.id,
            items: {
              create: revision.items.map((i, index) => ({
                sortOrder: index,
                quotationItemId: i.id,
                productId: i.productId,
                productModelId: i.productModelId,
                productName: i.productName,
                productCode: i.productCode,
                brandName: i.brandName,
                modelName: i.modelName,
                modelNumber: i.modelNumber,
                description: i.description,
                specifications: (i.specifications ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                quantity: i.quantity,
                unit: i.unit,
                unitPrice: i.unitPrice,
                discountType: i.discountType,
                discountValue: i.discountValue,
                discountAmount: i.discountAmount,
                taxLabel: i.taxLabel,
                taxRate: i.taxRate,
                taxAmount: i.taxAmount,
                lineTotal: i.lineTotal,
                remarks: i.remarks,
              })),
            },
          },
          select: { id: true, piNumber: true },
        });
        await tx.proformaInvoiceStatusHistory.create({
          data: { proformaInvoiceId: pi.id, previousStatus: null, newStatus: ProformaStatus.DRAFT, remarks: replaces ? `Replaces cancelled ${replaces.piNumber}` : null, changedById: actor.id },
        });
        await this.audit(tx, actor, context, pi.id, 'proforma.create',
          `Created ${pi.piNumber} from quotation ${quotation.quotationNumber} revision ${revision.revisionNumber}${replaces ? ` (replaces ${replaces.piNumber})` : ''}`,
          { after: { quotationId: quotation.id, quotationRevisionId: revision.id, grandTotal: revision.grandTotal.toFixed(2), items: revision.items.length } });
        return pi;
      });
    } catch (error) {
      // A concurrent request created the PI first: the unique constraint held.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.livePiFor(revision.id);
        throw new ConflictException({
          message: `Proforma invoice ${winner?.piNumber ?? ''} already exists for this quotation.`.replace('  ', ' '),
          details: winner ? { proformaInvoiceId: winner.id, piNumber: winner.piNumber } : undefined,
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProformaDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PROFORMA_UPDATE, 'edit proforma invoices');
    const current = await this.prisma.proformaInvoice.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Proforma invoice ${id} was not found`);
    if (!EDITABLE.includes(current.status)) {
      throw new BadRequestException(`A ${label(current.status)} proforma invoice cannot be edited.${ISSUED_STATES.includes(current.status) ? ' Cancel it and raise a replacement to correct an issued PI.' : ''}`);
    }
    const contactId = dto.contactId !== undefined ? dto.contactId : current.contactId;
    if (dto.contactId !== undefined) await this.enquiriesService.assertContactOfCustomer(current.customerId, dto.contactId ?? null);
    // An unchanged assignee who has since left must not block the edit.
    if (dto.assignedToId && dto.assignedToId !== current.assignedToId) await this.assertAssignable(dto.assignedToId);
    const { piDate, dueDate } = this.validateDetails(dto, current);

    const data: Prisma.ProformaInvoiceUncheckedUpdateInput = { updatedById: actor.id, piDate, dueDate };
    const copy = ['subject', 'referenceNumber', 'internalRemarks', 'paymentTerms', 'deliveryTerms', 'warrantyTerms', 'termsAndConditions', 'notes', 'paymentInstructions'] as const;
    for (const field of copy) if (dto[field] !== undefined) data[field] = dto[field];
    if (dto.contactId !== undefined) data.contactId = dto.contactId;
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId;
    if (dto.advanceAmount !== undefined) data.advanceAmount = dto.advanceAmount ? new D(dto.advanceAmount) : null;
    if (dto.bankDetails !== undefined) data.bankDetails = (cleanBank(dto.bankDetails) ?? Prisma.JsonNull) as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const fresh = await tx.proformaInvoice.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (!EDITABLE.includes(fresh.status)) throw new ConflictException('The proforma invoice changed status in the meantime. Reload it.');
      // While a draft, the customer details follow the master record.
      data.customerSnapshot = (await this.quotationsService.customerSnapshot(current.customerId, contactId ?? null, tx)) as unknown as Prisma.InputJsonValue;
      const updated = await tx.proformaInvoice.update({ where: { id }, data, select: { id: true, piNumber: true } });
      // Only real changes (the web sends every field on save).
      const comparable = (v: unknown) => (v === undefined || v === null || v === '' ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : v instanceof Prisma.Decimal ? v.toFixed(2) : typeof v === 'object' ? JSON.stringify(cleanBank(v as BankDetails) ?? '') : /^\d+(\.\d+)?$/.test(String(v)) ? new Prisma.Decimal(String(v)).toFixed(2) : String(v));
      const changed = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined && comparable((dto as Record<string, unknown>)[k]) !== comparable((current as Record<string, unknown>)[k]));
      await this.audit(tx, actor, context, id, 'proforma.update', `Edited draft ${current.piNumber}: ${changed.join(', ') || 'no field changes'}`, {
        before: Object.fromEntries(changed.map((k) => [k, (current as Record<string, unknown>)[k] ?? null])),
        after: Object.fromEntries(changed.map((k) => [k, (dto as Record<string, unknown>)[k] ?? null])),
      });
      return updated;
    });
  }

  async changeStatus(id: string, dto: ProformaStatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const approvalRequired = await this.settingsService.getBoolean(SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED);
    const target = dto.status;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const pi = await tx.proformaInvoice.findUniqueOrThrow({ where: { id }, include: { quotation: { select: { status: true, quotationNumber: true } } } });
      const from = pi.status;
      if (!TRANSITIONS[from].includes(target)) throw new BadRequestException(`A ${label(from)} proforma invoice cannot be moved to ${label(target)}.`);

      switch (target) {
        case ProformaStatus.PENDING_APPROVAL:
          this.require(actor, PERMISSIONS.PROFORMA_SUBMIT, 'submit proforma invoices for approval');
          if (!approvalRequired) throw new BadRequestException('Approval is not enabled for proforma invoices; it can be issued directly.');
          break;
        case ProformaStatus.APPROVED:
          this.require(actor, PERMISSIONS.PROFORMA_APPROVE, 'approve proforma invoices');
          break;
        case ProformaStatus.DRAFT:
          this.require(actor, PERMISSIONS.PROFORMA_APPROVE, 'send proforma invoices back for changes');
          if (!dto.remarks) throw new BadRequestException('Say what needs to change when sending the proforma invoice back.');
          break;
        case ProformaStatus.ISSUED:
          this.require(actor, PERMISSIONS.PROFORMA_ISSUE, 'issue proforma invoices');
          if (approvalRequired && from !== ProformaStatus.APPROVED) throw new BadRequestException('This proforma invoice must be approved before it is issued.');
          // Accepted is final for quotations; re-checked so a PI can never be issued from anything else.
          if (pi.quotation.status !== QuotationStatus.ACCEPTED) throw new BadRequestException(`Quotation ${pi.quotation.quotationNumber} is no longer accepted.`);
          break;
        case ProformaStatus.SENT:
          this.require(actor, PERMISSIONS.PROFORMA_ISSUE, 'record proforma invoices as sent');
          break;
        case ProformaStatus.CANCELLED: {
          this.require(actor, PERMISSIONS.PROFORMA_CANCEL, 'cancel proforma invoices');
          if (!dto.remarks) throw new BadRequestException('Give the reason for cancelling the proforma invoice.');
          // A PI that has been invoiced stays live while its final invoice does.
          const invoice = await tx.finalInvoice.findUnique({ where: { activeProformaId: id }, select: { invoiceNumber: true } });
          if (invoice) throw new ConflictException(`This proforma invoice has final invoice ${invoice.invoiceNumber ?? '(draft)'}. Cancel or delete the invoice first.`);
          break;
        }
      }

      const now = new Date();
      const issuing = target === ProformaStatus.ISSUED;
      await tx.proformaInvoice.update({
        where: { id },
        data: {
          status: target,
          updatedById: actor.id,
          // Issuing freezes the customer details as they are now.
          ...(issuing
            ? { issuedAt: now, issuedById: actor.id, customerSnapshot: (await this.quotationsService.customerSnapshot(pi.customerId, pi.contactId, tx)) as unknown as Prisma.InputJsonValue }
            : {}),
          // Cancelling frees the accepted revision for a replacement PI.
          ...(target === ProformaStatus.CANCELLED ? { cancelledAt: now, cancellationReason: dto.remarks ?? null, activeRevisionId: null } : {}),
        },
      });
      await tx.proformaInvoiceStatusHistory.create({
        data: { proformaInvoiceId: id, previousStatus: from, newStatus: target, remarks: dto.remarks ?? null, changedById: actor.id },
      });
      const action =
        target === ProformaStatus.APPROVED ? 'proforma.approve'
        : target === ProformaStatus.PENDING_APPROVAL ? 'proforma.submit'
        : from === ProformaStatus.PENDING_APPROVAL && target === ProformaStatus.DRAFT ? 'proforma.approval.reject'
        : target === ProformaStatus.ISSUED ? 'proforma.issue'
        : target === ProformaStatus.CANCELLED ? 'proforma.cancel'
        : 'proforma.status';
      await this.audit(tx, actor, context, id, action, `${pi.piNumber}: ${label(from)} → ${label(target)}${dto.remarks ? ` (${dto.remarks})` : ''}`, {
        before: { status: from },
        after: { status: target, remarks: dto.remarks ?? null },
      });
      return { id, piNumber: pi.piNumber, status: target, issued: issuing };
    });
    // The issued document is rendered once from the frozen snapshot and stored;
    // if that fails here it is produced on the first download instead.
    if (result.issued) await this.pdfService.storeIssuedById(id, actor);
    return result;
  }

  /** Deletes a PI that was never issued and has no attachments; anything else must be cancelled. */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PROFORMA_DELETE, 'delete proforma invoices');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      // Checked under the lock, so a concurrent upload or issue cannot slip in.
      const pi = await tx.proformaInvoice.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { documents: { where: { archivedAt: null } }, finalInvoices: true } }, replacedBy: { select: { id: true } } },
      });
      if (pi.issuedAt || pi.status !== ProformaStatus.DRAFT || pi._count.documents > 0 || pi._count.finalInvoices > 0 || pi.replacedBy) {
        throw new ConflictException('Only a never-issued draft without attachments can be deleted. Cancel this proforma invoice instead to keep its history.');
      }
      // Removed (archived) attachments are detached so their audit rows survive.
      await tx.document.updateMany({ where: { proformaInvoiceId: id, archivedAt: { not: null } }, data: { proformaInvoiceId: null } });
      await tx.proformaInvoice.delete({ where: { id } });
      await this.audit(tx, actor, context, id, 'proforma.delete', `Deleted draft ${pi.piNumber}`, {
        before: { piNumber: pi.piNumber, quotationId: pi.quotationId, quotationRevisionId: pi.quotationRevisionId, grandTotal: pi.grandTotal.toFixed(2) },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private buildWhere(query: QueryProformasDto): Prisma.ProformaInvoiceWhereInput {
    const and: Prisma.ProformaInvoiceWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.quotationId) and.push({ quotationId: query.quotationId });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.amountMin) and.push({ grandTotal: { gte: new D(query.amountMin) } });
    if (query.amountMax) and.push({ grandTotal: { lte: new D(query.amountMax) } });
    if (query.dateFrom || query.dateTo) {
      and.push({ piDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } });
    }
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { piNumber: text },
          { subject: text },
          { referenceNumber: text },
          { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: { contains: normalizeName(query.search) } }] } },
          { quotation: { quotationNumber: text } },
          { assignedTo: { fullName: text } },
          { items: { some: { OR: [{ productName: text }, { productCode: text }, { modelName: text }, { modelNumber: text }] } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private listSelect = {
    id: true,
    piNumber: true,
    piDate: true,
    dueDate: true,
    status: true,
    currency: true,
    grandTotal: true,
    advanceAmount: true,
    issuedAt: true,
    createdAt: true,
    customer: { select: { id: true, name: true, customerCode: true } },
    quotation: { select: { id: true, quotationNumber: true } },
    quotationRevision: { select: { id: true, revisionNumber: true } },
    assignedTo: userSelect,
  } satisfies Prisma.ProformaInvoiceSelect;

  async findAll(query: QueryProformasDto) {
    const where = this.buildWhere(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.proformaInvoice.findMany({ where, select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }], skip: query.skip, take: query.take }),
      this.prisma.proformaInvoice.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async findAllForExport(query: QueryProformasDto) {
    return this.prisma.proformaInvoice.findMany({ where: this.buildWhere(query), select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }], take: 10_000 });
  }

  async summary() {
    const grouped = await this.prisma.proformaInvoice.groupBy({ by: ['status'], _count: { _all: true } });
    const count = (status: ProformaStatus) => grouped.find((g) => g.status === status)?._count._all ?? 0;
    // Value of live issued PIs per currency (never summed across currencies).
    const issuedValue = await this.prisma.proformaInvoice.groupBy({ by: ['currency'], where: { status: { in: ISSUED_STATES } }, _sum: { grandTotal: true } });
    return {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      draft: count(ProformaStatus.DRAFT),
      pendingApproval: count(ProformaStatus.PENDING_APPROVAL),
      approved: count(ProformaStatus.APPROVED),
      issued: count(ProformaStatus.ISSUED),
      sent: count(ProformaStatus.SENT),
      cancelled: count(ProformaStatus.CANCELLED),
      issuedValue: issuedValue.map((v) => ({ currency: v.currency, total: (v._sum.grandTotal ?? new D(0)).toFixed(2) })),
      approvalRequired: await this.settingsService.getBoolean(SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED),
      /** Payment Management is not part of the application yet; no payment figures exist. */
      paymentTrackingAvailable: false,
      generatedAt: new Date().toISOString(),
    };
  }

  async findOne(id: string) {
    const pi = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        customer: { select: { id: true, name: true, customerCode: true, customerType: true, status: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
        quotation: {
          select: {
            id: true,
            quotationNumber: true,
            status: true,
            enquiry: { select: { id: true, enquiryNumber: true } },
            statusHistory: { where: { newStatus: QuotationStatus.ACCEPTED }, orderBy: { changedAt: 'desc' }, take: 1, select: { changedAt: true } },
          },
        },
        quotationRevision: { select: { id: true, revisionNumber: true, quotationDate: true, grandTotal: true, validUntil: true } },
        replaces: { select: { id: true, piNumber: true, status: true } },
        replacedBy: { select: { id: true, piNumber: true, status: true } },
        assignedTo: userSelect,
        issuedBy: userSelect,
        createdBy: userSelect,
        updatedBy: userSelect,
        statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
        pdfDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
        finalInvoices: { orderBy: { createdAt: 'desc' }, select: { id: true, invoiceNumber: true, status: true, invoiceDate: true, grandTotal: true, activeProformaId: true } },
        documents: {
          where: { archivedAt: null },
          select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!pi) throw new NotFoundException(`Proforma invoice ${id} was not found`);
    const { statusHistory: acceptedHistory, ...quotation } = pi.quotation;
    return {
      ...pi,
      quotation: { ...quotation, acceptedAt: acceptedHistory[0]?.changedAt ?? null },
      approvalRequired: await this.settingsService.getBoolean(SETTING_KEYS.PROFORMA_APPROVAL_REQUIRED),
      deletable: !pi.issuedAt && pi.status === ProformaStatus.DRAFT && pi.documents.filter((d) => d.kind !== 'PROFORMA_PDF').length === 0 && !pi.replacedBy,
    };
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: PROFORMA_ENTITY, entityId: id }, { parentEntityType: PROFORMA_ENTITY, parentEntityId: id }] };
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

  async assertExists(id: string, options: { notCancelled?: boolean } = {}) {
    const pi = await this.prisma.proformaInvoice.findUnique({ where: { id }, select: { id: true, piNumber: true, status: true } });
    if (!pi) throw new NotFoundException(`Proforma invoice ${id} was not found`);
    if (options.notCancelled && pi.status === ProformaStatus.CANCELLED) throw new BadRequestException('Documents of a cancelled proforma invoice cannot be changed.');
    return pi;
  }

  async assignees() {
    return this.enquiriesService.assignableUsers();
  }

  /**
   * Payment Management (Module 7) contract. Read-only: payments will be
   * recorded against `proformaInvoiceId`; the outstanding amount and payment
   * status will be derived from those records, never stored by hand.
   */
  async paymentHandoff(id: string) {
    const pi = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      select: { id: true, piNumber: true, status: true, customerId: true, quotationId: true, quotationRevisionId: true, currency: true, grandTotal: true, advanceAmount: true, dueDate: true, issuedAt: true },
    });
    if (!pi) throw new NotFoundException(`Proforma invoice ${id} was not found`);
    const payable = ISSUED_STATES.includes(pi.status);
    return {
      ...pi,
      grandTotal: pi.grandTotal.toFixed(2),
      advanceAmount: pi.advanceAmount?.toFixed(2) ?? null,
      payable,
      problems: payable ? [] : [`A ${label(pi.status)} proforma invoice cannot receive payments; it must be issued first.`],
      paymentModuleAvailable: false,
    };
  }
}
