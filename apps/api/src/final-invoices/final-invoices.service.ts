import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FinalInvoiceStatus, InvoicePaymentState, PaymentStatus, Prisma, ProformaStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { CustomersService } from '../customers/customers.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { QuotationsService } from '../quotations/quotations.service';
import { BRANDING_SETTING_KEYS, SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { buildPaginatedResult, type PaginationQueryDto } from '../common/dto/pagination.dto';
import { normalizedNameFilter } from '../common/utils/normalize';
import { businessToday } from '../common/utils/business-date';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { BankDetailsDto } from '../proforma-invoices/dto/proforma.dto';
import type {
  CreateFinalInvoiceDto,
  EligibleProformasQueryDto,
  FinalInvoiceDetailsDto,
  FinalInvoiceStatusDto,
  InvoiceNumberingDto,
  QueryFinalInvoicesDto,
  ReportQueryDto,
  UpdateFinalInvoiceDto,
} from './dto/final-invoice.dto';
import {
  DEFAULT_NUMBERING,
  EDITABLE,
  formatInvoiceNumber,
  GST_MAX_INVOICE_NUMBER_LENGTH,
  ISSUED_STATES,
  label,
  sequenceFor,
  TRANSITIONS,
  type InvoiceNumbering,
} from './final-invoice-rules';
import { FinalInvoicePdfService } from './final-invoice-pdf.service';

export const FINAL_INVOICE_ENTITY = 'FinalInvoice';
type Tx = Prisma.TransactionClient;
type Bank = { bankName?: string; accountName?: string; accountNumber?: string; ifsc?: string; swift?: string; branch?: string };
const userSelect = { select: { id: true, fullName: true } } as const;
const D = Prisma.Decimal;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const PI_INVOICEABLE: ProformaStatus[] = [ProformaStatus.ISSUED, ProformaStatus.SENT];

function cleanBank(value: BankDetailsDto | Bank | null | undefined): Bank | null {
  if (!value) return null;
  const entries = Object.entries(value).filter(([, v]) => typeof v === 'string' && v.trim());
  return entries.length ? (Object.fromEntries(entries.map(([k, v]) => [k, (v as string).trim()])) as Bank) : null;
}

/** Comparable form of a stored value, so audit "changed" lists only real changes. */
const comparable = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value instanceof D) return value.toFixed(2);
  if (typeof value === 'object') return JSON.stringify(cleanBank(value as Bank) ?? '');
  return String(value);
};

/**
 * Module 7 - Final Invoice Management (the actual customer invoice).
 *
 * Raised from an issued proforma invoice (Module 6), which in turn equals the
 * revision of the quotation the customer accepted. Lines and every amount are
 * copied from the PI - never recalculated, never accepted from the client.
 * Only invoice-specific details are editable, and only while a draft. The
 * invoice number is allocated when the invoice is issued.
 *
 * Payment Management will attach payments through paymentHandoff(); amount
 * received, outstanding and paid status are never stored or set by hand here.
 */
