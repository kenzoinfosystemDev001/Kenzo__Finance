import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FinalInvoiceStatus, InvoicePaymentState, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { buildPaginatedResult, type PaginationQueryDto } from '../common/dto/pagination.dto';
import { normalizeName } from '../common/utils/normalize';
import { businessToday } from '../common/utils/business-date';
import { PERMISSIONS, type PermissionCode } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { CreatePaymentDto, PaymentReasonDto, PaymentReportQueryDto, PaymentSettingsDto, QueryPaymentsDto, UpdatePaymentDto } from './dto/payment.dto';
import { DEFAULT_METHODS, label, money, normalizeReference, paymentState, TRANSITIONS, type PaymentMethodOption } from './payment-rules';
import { PaymentReceiptService } from './payment-receipt.service';

export const PAYMENT_ENTITY = 'Payment';
type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const ZERO = new D(0);
const userSelect = { select: { id: true, fullName: true } } as const;
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const PAYABLE: FinalInvoiceStatus[] = [FinalInvoiceStatus.ISSUED, FinalInvoiceStatus.SENT];
/** Payments that hold part of an invoice's balance: verified ones, and pending ones awaiting verification. */
const COMMITTED: PaymentStatus[] = [PaymentStatus.VERIFIED, PaymentStatus.PENDING_VERIFICATION];