@Injectable()
export class FinalInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly customersService: CustomersService,
    private readonly enquiriesService: EnquiriesService,
    private readonly quotationsService: QuotationsService,
    private readonly settingsService: SettingsService,
    private readonly pdfService: FinalInvoicePdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`You do not have permission to ${action}.`);
  }

  private audit(tx: Tx | undefined, actor: AuthenticatedUser, context: RequestContext | null, id: string, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.auditService.record(
      { actorUserId: actor.id, action, entityType: FINAL_INVOICE_ENTITY, entityId: id, summary, ...extra, ipAddress: context?.ipAddress ?? null, userAgent: context?.userAgent ?? null },
      tx,
    );
  }

  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM final_invoices WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(`Final invoice ${id} was not found`);
  }

  private validateDates(dto: FinalInvoiceDetailsDto, current: { invoiceDate: Date; dueDate: Date | null }) {
    const invoiceDate = dto.invoiceDate ? dateOnly(dto.invoiceDate) : current.invoiceDate;
    const dueDate = dto.dueDate === undefined ? current.dueDate : dto.dueDate ? dateOnly(dto.dueDate) : null;
    if (dueDate && dueDate < invoiceDate) throw new BadRequestException('The due date cannot be before the invoice date.');
    return { invoiceDate, dueDate };
  }

  /** Display reference: the invoice number once issued, otherwise a draft marker. */
  private ref(inv: { invoiceNumber: string | null; id: string }) {
    return inv.invoiceNumber ?? `Draft ${inv.id.slice(0, 8)}`;
  }

  // -------------------------------------------------------------------------
  // Settings (approval switch and invoice numbering)
  // -------------------------------------------------------------------------

  async numbering(): Promise<InvoiceNumbering> {
    const stored = await this.settingsService.get<Partial<InvoiceNumbering> | null>(BRANDING_SETTING_KEYS.INVOICE_NUMBERING);
    return { ...DEFAULT_NUMBERING, ...(stored ?? {}) };
  }

  async getSettings() {
    const [numbering, approvalRequired] = await Promise.all([this.numbering(), this.settingsService.getBoolean(SETTING_KEYS.INVOICE_APPROVAL_REQUIRED)]);
    const { key, prefix } = sequenceFor(numbering, businessToday());
    const row = await this.prisma.documentSequence.findUnique({ where: { key }, select: { nextValue: true } });
    const nextNumber = formatInvoiceNumber(prefix, numbering.padding, row?.nextValue ?? 1);
    return {
      approvalRequired,
      numbering,
      nextNumber,
      /** Configured and in use, or still the untouched default (confirm before production). */
      numberingConfirmed: (await this.settingsService.get<unknown>(BRANDING_SETTING_KEYS.INVOICE_NUMBERING)) !== null,
      warnings: nextNumber.length > GST_MAX_INVOICE_NUMBER_LENGTH ? [`Invoice numbers like ${nextNumber} have ${nextNumber.length} characters; GST rules allow at most ${GST_MAX_INVOICE_NUMBER_LENGTH}. Shorten the prefix or padding if GST applies.`] : [],
    };
  }

  async getSettingsFor(actor: AuthenticatedUser) {
    if (!actor.permissions.includes(PERMISSIONS.INVOICE_READ) && !actor.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)) {
      throw new ForbiddenException('You do not have permission to view invoice settings.');
    }
    return this.getSettings();
  }

  async updateNumbering(dto: InvoiceNumberingDto, actor: AuthenticatedUser) {
    await this.settingsService.set(BRANDING_SETTING_KEYS.INVOICE_NUMBERING, { prefix: dto.prefix, padding: dto.padding, financialYear: dto.financialYear, fyStartMonth: dto.fyStartMonth }, actor);
    return this.getSettings();
  }

  /**
   * Allocates the next invoice number for an invoice dated `invoiceDate`,
   * inside the caller's transaction: if the issue rolls back, so does the
   * number (no gaps). The sequence row is created on first use of a series.
   */
  private async allocateNumber(tx: Tx, invoiceDate: Date) {
    const numbering = await this.numbering();
    const { key, prefix } = sequenceFor(numbering, invoiceDate);
    await tx.$executeRaw`
      INSERT INTO document_sequences (id, key, prefix, padding, "nextValue", "updatedAt")
      VALUES (gen_random_uuid(), ${key}, ${prefix}, ${numbering.padding}, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET prefix = EXCLUDED.prefix, padding = EXCLUDED.padding`;
    return this.numberingService.allocate(key, tx);
  }

  // -------------------------------------------------------------------------
  // Proforma integration
  // -------------------------------------------------------------------------

  /** Issued / sent PIs without a live final invoice. */
  async eligibleProformas(query: EligibleProformasQueryDto) {
    const and: Prisma.ProformaInvoiceWhereInput[] = [{ status: { in: PI_INVOICEABLE } }, { finalInvoices: { none: { activeProformaId: { not: null } } } }];
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({ OR: [{ piNumber: text }, { quotation: { quotationNumber: text } }, { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: normalizedNameFilter(query.search) }] } }] });
    }
    const where: Prisma.ProformaInvoiceWhereInput = { AND: and };
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.proformaInvoice.findMany({
        where,
        select: {
          id: true,
          piNumber: true,
          piDate: true,
          status: true,
          currency: true,
          grandTotal: true,
          customer: { select: { id: true, name: true, customerCode: true } },
          contact: { select: { id: true, name: true } },
          quotation: { select: { id: true, quotationNumber: true } },
          finalInvoices: { where: { status: FinalInvoiceStatus.CANCELLED }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, invoiceNumber: true } },
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.proformaInvoice.count({ where }),
    ]);
    const items = rows.map(({ finalInvoices, ...pi }) => ({ ...pi, cancelledInvoice: finalInvoices[0] ?? null }));
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  private async loadProforma(proformaInvoiceId: string, client: Tx | PrismaService = this.prisma) {
    const pi = await client.proformaInvoice.findUnique({
      where: { id: proformaInvoiceId },
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        quotation: { select: { id: true, quotationNumber: true, enquiry: { select: { id: true, enquiryNumber: true } } } },
        quotationRevision: { select: { id: true, revisionNumber: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
      },
    });
    if (!pi) throw new NotFoundException(`Proforma invoice ${proformaInvoiceId} was not found`);
    if (!PI_INVOICEABLE.includes(pi.status)) {
      throw new BadRequestException({
        message: 'Only an issued proforma invoice can be converted into a final invoice.',
        details: { problems: [`Proforma invoice ${pi.piNumber} is ${pi.status.toLowerCase().replace(/_/g, ' ')}.`] },
      });
    }
    return pi;
  }

  private liveInvoiceFor(proformaInvoiceId: string, client: Tx | PrismaService = this.prisma) {
    return client.finalInvoice.findUnique({ where: { activeProformaId: proformaInvoiceId }, select: { id: true, invoiceNumber: true, status: true } });
  }

  /** Pre-fill for a new invoice: everything comes from the PI. Creates nothing. */
  async fromProforma(proformaInvoiceId: string, actor: AuthenticatedUser) {
    this.require(actor, PERMISSIONS.INVOICE_CREATE, 'create invoices');
    const pi = await this.loadProforma(proformaInvoiceId);
    const [existing, contacts, cancelled, approvalRequired] = await Promise.all([
      this.liveInvoiceFor(pi.id),
      this.prisma.customerContact.findMany({ where: { customerId: pi.customerId }, select: { id: true, name: true, designation: true, isPrimary: true }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      this.prisma.finalInvoice.findFirst({ where: { proformaInvoiceId: pi.id, status: FinalInvoiceStatus.CANCELLED, replacedBy: null }, orderBy: { createdAt: 'desc' }, select: { id: true, invoiceNumber: true } }),
      this.settingsService.getBoolean(SETTING_KEYS.INVOICE_APPROVAL_REQUIRED),
    ]);
    const problems = existing ? [`Final invoice ${this.ref(existing)} already exists for this proforma invoice (${label(existing.status)}). Cancel it first to raise a replacement.`] : [];
    return {
      ready: problems.length === 0,
      problems,
      existingInvoice: existing,
      replaces: cancelled,
      proforma: {
        id: pi.id,
        piNumber: pi.piNumber,
        piDate: pi.piDate,
        status: pi.status,
        issuedAt: pi.issuedAt,
        dueDate: pi.dueDate,
        advanceAmount: pi.advanceAmount,
        quotation: pi.quotation,
        quotationRevision: pi.quotationRevision,
      },
      customer: pi.customer,
      customerSnapshot: await this.quotationsService.customerSnapshot(pi.customerId, pi.contactId),
      contacts,
      contactId: pi.contactId,
      assignedToId: pi.assignedToId,
      currency: pi.currency,
      items: pi.items.map(({ id, proformaInvoiceId: _pi, sortOrder: _s, createdAt: _c, ...item }) => ({ proformaInvoiceItemId: id, ...item })),
      totals: {
        subtotal: pi.subtotal,
        itemDiscountTotal: pi.itemDiscountTotal,
        additionalDiscount: pi.additionalDiscount,
        taxableAmount: pi.taxableAmount,
        taxTotal: pi.taxTotal,
        otherChargesLabel: pi.otherChargesLabel,
        otherCharges: pi.otherCharges,
        grandTotal: pi.grandTotal,
        taxBreakdown: pi.taxBreakdown,
      },
      terms: { paymentTerms: pi.paymentTerms, deliveryTerms: pi.deliveryTerms, warrantyTerms: pi.warrantyTerms, termsAndConditions: pi.termsAndConditions, notes: pi.notes, paymentInstructions: pi.paymentInstructions },
      defaults: { invoiceDate: businessToday().toISOString().slice(0, 10), bankDetails: pi.bankDetails, purchaseOrderNumber: pi.referenceNumber, subject: pi.subject },
      approvalRequired,
    };
  }

  // -------------------------------------------------------------------------
  // Create / edit / delete
  // -------------------------------------------------------------------------

  async create(dto: CreateFinalInvoiceDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.INVOICE_CREATE, 'create invoices');
    const pi = await this.loadProforma(dto.proformaInvoiceId);
    await this.customersService.assertSelectableForTransaction(pi.customerId, actor);
    const contactId = dto.contactId !== undefined ? dto.contactId : pi.contactId;
    await this.enquiriesService.assertContactOfCustomer(pi.customerId, contactId ?? null);
    const assignedToId = dto.assignedToId !== undefined ? dto.assignedToId : pi.assignedToId;
    // Only a newly chosen assignee must be active; the PI's own assignee may have left.
    if (dto.assignedToId && dto.assignedToId !== pi.assignedToId) await this.enquiriesService.assertAssignableUser(dto.assignedToId);
    const { invoiceDate, dueDate } = this.validateDates(dto, { invoiceDate: businessToday(), dueDate: null });

    const existing = await this.liveInvoiceFor(pi.id);
    if (existing) {
      throw new ConflictException({ message: `Final invoice ${this.ref(existing)} already exists for this proforma invoice.`, details: { finalInvoiceId: existing.id } });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // The PI could have been cancelled meanwhile: re-check under its row lock.
        await tx.$queryRaw`SELECT id FROM proforma_invoices WHERE id = ${pi.id}::uuid FOR UPDATE`;
        const fresh = await tx.proformaInvoice.findUniqueOrThrow({ where: { id: pi.id }, select: { status: true } });
        if (!PI_INVOICEABLE.includes(fresh.status)) throw new ConflictException('The proforma invoice changed status in the meantime.');
        const replaces = await tx.finalInvoice.findFirst({
          where: { proformaInvoiceId: pi.id, status: FinalInvoiceStatus.CANCELLED, replacedBy: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, invoiceNumber: true },
        });
        const snapshot = await this.quotationsService.customerSnapshot(pi.customerId, contactId ?? null, tx);
        const invoice = await tx.finalInvoice.create({
          data: {
            proformaInvoiceId: pi.id,
            activeProformaId: pi.id,
            replacesId: replaces?.id ?? null,
            quotationId: pi.quotationId,
            quotationRevisionId: pi.quotationRevisionId,
            customerId: pi.customerId,
            contactId: contactId ?? null,
            assignedToId: assignedToId ?? null,
            status: FinalInvoiceStatus.DRAFT,
            invoiceDate,
            dueDate,
            currency: pi.currency,
            subject: dto.subject !== undefined ? dto.subject : pi.subject,
            purchaseOrderNumber: dto.purchaseOrderNumber !== undefined ? dto.purchaseOrderNumber : pi.referenceNumber,
            internalRemarks: dto.internalRemarks ?? null,
            customerSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            subtotal: pi.subtotal,
            itemDiscountTotal: pi.itemDiscountTotal,
            additionalDiscount: pi.additionalDiscount,
            taxableAmount: pi.taxableAmount,
            taxTotal: pi.taxTotal,
            otherChargesLabel: pi.otherChargesLabel,
            otherCharges: pi.otherCharges,
            grandTotal: pi.grandTotal,
            taxBreakdown: (pi.taxBreakdown ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            paymentTerms: dto.paymentTerms !== undefined ? dto.paymentTerms : pi.paymentTerms,
            deliveryTerms: dto.deliveryTerms !== undefined ? dto.deliveryTerms : pi.deliveryTerms,
            warrantyTerms: dto.warrantyTerms !== undefined ? dto.warrantyTerms : pi.warrantyTerms,
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : pi.termsAndConditions,
            notes: dto.notes !== undefined ? dto.notes : pi.notes,
            paymentInstructions: dto.paymentInstructions !== undefined ? dto.paymentInstructions : pi.paymentInstructions,
            bankDetails: (cleanBank(dto.bankDetails !== undefined ? dto.bankDetails : (pi.bankDetails as Bank | null)) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            createdById: actor.id,
            updatedById: actor.id,
            items: {
              create: pi.items.map((i, index) => ({
                sortOrder: index,
                proformaInvoiceItemId: i.id,
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
          select: { id: true, invoiceNumber: true },
        });
        await tx.finalInvoiceStatusHistory.create({
          data: { finalInvoiceId: invoice.id, previousStatus: null, newStatus: FinalInvoiceStatus.DRAFT, remarks: replaces ? `Replaces cancelled ${replaces.invoiceNumber ?? 'draft'}` : null, changedById: actor.id },
        });
        await this.audit(tx, actor, context, invoice.id, 'invoice.create', `Created draft invoice from proforma invoice ${pi.piNumber}${replaces ? ` (replaces ${replaces.invoiceNumber ?? 'a cancelled draft'})` : ''}`, {
          after: { proformaInvoiceId: pi.id, grandTotal: pi.grandTotal.toFixed(2), items: pi.items.length },
        });
        return invoice;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.liveInvoiceFor(pi.id);
        throw new ConflictException({ message: 'A final invoice already exists for this proforma invoice.', details: winner ? { finalInvoiceId: winner.id } : undefined });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateFinalInvoiceDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.INVOICE_UPDATE, 'edit invoices');
    const current = await this.prisma.finalInvoice.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Final invoice ${id} was not found`);
    if (!EDITABLE.includes(current.status)) {
      throw new BadRequestException(`A ${label(current.status)} invoice cannot be edited.${ISSUED_STATES.includes(current.status) ? ' Issued invoices are never changed; cancel and raise a replacement if your business rules allow it.' : ''}`);
    }
    const contactId = dto.contactId !== undefined ? dto.contactId : current.contactId;
    if (dto.contactId !== undefined) await this.enquiriesService.assertContactOfCustomer(current.customerId, dto.contactId ?? null);
    if (dto.assignedToId && dto.assignedToId !== current.assignedToId) await this.enquiriesService.assertAssignableUser(dto.assignedToId);
    const { invoiceDate, dueDate } = this.validateDates(dto, current);

    const data: Prisma.FinalInvoiceUncheckedUpdateInput = { updatedById: actor.id, invoiceDate, dueDate };
    const copy = ['subject', 'purchaseOrderNumber', 'internalRemarks', 'paymentTerms', 'deliveryTerms', 'warrantyTerms', 'termsAndConditions', 'notes', 'paymentInstructions', 'contactId', 'assignedToId'] as const;
    for (const field of copy) if (dto[field] !== undefined) data[field] = dto[field];
    if (dto.bankDetails !== undefined) data.bankDetails = (cleanBank(dto.bankDetails) ?? Prisma.JsonNull) as Prisma.InputJsonValue;

    const changed = (Object.keys(dto) as Array<keyof UpdateFinalInvoiceDto>).filter((k) => dto[k] !== undefined && comparable(dto[k]) !== comparable((current as Record<string, unknown>)[k]));

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const fresh = await tx.finalInvoice.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (!EDITABLE.includes(fresh.status)) throw new ConflictException('The invoice changed status in the meantime. Reload it.');
      data.customerSnapshot = (await this.quotationsService.customerSnapshot(current.customerId, contactId ?? null, tx)) as unknown as Prisma.InputJsonValue;
      const updated = await tx.finalInvoice.update({ where: { id }, data, select: { id: true, invoiceNumber: true } });
      await this.audit(tx, actor, context, id, 'invoice.update', `Edited draft invoice: ${changed.join(', ') || 'no field changes'}`, {
        before: Object.fromEntries(changed.map((k) => [k, (current as Record<string, unknown>)[k] ?? null])),
        after: Object.fromEntries(changed.map((k) => [k, dto[k] ?? null])),
      });
      return updated;
    });
  }

  async changeStatus(id: string, dto: FinalInvoiceStatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const approvalRequired = await this.settingsService.getBoolean(SETTING_KEYS.INVOICE_APPROVAL_REQUIRED);
    const target = dto.status;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const inv = await tx.finalInvoice.findUniqueOrThrow({ where: { id }, include: { proformaInvoice: { select: { status: true, piNumber: true } } } });
      const from = inv.status;
      if (!TRANSITIONS[from].includes(target)) throw new BadRequestException(`A ${label(from)} invoice cannot be moved to ${label(target)}.`);

      switch (target) {
        case FinalInvoiceStatus.PENDING_APPROVAL:
          this.require(actor, PERMISSIONS.INVOICE_SUBMIT, 'submit invoices for approval');
          if (!approvalRequired) throw new BadRequestException('Approval is not enabled for invoices; it can be issued directly.');
          break;
        case FinalInvoiceStatus.APPROVED:
          this.require(actor, PERMISSIONS.INVOICE_APPROVE, 'approve invoices');
          break;
        case FinalInvoiceStatus.DRAFT:
          this.require(actor, PERMISSIONS.INVOICE_APPROVE, 'send invoices back for changes');
          if (!dto.remarks) throw new BadRequestException('Say what needs to change when sending the invoice back.');
          break;
        case FinalInvoiceStatus.ISSUED:
          this.require(actor, PERMISSIONS.INVOICE_ISSUE, 'issue invoices');
          if (approvalRequired && from !== FinalInvoiceStatus.APPROVED) throw new BadRequestException('This invoice must be approved before it is issued.');
          if (!PI_INVOICEABLE.includes(inv.proformaInvoice.status)) throw new BadRequestException(`Proforma invoice ${inv.proformaInvoice.piNumber} is no longer issued.`);
          break;
        case FinalInvoiceStatus.SENT:
          this.require(actor, PERMISSIONS.INVOICE_ISSUE, 'record invoices as sent');
          break;
        case FinalInvoiceStatus.CANCELLED:
          this.require(actor, PERMISSIONS.INVOICE_CANCEL, 'cancel invoices');
          if (!dto.remarks) throw new BadRequestException('Give the reason for cancelling the invoice.');
          {
            // Money already recorded against the invoice must be rejected or reversed first.
            const live = await tx.paymentAllocation.count({ where: { finalInvoiceId: id, payment: { status: { in: [PaymentStatus.VERIFIED, PaymentStatus.PENDING_VERIFICATION] } } } });
            if (live > 0) throw new ConflictException(`This invoice has ${live} verified or pending payment(s). Reverse or reject them in Payment Management before cancelling.`);
          }
          break;
      }

      const now = new Date();
      const issuing = target === FinalInvoiceStatus.ISSUED;
      // The number is allocated in this transaction: a failed issue consumes nothing.
      const invoiceNumber = issuing ? await this.allocateNumber(tx, inv.invoiceDate) : inv.invoiceNumber;
      await tx.finalInvoice.update({
        where: { id },
        data: {
          status: target,
          updatedById: actor.id,
          ...(issuing
            ? { invoiceNumber, issuedAt: now, issuedById: actor.id, customerSnapshot: (await this.quotationsService.customerSnapshot(inv.customerId, inv.contactId, tx)) as unknown as Prisma.InputJsonValue }
            : {}),
          ...(target === FinalInvoiceStatus.CANCELLED ? { cancelledAt: now, cancellationReason: dto.remarks ?? null, activeProformaId: null } : {}),
        },
      });
      await tx.finalInvoiceStatusHistory.create({ data: { finalInvoiceId: id, previousStatus: from, newStatus: target, remarks: dto.remarks ?? null, changedById: actor.id } });
      const action =
        target === FinalInvoiceStatus.APPROVED ? 'invoice.approve'
        : target === FinalInvoiceStatus.PENDING_APPROVAL ? 'invoice.submit'
        : from === FinalInvoiceStatus.PENDING_APPROVAL && target === FinalInvoiceStatus.DRAFT ? 'invoice.approval.reject'
        : issuing ? 'invoice.issue'
        : target === FinalInvoiceStatus.CANCELLED ? 'invoice.cancel'
        : 'invoice.status';
      await this.audit(tx, actor, context, id, action, `${invoiceNumber ?? 'Draft invoice'}: ${label(from)} → ${label(target)}${dto.remarks ? ` (${dto.remarks})` : ''}`, {
        before: { status: from },
        after: { status: target, invoiceNumber, remarks: dto.remarks ?? null },
      });
      return { id, invoiceNumber, status: target, issued: issuing };
    });
    if (result.issued) await this.pdfService.storeIssuedById(id, actor);
    return result;
  }

  async remove(id: string, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.INVOICE_DELETE, 'delete invoices');
    const refuse = () => new ConflictException('Only a never-issued draft without attachments can be deleted. Cancel this invoice instead to keep its history.');
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      // Checked under the lock, so a concurrent upload or issue cannot slip in.
      const inv = await tx.finalInvoice.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { documents: { where: { archivedAt: null } } } }, replacedBy: { select: { id: true } } },
      });
      if (inv.issuedAt || inv.invoiceNumber || inv.status !== FinalInvoiceStatus.DRAFT || inv._count.documents > 0 || inv.replacedBy) throw refuse();
      await tx.document.updateMany({ where: { finalInvoiceId: id, archivedAt: { not: null } }, data: { finalInvoiceId: null } });
      await tx.finalInvoice.delete({ where: { id } });
      await this.audit(tx, actor, context, id, 'invoice.delete', `Deleted draft invoice for proforma invoice ${inv.proformaInvoiceId}`, {
        before: { proformaInvoiceId: inv.proformaInvoiceId, grandTotal: inv.grandTotal.toFixed(2) },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private buildWhere(query: QueryFinalInvoicesDto): Prisma.FinalInvoiceWhereInput {
    const and: Prisma.FinalInvoiceWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.proformaInvoiceId) and.push({ proformaInvoiceId: query.proformaInvoiceId });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.amountMin) and.push({ grandTotal: { gte: new D(query.amountMin) } });
    if (query.amountMax) and.push({ grandTotal: { lte: new D(query.amountMax) } });
    if (query.dateFrom || query.dateTo) and.push({ invoiceDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } });
    if (query.dueFrom || query.dueTo) and.push({ dueDate: { ...(query.dueFrom ? { gte: dateOnly(query.dueFrom) } : {}), ...(query.dueTo ? { lte: dateOnly(query.dueTo) } : {}) } });
    if (query.paymentState?.length) and.push({ status: { in: ISSUED_STATES }, paymentState: { in: query.paymentState } });
    // Overdue = issued, due date passed and not fully paid (by verified payments).
    if (query.pastDueOnly) and.push({ status: { in: ISSUED_STATES }, dueDate: { lt: businessToday() }, paymentState: { not: InvoicePaymentState.PAID } });
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { invoiceNumber: text },
          { purchaseOrderNumber: text },
          { subject: text },
          { proformaInvoice: { piNumber: text } },
          { quotation: { quotationNumber: text } },
          { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: normalizedNameFilter(query.search) }] } },
          { assignedTo: { fullName: text } },
          { items: { some: { OR: [{ productName: text }, { productCode: text }, { modelName: text }, { modelNumber: text }] } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private listSelect = {
    id: true,
    invoiceNumber: true,
    invoiceDate: true,
    dueDate: true,
    status: true,
    currency: true,
    grandTotal: true,
    taxTotal: true,
    amountReceived: true,
    paymentState: true,
    purchaseOrderNumber: true,
    issuedAt: true,
    createdAt: true,
    customer: { select: { id: true, name: true, customerCode: true } },
    proformaInvoice: { select: { id: true, piNumber: true } },
    quotation: { select: { id: true, quotationNumber: true } },
    assignedTo: userSelect,
  } satisfies Prisma.FinalInvoiceSelect;

  /** Overdue = issued, due date passed and not fully paid; plus the outstanding balance. */
  private withDueFlag<T extends { status: FinalInvoiceStatus; dueDate: Date | null; grandTotal: Prisma.Decimal; amountReceived: Prisma.Decimal; paymentState: InvoicePaymentState }>(row: T) {
    const today = businessToday();
    return {
      ...row,
      outstanding: D.max(row.grandTotal.minus(row.amountReceived), 0).toFixed(2),
      pastDue: Boolean(row.dueDate && row.dueDate < today && ISSUED_STATES.includes(row.status) && row.paymentState !== InvoicePaymentState.PAID),
    };
  }

  async findAll(query: QueryFinalInvoicesDto) {
    const where = this.buildWhere(query);
    const [items, totalItems] = await this.prisma.$transaction([
      // Unnumbered drafts sort last when ordering by number.
      this.prisma.finalInvoice.findMany({ where, select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortBy === 'invoiceNumber' || query.sortBy === 'dueDate' ? { sort: query.sortDir, nulls: 'last' } : query.sortDir }, { id: 'asc' }], skip: query.skip, take: query.take }),
      this.prisma.finalInvoice.count({ where }),
    ]);
    return buildPaginatedResult(items.map((r) => this.withDueFlag(r)), totalItems, query.page, query.pageSize);
  }

  async findAllForExport(query: QueryFinalInvoicesDto) {
    const rows = await this.prisma.finalInvoice.findMany({ where: this.buildWhere(query), select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }], take: 10_000 });
    return rows.map((r) => this.withDueFlag(r));
  }

  async summary() {
    const today = businessToday();
    const live = { status: { in: ISSUED_STATES } };
    const [grouped, invoiced, pastDue, byPayment] = await Promise.all([
      this.prisma.finalInvoice.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.finalInvoice.groupBy({ by: ['currency'], where: live, _sum: { grandTotal: true, amountReceived: true }, _count: { _all: true } }),
      this.prisma.finalInvoice.count({ where: { ...live, dueDate: { lt: today }, paymentState: { not: InvoicePaymentState.PAID } } }),
      this.prisma.finalInvoice.groupBy({ by: ['paymentState'], where: live, _count: { _all: true } }),
    ]);
    const payCount = (s: InvoicePaymentState) => byPayment.find((g) => g.paymentState === s)?._count._all ?? 0;
    const count = (s: FinalInvoiceStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    return {
      total: grouped.reduce((sum, g) => sum + g._count._all, 0),
      draft: count(FinalInvoiceStatus.DRAFT),
      pendingApproval: count(FinalInvoiceStatus.PENDING_APPROVAL),
      approved: count(FinalInvoiceStatus.APPROVED),
      issued: count(FinalInvoiceStatus.ISSUED),
      sent: count(FinalInvoiceStatus.SENT),
      cancelled: count(FinalInvoiceStatus.CANCELLED),
      /** Issued, not fully paid invoices whose due date has passed. */
      pastDue,
      unpaid: payCount(InvoicePaymentState.UNPAID),
      partiallyPaid: payCount(InvoicePaymentState.PARTIALLY_PAID),
      fullyPaid: payCount(InvoicePaymentState.PAID),
      /** Live issued invoices per currency (never summed across currencies); received = verified payments. */
      invoicedValue: invoiced.map((v) => {
        const total = v._sum.grandTotal ?? new D(0);
        const received = v._sum.amountReceived ?? new D(0);
        return { currency: v.currency, count: v._count._all, total: total.toFixed(2), received: received.toFixed(2), outstanding: D.max(total.minus(received), 0).toFixed(2) };
      }),
      approvalRequired: await this.settingsService.getBoolean(SETTING_KEYS.INVOICE_APPROVAL_REQUIRED),
      paymentTrackingAvailable: true,
      generatedAt: new Date().toISOString(),
    };
  }

  async findOne(id: string) {
    const inv = await this.prisma.finalInvoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        customer: { select: { id: true, name: true, customerCode: true, customerType: true, status: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
        proformaInvoice: { select: { id: true, piNumber: true, piDate: true, status: true, grandTotal: true, issuedAt: true, advanceAmount: true } },
        quotation: { select: { id: true, quotationNumber: true, enquiry: { select: { id: true, enquiryNumber: true } } } },
        quotationRevision: { select: { id: true, revisionNumber: true, quotationDate: true, grandTotal: true } },
        replaces: { select: { id: true, invoiceNumber: true, status: true } },
        replacedBy: { select: { id: true, invoiceNumber: true, status: true } },
        assignedTo: userSelect,
        issuedBy: userSelect,
        createdBy: userSelect,
        updatedBy: userSelect,
        statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
        pdfDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
        paymentAllocations: {
          orderBy: { createdAt: 'asc' },
          select: { amount: true, payment: { select: { id: true, receiptNumber: true, paymentDate: true, amount: true, method: true, transactionReference: true, status: true, verifiedAt: true } } },
        },
        documents: {
          where: { archivedAt: null },
          select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!inv) throw new NotFoundException(`Final invoice ${id} was not found`);
    const pending = inv.paymentAllocations.filter((a) => a.payment.status === PaymentStatus.PENDING_VERIFICATION).reduce((sum, a) => sum.plus(a.amount), new D(0));
    return {
      ...this.withDueFlag(inv),
      approvalRequired: await this.settingsService.getBoolean(SETTING_KEYS.INVOICE_APPROVAL_REQUIRED),
      deletable: !inv.issuedAt && !inv.invoiceNumber && inv.status === FinalInvoiceStatus.DRAFT && inv.documents.filter((d) => d.kind !== 'FINAL_INVOICE_PDF').length === 0 && !inv.replacedBy,
      // Payment Management is the source of truth; these are derived from verified payments.
      payments: {
        available: true,
        received: inv.amountReceived.toFixed(2),
        outstanding: D.max(inv.grandTotal.minus(inv.amountReceived), 0).toFixed(2),
        pendingVerification: pending.toFixed(2),
        state: inv.paymentState,
        transactions: inv.paymentAllocations.map((a) => ({ ...a.payment, allocated: a.amount })),
      },
    };
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: FINAL_INVOICE_ENTITY, entityId: id }, { parentEntityType: FINAL_INVOICE_ENTITY, parentEntityId: id }] };
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
    const inv = await this.prisma.finalInvoice.findUnique({ where: { id }, select: { id: true, invoiceNumber: true, status: true } });
    if (!inv) throw new NotFoundException(`Final invoice ${id} was not found`);
    if (options.notCancelled && inv.status === FinalInvoiceStatus.CANCELLED) throw new BadRequestException('Documents of a cancelled invoice cannot be changed.');
    return inv;
  }

  async assignees() {
    return this.enquiriesService.assignableUsers();
  }

  /**
   * Reports from issued (live) invoices only - drafts and cancelled invoices
   * are excluded. Amounts are grouped per currency, never summed across them.
   */
  async reports(query: ReportQueryDto) {
    const from = query.dateFrom ? dateOnly(query.dateFrom) : null;
    const to = query.dateTo ? dateOnly(query.dateTo) : null;
    const customer = query.customerId ?? null;
    const live = Prisma.sql`fi.status IN ('ISSUED', 'SENT')
      AND (${from}::date IS NULL OR fi."invoiceDate" >= ${from}::date)
      AND (${to}::date IS NULL OR fi."invoiceDate" <= ${to}::date)
      AND (${customer}::uuid IS NULL OR fi."customerId" = ${customer}::uuid)`;
    const [byMonth, byCustomer, taxSummary, pastDue] = await Promise.all([
      this.prisma.$queryRaw<Array<{ month: string; currency: string; count: bigint; taxable: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal }>>`
        SELECT to_char(fi."invoiceDate", 'YYYY-MM') AS month, fi.currency, COUNT(*) AS count,
               SUM(fi."taxableAmount") AS taxable, SUM(fi."taxTotal") AS tax, SUM(fi."grandTotal") AS total
        FROM final_invoices fi WHERE ${live}
        GROUP BY 1, 2 ORDER BY 1 DESC, 2`,
      this.prisma.$queryRaw<Array<{ customerId: string; name: string; customerCode: string; currency: string; count: bigint; total: Prisma.Decimal }>>`
        SELECT c.id AS "customerId", c.name, c."customerCode", fi.currency, COUNT(*) AS count, SUM(fi."grandTotal") AS total
        FROM final_invoices fi JOIN customers c ON c.id = fi."customerId" WHERE ${live}
        GROUP BY 1, 2, 3, 4 ORDER BY total DESC LIMIT 200`,
      this.prisma.$queryRaw<Array<{ label: string; rate: Prisma.Decimal; currency: string; taxable: Prisma.Decimal; tax: Prisma.Decimal }>>`
        SELECT COALESCE(NULLIF(TRIM(i."taxLabel"), ''), 'Tax') AS label, i."taxRate" AS rate, fi.currency,
               SUM(i."lineTotal" - i."taxAmount") AS taxable, SUM(i."taxAmount") AS tax
        FROM final_invoice_items i JOIN final_invoices fi ON fi.id = i."finalInvoiceId"
        WHERE ${live} AND i."taxRate" > 0
        GROUP BY 1, 2, 3 ORDER BY 3, 1, 2`,
      this.prisma.finalInvoice.findMany({
        where: { status: { in: ISSUED_STATES }, dueDate: { lt: businessToday() }, paymentState: { not: InvoicePaymentState.PAID }, ...(customer ? { customerId: customer } : {}) },
        select: this.listSelect,
        orderBy: { dueDate: 'asc' },
        take: 200,
      }),
    ]);
    const money = (v: Prisma.Decimal | null) => new D(v ?? 0).toFixed(2);
    return {
      range: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null, customerId: customer },
      byMonth: byMonth.map((r) => ({ month: r.month, currency: r.currency, count: Number(r.count), taxable: money(r.taxable), tax: money(r.tax), total: money(r.total) })),
      byCustomer: byCustomer.map((r) => ({ customer: { id: r.customerId, name: r.name, customerCode: r.customerCode }, currency: r.currency, count: Number(r.count), total: money(r.total) })),
      taxSummary: taxSummary.map((r) => ({ label: r.label, rate: new D(r.rate).toFixed(2), currency: r.currency, taxable: money(r.taxable), tax: money(r.tax) })),
      pastDue: pastDue.map((r) => this.withDueFlag(r)),
      paymentTrackingAvailable: true,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Payment Management contract (read-only). Payments will reference
   * finalInvoiceId; received, outstanding and paid status are derived from
   * those records, never stored by hand.
   */
  async paymentHandoff(id: string) {
    const inv = await this.prisma.finalInvoice.findUnique({
      where: { id },
      select: { id: true, invoiceNumber: true, status: true, customerId: true, proformaInvoiceId: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true, dueDate: true, issuedAt: true },
    });
    if (!inv) throw new NotFoundException(`Final invoice ${id} was not found`);
    const payable = ISSUED_STATES.includes(inv.status);
    return {
      ...inv,
      grandTotal: inv.grandTotal.toFixed(2),
      amountReceived: inv.amountReceived.toFixed(2),
      outstanding: D.max(inv.grandTotal.minus(inv.amountReceived), 0).toFixed(2),
      payable: payable && inv.paymentState !== InvoicePaymentState.PAID,
      problems: payable ? [] : [`A ${label(inv.status)} invoice cannot receive payments; it must be issued first.`],
      paymentModuleAvailable: true,
    };
  }
}