/**
 * Module 8 - Payment Management. The single source of truth for money
 * received against final invoices (Module 7).
 *
 * Invariants:
 * - An invoice's amountReceived / paymentState are derived ONLY from VERIFIED
 *   allocations and recomputed inside the same transaction as every payment
 *   status change, under a row lock on the invoice (no lost updates).
 * - A new or edited payment may not exceed the invoice total minus verified
 *   and pending payments; verification re-checks against verified payments.
 * - Payments are never deleted: rejected / reversed ones stay on record.
 * - Amounts are exact decimals; the client never supplies balances.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly enquiriesService: EnquiriesService,
    private readonly settingsService: SettingsService,
    private readonly receiptService: PaymentReceiptService,
  ) {}

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private require(actor: AuthenticatedUser, permission: PermissionCode, action: string) {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException(`You do not have permission to ${action}.`);
  }

  private audit(tx: Tx, actor: AuthenticatedUser, context: RequestContext | null, paymentId: string, invoiceId: string, action: string, summary: string, extra: { before?: unknown; after?: unknown } = {}) {
    return this.auditService.record(
      {
        actorUserId: actor.id,
        action,
        entityType: PAYMENT_ENTITY,
        entityId: paymentId,
        // Shown in the invoice's activity history too.
        parentEntityType: 'FinalInvoice',
        parentEntityId: invoiceId,
        summary,
        ...extra,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
      tx,
    );
  }

  /** Serialises every payment change on one invoice. */
  private async lockInvoice(tx: Tx, invoiceId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM final_invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(`Final invoice ${invoiceId} was not found`);
  }

  private async lockPayment(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException(`Payment ${id} was not found`);
  }

  private async allocated(tx: Tx | PrismaService, invoiceId: string, statuses: PaymentStatus[], excludePaymentId?: string) {
    const agg = await tx.paymentAllocation.aggregate({
      where: { finalInvoiceId: invoiceId, payment: { status: { in: statuses } }, ...(excludePaymentId ? { paymentId: { not: excludePaymentId } } : {}) },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? ZERO;
  }

  /** Recomputes the invoice's received amount and payment state from verified allocations. */
  private async recompute(tx: Tx, invoiceId: string) {
    const inv = await tx.finalInvoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { grandTotal: true, paymentState: true, amountReceived: true } });
    const received = await this.allocated(tx, invoiceId, [PaymentStatus.VERIFIED]);
    const state = paymentState(inv.grandTotal, received);
    await tx.finalInvoice.update({ where: { id: invoiceId }, data: { amountReceived: received, paymentState: state } });
    return { received, outstanding: D.max(inv.grandTotal.minus(received), ZERO), state, previousState: inv.paymentState };
  }

  async methods(): Promise<PaymentMethodOption[]> {
    return (await this.settingsService.get<PaymentMethodOption[] | null>(BRANDING_SETTING_KEYS.PAYMENT_METHODS)) ?? DEFAULT_METHODS;
  }

  private async assertMethod(code: string, current?: string) {
    const method = (await this.methods()).find((m) => m.code === code);
    // An unchanged method that was later switched off must not block an edit.
    if (!method || (!method.active && code !== current)) throw new BadRequestException(`Payment method ${code} is not available.`);
  }

  private assertDate(paymentDate: Date) {
    if (paymentDate > businessToday()) throw new BadRequestException('The payment date cannot be in the future.');
  }

  private async assertReference(dto: { transactionReference?: string | null; confirmDuplicateReference?: boolean }, excludeId?: string) {
    const normalized = normalizeReference(dto.transactionReference);
    if (!normalized || dto.confirmDuplicateReference) return normalized;
    const clash = await this.prisma.payment.findMany({
      where: { normalizedReference: normalized, status: { not: PaymentStatus.REJECTED }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, receiptNumber: true, amount: true, status: true, customer: { select: { name: true } } },
      take: 5,
    });
    if (clash.length) {
      throw new ConflictException({
        message: `Transaction reference ${dto.transactionReference} is already used by ${clash.map((c) => c.receiptNumber).join(', ')}. Check it is not the same payment, then confirm to record it anyway.`,
        requiresConfirmation: true,
        duplicates: clash.map((c) => ({ id: c.id, receiptNumber: c.receiptNumber, amount: c.amount.toFixed(2), status: c.status, customer: c.customer.name })),
      });
    }
    return normalized;
  }

  /** Throws when `amount` does not fit in what is left of the invoice. */
  private async assertFits(tx: Tx, invoice: { id: string; grandTotal: Prisma.Decimal; currency: string; invoiceNumber: string | null }, amount: Prisma.Decimal, statuses: PaymentStatus[], excludePaymentId?: string) {
    const held = await this.allocated(tx, invoice.id, statuses, excludePaymentId);
    const room = invoice.grandTotal.minus(held);
    if (amount.greaterThan(room)) {
      throw new BadRequestException(
        `The amount ${amount.toFixed(2)} ${invoice.currency} exceeds what is left on invoice ${invoice.invoiceNumber} (${D.max(room, ZERO).toFixed(2)} ${invoice.currency}` +
          `${statuses.includes(PaymentStatus.PENDING_VERIFICATION) ? ', after payments awaiting verification' : ''}). Overpayments and advances are not supported.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  async getSettings() {
    const [methods, autoVerify] = await Promise.all([this.methods(), this.settingsService.get<string[] | null>(BRANDING_SETTING_KEYS.PAYMENT_AUTO_VERIFY_METHODS)]);
    return { methods, autoVerifyMethods: autoVerify ?? [], methodsConfirmed: (await this.settingsService.get<unknown>(BRANDING_SETTING_KEYS.PAYMENT_METHODS)) !== null };
  }

  async updateSettings(dto: PaymentSettingsDto, actor: AuthenticatedUser) {
    const codes = dto.methods.map((m) => m.code);
    if (new Set(codes).size !== codes.length) throw new BadRequestException('Each payment method code must be unique.');
    // Methods already used by payments cannot disappear from the list (only be switched off).
    const used = await this.prisma.payment.groupBy({ by: ['method'] });
    const missing = used.map((u) => u.method).filter((code) => !codes.includes(code));
    if (missing.length) throw new BadRequestException(`Methods already used by payments cannot be removed (switch them off instead): ${missing.join(', ')}.`);
    const unknown = dto.autoVerifyMethods.filter((code) => !codes.includes(code));
    if (unknown.length) throw new BadRequestException(`Unknown method in auto-verify list: ${unknown.join(', ')}.`);
    await this.settingsService.set(BRANDING_SETTING_KEYS.PAYMENT_METHODS, dto.methods, actor);
    await this.settingsService.set(BRANDING_SETTING_KEYS.PAYMENT_AUTO_VERIFY_METHODS, dto.autoVerifyMethods, actor);
    return this.getSettings();
  }

  // -------------------------------------------------------------------------
  // Invoices a customer can pay
  // -------------------------------------------------------------------------

  /** The customer's issued invoices that still have a balance (verified + pending considered). */
  async eligibleInvoices(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} was not found`);
    const invoices = await this.prisma.finalInvoice.findMany({
      where: { customerId, status: { in: PAYABLE }, paymentState: { not: InvoicePaymentState.PAID } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true },
      orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
    });
    const pending = await this.prisma.paymentAllocation.groupBy({
      by: ['finalInvoiceId'],
      where: { finalInvoiceId: { in: invoices.map((i) => i.id) }, payment: { status: PaymentStatus.PENDING_VERIFICATION } },
      _sum: { amount: true },
    });
    const today = businessToday();
    return invoices.map((i) => {
      const awaiting = pending.find((p) => p.finalInvoiceId === i.id)?._sum.amount ?? ZERO;
      const outstanding = D.max(i.grandTotal.minus(i.amountReceived), ZERO);
      return {
        ...i,
        outstanding: outstanding.toFixed(2),
        pendingVerification: awaiting.toFixed(2),
        /** What a new payment may be at most. */
        available: D.max(outstanding.minus(awaiting), ZERO).toFixed(2),
        overdue: Boolean(i.dueDate && i.dueDate < today),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Record / edit
  // -------------------------------------------------------------------------

  async create(dto: CreatePaymentDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PAYMENT_CREATE, 'record payments');
    const amount = money(dto.amount);
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('The payment amount must be greater than zero.');
    const paymentDate = dateOnly(dto.paymentDate);
    this.assertDate(paymentDate);
    await this.assertMethod(dto.method);
    if (dto.receivedById) await this.enquiriesService.assertAssignableUser(dto.receivedById);
    const normalized = await this.assertReference(dto);
    const settings = await this.getSettings();
    const autoVerify = settings.autoVerifyMethods.includes(dto.method) && actor.permissions.includes(PERMISSIONS.PAYMENT_VERIFY);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, dto.finalInvoiceId);
      const invoice = await tx.finalInvoice.findUniqueOrThrow({ where: { id: dto.finalInvoiceId }, select: { id: true, invoiceNumber: true, customerId: true, status: true, currency: true, grandTotal: true } });
      if (invoice.customerId !== dto.customerId) throw new BadRequestException('The invoice does not belong to the selected customer.');
      if (!PAYABLE.includes(invoice.status)) throw new BadRequestException(`Payments can be recorded only against issued invoices (this one is ${invoice.status.toLowerCase()}).`);
      if (dto.currency && dto.currency !== invoice.currency) throw new BadRequestException(`The payment must be in the invoice currency (${invoice.currency}); currency conversion is not supported.`);
      await this.assertFits(tx, invoice, amount, COMMITTED);

      const receiptNumber = await this.numberingService.allocate('PAYMENT_RECEIPT', tx);
      const now = new Date();
      const payment = await tx.payment.create({
        data: {
          receiptNumber,
          customerId: invoice.customerId,
          paymentDate,
          amount,
          currency: invoice.currency,
          method: dto.method,
          transactionReference: dto.transactionReference ?? null,
          normalizedReference: normalized,
          bankReference: dto.bankReference ?? null,
          receivedById: dto.receivedById ?? actor.id,
          notes: dto.notes ?? null,
          duplicateReferenceConfirmed: Boolean(dto.confirmDuplicateReference && normalized),
          status: autoVerify ? PaymentStatus.VERIFIED : PaymentStatus.PENDING_VERIFICATION,
          ...(autoVerify ? { verifiedAt: now, verifiedById: actor.id } : {}),
          createdById: actor.id,
          updatedById: actor.id,
          allocations: { create: [{ finalInvoiceId: invoice.id, amount }] },
        },
        select: { id: true, receiptNumber: true, status: true },
      });
      await tx.paymentStatusHistory.create({ data: { paymentId: payment.id, previousStatus: null, newStatus: PaymentStatus.PENDING_VERIFICATION, changedById: actor.id } });
      if (autoVerify) {
        await tx.paymentStatusHistory.create({ data: { paymentId: payment.id, previousStatus: PaymentStatus.PENDING_VERIFICATION, newStatus: PaymentStatus.VERIFIED, remarks: `Verified automatically (${dto.method} is set to auto-verify)`, changedById: actor.id } });
      }
      const balance = await this.recompute(tx, invoice.id);
      await this.audit(tx, actor, context, payment.id, invoice.id, 'payment.create',
        `Recorded ${receiptNumber}: ${amount.toFixed(2)} ${invoice.currency} by ${dto.method} against ${invoice.invoiceNumber}${autoVerify ? ' (auto-verified)' : ''}`,
        { after: { amount: amount.toFixed(2), method: dto.method, status: payment.status, invoiceBalance: balance.outstanding.toFixed(2) } });
      return { ...payment, verified: autoVerify };
    });
    if (result.verified) await this.receiptService.storeVerifiedById(result.id, actor);
    return result;
  }

  async update(id: string, dto: UpdatePaymentDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PAYMENT_UPDATE, 'edit payments');
    const current = await this.prisma.payment.findUnique({ where: { id }, include: { allocations: true } });
    if (!current) throw new NotFoundException(`Payment ${id} was not found`);
    if (current.status !== PaymentStatus.PENDING_VERIFICATION) throw new BadRequestException(`A ${label(current.status)} payment cannot be edited. Reverse it (if verified) and record it again.`);
    const amount = money(dto.amount);
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('The payment amount must be greater than zero.');
    const paymentDate = dateOnly(dto.paymentDate);
    this.assertDate(paymentDate);
    await this.assertMethod(dto.method, current.method);
    if (dto.receivedById && dto.receivedById !== current.receivedById) await this.enquiriesService.assertAssignableUser(dto.receivedById);
    const normalized = await this.assertReference(dto, id);
    const allocation = current.allocations[0];

    return this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, allocation.finalInvoiceId);
      await this.lockPayment(tx, id);
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (fresh.status !== PaymentStatus.PENDING_VERIFICATION) throw new ConflictException('The payment changed status in the meantime. Reload it.');
      const invoice = await tx.finalInvoice.findUniqueOrThrow({ where: { id: allocation.finalInvoiceId }, select: { id: true, invoiceNumber: true, currency: true, grandTotal: true } });
      await this.assertFits(tx, invoice, amount, COMMITTED, id);
      const updated = await tx.payment.update({
        where: { id },
        data: {
          paymentDate,
          amount,
          method: dto.method,
          transactionReference: dto.transactionReference !== undefined ? dto.transactionReference : current.transactionReference,
          normalizedReference: dto.transactionReference !== undefined ? normalized : current.normalizedReference,
          bankReference: dto.bankReference !== undefined ? dto.bankReference : current.bankReference,
          receivedById: dto.receivedById !== undefined ? dto.receivedById : current.receivedById,
          notes: dto.notes !== undefined ? dto.notes : current.notes,
          ...(dto.confirmDuplicateReference && normalized ? { duplicateReferenceConfirmed: true } : {}),
          updatedById: actor.id,
        },
        select: { id: true, receiptNumber: true, status: true },
      });
      await tx.paymentAllocation.update({ where: { id: allocation.id }, data: { amount } });
      const before = { amount: current.amount.toFixed(2), paymentDate: current.paymentDate.toISOString().slice(0, 10), method: current.method, transactionReference: current.transactionReference };
      const after = { amount: amount.toFixed(2), paymentDate: dto.paymentDate.slice(0, 10), method: dto.method, transactionReference: dto.transactionReference ?? current.transactionReference };
      await this.audit(tx, actor, context, id, invoice.id, 'payment.update', `Edited pending payment ${current.receiptNumber}`, { before, after });
      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // Verify / reject / reverse
  // -------------------------------------------------------------------------

  private async transition(id: string, target: PaymentStatus, reason: string | undefined, actor: AuthenticatedUser, context: RequestContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      const head = await tx.payment.findUnique({ where: { id }, select: { allocations: { select: { finalInvoiceId: true } } } });
      if (!head) throw new NotFoundException(`Payment ${id} was not found`);
      const invoiceId = head.allocations[0].finalInvoiceId;
      // Lock order (invoice, then payment) is the same everywhere: no deadlocks.
      await this.lockInvoice(tx, invoiceId);
      await this.lockPayment(tx, id);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      const from = payment.status;
      if (!TRANSITIONS[from].includes(target)) throw new BadRequestException(`A ${label(from)} payment cannot be ${label(target)}.`);
      const invoice = await tx.finalInvoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, currency: true, grandTotal: true, status: true } });
      const now = new Date();
      let data: Prisma.PaymentUncheckedUpdateInput = { status: target, updatedById: actor.id };
      if (target === PaymentStatus.VERIFIED) {
        if (invoice.status === FinalInvoiceStatus.CANCELLED) throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is cancelled; reject this payment instead.`);
        await this.assertFits(tx, invoice, payment.amount, [PaymentStatus.VERIFIED], id);
        data = { ...data, verifiedAt: now, verifiedById: actor.id };
      } else if (target === PaymentStatus.REJECTED) {
        data = { ...data, rejectedAt: now, rejectedById: actor.id, rejectionReason: reason ?? null };
      } else if (target === PaymentStatus.REVERSED) {
        data = { ...data, reversedAt: now, reversedById: actor.id, reversalReason: reason ?? null };
      }
      await tx.payment.update({ where: { id }, data });
      await tx.paymentStatusHistory.create({ data: { paymentId: id, previousStatus: from, newStatus: target, remarks: reason ?? null, changedById: actor.id } });
      const balance = await this.recompute(tx, invoiceId);
      const action = target === PaymentStatus.VERIFIED ? 'payment.verify' : target === PaymentStatus.REJECTED ? 'payment.reject' : 'payment.reverse';
      await this.audit(tx, actor, context, id, invoiceId,
        action,
        `${payment.receiptNumber}: ${label(from)} → ${label(target)}${reason ? ` (${reason})` : ''}. Invoice ${invoice.invoiceNumber}: received ${balance.received.toFixed(2)}, outstanding ${balance.outstanding.toFixed(2)} ${invoice.currency}`,
        { before: { status: from }, after: { status: target, invoiceReceived: balance.received.toFixed(2), invoiceState: balance.state } });
      return { id, receiptNumber: payment.receiptNumber, status: target, invoice: { id: invoiceId, amountReceived: balance.received.toFixed(2), outstanding: balance.outstanding.toFixed(2), paymentState: balance.state } };
    });
    // The verified receipt is rendered once and kept as the historical snapshot.
    if (target === PaymentStatus.VERIFIED) await this.receiptService.storeVerifiedById(id, actor);
    return result;
  }

  async verify(id: string, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PAYMENT_VERIFY, 'verify payments');
    return this.transition(id, PaymentStatus.VERIFIED, undefined, actor, context);
  }

  async reject(id: string, dto: PaymentReasonDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PAYMENT_REJECT, 'reject payments');
    if (!dto.reason) throw new BadRequestException('Give the reason for rejecting the payment.');
    return this.transition(id, PaymentStatus.REJECTED, dto.reason, actor, context);
  }

  async reverse(id: string, dto: PaymentReasonDto, actor: AuthenticatedUser, context: RequestContext) {
    this.require(actor, PERMISSIONS.PAYMENT_REVERSE, 'reverse payments');
    if (!dto.reason) throw new BadRequestException('Give the reason for reversing the payment.');
    return this.transition(id, PaymentStatus.REVERSED, dto.reason, actor, context);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  private buildWhere(query: QueryPaymentsDto): Prisma.PaymentWhereInput {
    const and: Prisma.PaymentWhereInput[] = [];
    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.finalInvoiceId) and.push({ allocations: { some: { finalInvoiceId: query.finalInvoiceId } } });
    if (query.method) and.push({ method: query.method });
    if (query.amountMin) and.push({ amount: { gte: new D(query.amountMin) } });
    if (query.amountMax) and.push({ amount: { lte: new D(query.amountMax) } });
    if (query.dateFrom || query.dateTo) and.push({ paymentDate: { ...(query.dateFrom ? { gte: dateOnly(query.dateFrom) } : {}), ...(query.dateTo ? { lte: dateOnly(query.dateTo) } : {}) } });
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { receiptNumber: text },
          { transactionReference: text },
          { bankReference: text },
          { customer: { OR: [{ name: text }, { customerCode: text }, { normalizedName: { contains: normalizeName(query.search) } }] } },
          { allocations: { some: { finalInvoice: { invoiceNumber: text } } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  private listSelect = {
    id: true,
    receiptNumber: true,
    paymentDate: true,
    amount: true,
    currency: true,
    method: true,
    transactionReference: true,
    status: true,
    duplicateReferenceConfirmed: true,
    createdAt: true,
    verifiedAt: true,
    customer: { select: { id: true, name: true, customerCode: true } },
    receivedBy: userSelect,
    allocations: { select: { amount: true, finalInvoice: { select: { id: true, invoiceNumber: true, grandTotal: true, paymentState: true } } } },
  } satisfies Prisma.PaymentSelect;

  async findAll(query: QueryPaymentsDto) {
    const where = this.buildWhere(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.payment.findMany({ where, select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }], skip: query.skip, take: query.take }),
      this.prisma.payment.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async findAllForExport(query: QueryPaymentsDto) {
    return this.prisma.payment.findMany({ where: this.buildWhere(query), select: this.listSelect, orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }], take: 10_000 });
  }

  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, customerCode: true, customerType: true } },
        receivedBy: userSelect,
        verifiedBy: userSelect,
        rejectedBy: userSelect,
        reversedBy: userSelect,
        createdBy: userSelect,
        updatedBy: userSelect,
        allocations: { include: { finalInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true, status: true, proformaInvoice: { select: { id: true, piNumber: true } } } } } },
        statusHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: userSelect } },
        receiptDocument: { select: { id: true, originalFilename: true, sizeBytes: true, createdAt: true } },
        documents: {
          where: { archivedAt: null },
          select: { id: true, kind: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true, replacesDocumentId: true, uploadedBy: userSelect },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} was not found`);
    const allocation = payment.allocations[0];
    const inv = allocation.finalInvoice;
    // Other verified payments on the same invoice, and those still pending.
    const [otherVerified, pending] = await Promise.all([
      this.allocated(this.prisma, inv.id, [PaymentStatus.VERIFIED], id),
      this.allocated(this.prisma, inv.id, [PaymentStatus.PENDING_VERIFICATION]),
    ]);
    const methods = await this.methods();
    return {
      ...payment,
      methodLabel: methods.find((m) => m.code === payment.method)?.label ?? payment.method,
      invoiceSummary: {
        invoiceTotal: inv.grandTotal.toFixed(2),
        otherVerifiedPayments: otherVerified.toFixed(2),
        thisPayment: payment.amount.toFixed(2),
        totalVerified: inv.amountReceived.toFixed(2),
        pendingVerification: pending.toFixed(2),
        outstanding: D.max(inv.grandTotal.minus(inv.amountReceived), ZERO).toFixed(2),
        paymentState: inv.paymentState,
      },
    };
  }

  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = { OR: [{ entityType: PAYMENT_ENTITY, entityId: id }, { parentEntityType: PAYMENT_ENTITY, parentEntityId: id }] };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true, actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }),
      this.prisma.auditLog.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, pagination.page, pagination.pageSize);
  }

  async assertExists(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, select: { id: true, status: true, receiptNumber: true } });
    if (!payment) throw new NotFoundException(`Payment ${id} was not found`);
    return payment;
  }

  /** Dashboard: verified money per currency (never summed across currencies) and invoice positions. */
  async summary() {
    const today = businessToday();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const verifiedSum = (where: Prisma.PaymentWhereInput) => this.prisma.payment.groupBy({ by: ['currency'], where: { status: PaymentStatus.VERIFIED, ...where }, _sum: { amount: true }, _count: { _all: true } });
    const live = { status: { in: PAYABLE } };
    const [total, todays, month, pending, outstandingRows, partially, paid, overdue] = await Promise.all([
      verifiedSum({}),
      verifiedSum({ paymentDate: today }),
      verifiedSum({ paymentDate: { gte: monthStart, lte: today } }),
      this.prisma.payment.groupBy({ by: ['currency'], where: { status: PaymentStatus.PENDING_VERIFICATION }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.finalInvoice.groupBy({ by: ['currency'], where: { ...live, paymentState: { not: InvoicePaymentState.PAID } }, _sum: { grandTotal: true, amountReceived: true }, _count: { _all: true } }),
      this.prisma.finalInvoice.count({ where: { ...live, paymentState: InvoicePaymentState.PARTIALLY_PAID } }),
      this.prisma.finalInvoice.count({ where: { ...live, paymentState: InvoicePaymentState.PAID } }),
      this.prisma.finalInvoice.count({ where: { ...live, paymentState: { not: InvoicePaymentState.PAID }, dueDate: { lt: today } } }),
    ]);
    const perCurrency = (rows: Array<{ currency: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }>) =>
      rows.map((r) => ({ currency: r.currency, count: r._count._all, total: (r._sum.amount ?? ZERO).toFixed(2) }));
    return {
      totalReceived: perCurrency(total),
      receivedToday: perCurrency(todays),
      receivedThisMonth: perCurrency(month),
      pendingVerification: perCurrency(pending),
      outstanding: outstandingRows.map((r) => ({ currency: r.currency, invoices: r._count._all, total: (r._sum.grandTotal ?? ZERO).minus(r._sum.amountReceived ?? ZERO).toFixed(2) })),
      partiallyPaidInvoices: partially,
      fullyPaidInvoices: paid,
      overdueInvoices: overdue,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Customer payment history: totals per currency, invoice positions and payments. */
  async customerHistory(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, customerCode: true } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} was not found`);
    const [invoices, payments] = await Promise.all([
      this.prisma.finalInvoice.findMany({
        where: { customerId, status: { in: PAYABLE } },
        select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.payment.findMany({ where: { customerId }, select: this.listSelect, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    ]);
    const currencies = [...new Set([...invoices.map((i) => i.currency), ...payments.map((p) => p.currency)])];
    const totals = currencies.map((currency) => {
      const inv = invoices.filter((i) => i.currency === currency);
      const invoiced = inv.reduce((s, i) => s.plus(i.grandTotal), ZERO);
      const verified = inv.reduce((s, i) => s.plus(i.amountReceived), ZERO);
      return { currency, invoiced: invoiced.toFixed(2), verifiedPayments: verified.toFixed(2), outstanding: D.max(invoiced.minus(verified), ZERO).toFixed(2) };
    });
    const verifiedPayments = payments.filter((p) => p.status === PaymentStatus.VERIFIED);
    const today = businessToday();
    return {
      customer,
      totals,
      paymentCount: verifiedPayments.length,
      lastPaymentDate: verifiedPayments[0]?.paymentDate ?? null,
      invoices: invoices.map((i) => ({ ...i, outstanding: D.max(i.grandTotal.minus(i.amountReceived), ZERO).toFixed(2), overdue: Boolean(i.dueDate && i.dueDate < today && i.paymentState !== InvoicePaymentState.PAID) })),
      payments,
    };
  }

  /** Invoice-wise payment history (used by the final invoice profile). */
  async invoiceHistory(invoiceId: string) {
    const invoice = await this.prisma.finalInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true, dueDate: true } });
    if (!invoice) throw new NotFoundException(`Final invoice ${invoiceId} was not found`);
    const payments = await this.prisma.payment.findMany({ where: { allocations: { some: { finalInvoiceId: invoiceId } } }, select: this.listSelect, orderBy: [{ paymentDate: 'asc' }, { createdAt: 'asc' }] });
    const pending = payments.filter((p) => p.status === PaymentStatus.PENDING_VERIFICATION).reduce((s, p) => s.plus(p.amount), ZERO);
    return {
      invoice: { ...invoice, outstanding: D.max(invoice.grandTotal.minus(invoice.amountReceived), ZERO).toFixed(2), pendingVerification: pending.toFixed(2) },
      payments,
    };
  }

  /** Reports. Money totals come from VERIFIED payments only, per currency. */
  async reports(query: PaymentReportQueryDto) {
    const from = query.dateFrom ? dateOnly(query.dateFrom) : null;
    const to = query.dateTo ? dateOnly(query.dateTo) : null;
    const customer = query.customerId ?? null;
    const method = query.method ?? null;
    const filter = Prisma.sql`(${from}::date IS NULL OR p."paymentDate" >= ${from}::date)
      AND (${to}::date IS NULL OR p."paymentDate" <= ${to}::date)
      AND (${customer}::uuid IS NULL OR p."customerId" = ${customer}::uuid)
      AND (${method}::text IS NULL OR p.method = ${method}::text)`;
    const verified = Prisma.sql`p.status = 'VERIFIED' AND ${filter}`;
    type Row = { key: string; currency: string; count: bigint; total: Prisma.Decimal };
    const [daily, monthly, byCustomer, byMethod, byInvoice, pendingList, rejectedList] = await Promise.all([
      this.prisma.$queryRaw<Row[]>`SELECT to_char(p."paymentDate", 'YYYY-MM-DD') AS key, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${verified} GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 366`,
      this.prisma.$queryRaw<Row[]>`SELECT to_char(p."paymentDate", 'YYYY-MM') AS key, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${verified} GROUP BY 1, 2 ORDER BY 1 DESC`,
      this.prisma.$queryRaw<Array<Row & { name: string; customerCode: string }>>`SELECT c.id AS key, c.name, c."customerCode", p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p JOIN customers c ON c.id = p."customerId" WHERE ${verified} GROUP BY 1, 2, 3, 4 ORDER BY total DESC LIMIT 200`,
      this.prisma.$queryRaw<Row[]>`SELECT p.method AS key, p.currency, COUNT(*) AS count, SUM(p.amount) AS total FROM payments p WHERE ${verified} GROUP BY 1, 2 ORDER BY total DESC`,
      this.prisma.$queryRaw<Array<Row & { invoiceNumber: string }>>`SELECT fi.id AS key, fi."invoiceNumber", p.currency, COUNT(*) AS count, SUM(a.amount) AS total FROM payment_allocations a JOIN payments p ON p.id = a."paymentId" JOIN final_invoices fi ON fi.id = a."finalInvoiceId" WHERE ${verified} GROUP BY 1, 2, 3 ORDER BY 2 LIMIT 500`,
      this.prisma.payment.findMany({ where: { status: PaymentStatus.PENDING_VERIFICATION, ...(customer ? { customerId: customer } : {}), ...(method ? { method } : {}) }, select: this.listSelect, orderBy: { paymentDate: 'asc' }, take: 200 }),
      this.prisma.payment.findMany({ where: { status: { in: [PaymentStatus.REJECTED, PaymentStatus.REVERSED] }, ...(customer ? { customerId: customer } : {}), ...(method ? { method } : {}) }, select: { ...this.listSelect, rejectionReason: true, reversalReason: true }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    ]);
    const today = businessToday();
    const openInvoices = await this.prisma.finalInvoice.findMany({
      where: { status: { in: PAYABLE }, paymentState: { not: InvoicePaymentState.PAID }, ...(customer ? { customerId: customer } : {}) },
      select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, currency: true, grandTotal: true, amountReceived: true, paymentState: true, customer: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
      take: 500,
    });
    const methods = await this.methods();
    const fmt = (r: Row) => ({ key: r.key, currency: r.currency, count: Number(r.count), total: new D(r.total ?? 0).toFixed(2) });
    const outstanding = openInvoices.map((i) => ({ ...i, outstanding: D.max(i.grandTotal.minus(i.amountReceived), ZERO).toFixed(2), overdue: Boolean(i.dueDate && i.dueDate < today) }));
    return {
      filters: { dateFrom: query.dateFrom ?? null, dateTo: query.dateTo ?? null, customerId: customer, method },
      daily: daily.map(fmt),
      monthly: monthly.map(fmt),
      byCustomer: byCustomer.map((r) => ({ ...fmt(r), customer: { id: r.key, name: r.name, customerCode: r.customerCode } })),
      byMethod: byMethod.map((r) => ({ ...fmt(r), label: methods.find((m) => m.code === r.key)?.label ?? r.key })),
      byInvoice: byInvoice.map((r) => ({ ...fmt(r), invoiceNumber: r.invoiceNumber })),
      pendingVerification: pendingList,
      rejectedOrReversed: rejectedList,
      outstandingInvoices: outstanding,
      overdueInvoices: outstanding.filter((i) => i.overdue),
      generatedAt: new Date().toISOString(),
    };
  }
}
