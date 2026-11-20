import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { FinalInvoiceStatus, InvoicePaymentState, PaymentStatus, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { normalizeReference, paymentState, TRANSITIONS } from './payment-rules';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const D = Prisma.Decimal;
const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
const ALL = Object.values(PERMISSIONS).filter((p) => p.startsWith('payment.'));
const actor = (permissions: string[] = ALL): AuthenticatedUser => ({ id: 'u1', email: 'a@b.c', fullName: 'Accounts', roles: [], permissions: permissions as never });
const today = new Date().toISOString().slice(0, 10);

describe('payment rules', () => {
  it('derives the invoice payment state from verified receipts', () => {
    const total = new D('100000');
    expect(paymentState(total, new D(0))).toBe(InvoicePaymentState.UNPAID);
    expect(paymentState(total, new D('30000'))).toBe(InvoicePaymentState.PARTIALLY_PAID);
    expect(paymentState(total, new D('50000'))).toBe(InvoicePaymentState.PARTIALLY_PAID);
    expect(paymentState(total, new D('100000'))).toBe(InvoicePaymentState.PAID);
  });
  it('normalises references for duplicate detection', () => {
    expect(normalizeReference(' UTR-1234 5678 ')).toBe('utr12345678');
    expect(normalizeReference('  ')).toBeNull();
  });
  it('never returns a verified payment to pending; rejected and reversed are final', () => {
    expect(TRANSITIONS.VERIFIED).toEqual([PaymentStatus.REVERSED]);
    expect(TRANSITIONS.REJECTED).toEqual([]);
    expect(TRANSITIONS.REVERSED).toEqual([]);
  });
});

describe('PaymentsService', () => {
  let prisma: Record<string, any>;
  let service: PaymentsService;
  let verifiedSum: Prisma.Decimal;
  let committedSum: Prisma.Decimal;
  const invoice = { id: 'inv1', invoiceNumber: 'KI/INV/00001', customerId: 'c1', status: FinalInvoiceStatus.ISSUED, currency: 'INR', grandTotal: new D('100000'), paymentState: InvoicePaymentState.UNPAID, amountReceived: new D(0) };

  beforeEach(() => {
    verifiedSum = new D(0);
    committedSum = new D(0);
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'x' }]),
      $transaction: jest.fn(),
      finalInvoice: { findUniqueOrThrow: jest.fn().mockResolvedValue(invoice), update: jest.fn() },
      paymentAllocation: {
        aggregate: jest.fn().mockImplementation(({ where }) => {
          const statuses: PaymentStatus[] = where.payment.status.in;
          return { _sum: { amount: statuses.includes(PaymentStatus.PENDING_VERIFICATION) ? committedSum : verifiedSum } };
        }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'p1', receiptNumber: 'KI/RCT/00001', status: PaymentStatus.PENDING_VERIFICATION }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      paymentStatusHistory: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    const settings = { get: jest.fn().mockResolvedValue(null), getBoolean: jest.fn() };
    service = new PaymentsService(
      prisma as never,
      { record: jest.fn() } as never,
      { allocate: jest.fn().mockResolvedValue('KI/RCT/00001') } as never,
      { assertAssignableUser: jest.fn() } as never,
      settings as never,
      { storeVerifiedById: jest.fn() } as never,
    );
  });

  const body = (overrides: Record<string, unknown> = {}) => ({ customerId: 'c1', finalInvoiceId: 'inv1', paymentDate: today, amount: '30000', method: 'BANK_TRANSFER', ...overrides });

  it('records a partial payment as pending verification and does not count it yet', async () => {
    await service.create(body(), actor(), context);
    expect(prisma.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.PENDING_VERIFICATION, currency: 'INR' }) }));
    // received recomputed from VERIFIED allocations only (still 0)
    expect(prisma.finalInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { amountReceived: new D(0), paymentState: InvoicePaymentState.UNPAID } }));
  });

  it('rejects zero, negative-looking and future-dated amounts', async () => {
    await expect(service.create(body({ amount: '0' }), actor(), context)).rejects.toThrow(/greater than zero/);
    const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    await expect(service.create(body({ paymentDate: future }), actor(), context)).rejects.toThrow(/future/);
  });

  it('refuses more than what is left after verified and pending payments', async () => {
    committedSum = new D('80000');
    await expect(service.create(body({ amount: '20000.01' }), actor(), context)).rejects.toThrow(/exceeds what is left/);
    await expect(service.create(body({ amount: '20000.00' }), actor(), context)).resolves.toBeDefined();
  });

  it("refuses another customer's invoice and a different currency", async () => {
    await expect(service.create(body({ customerId: 'c2' }), actor(), context)).rejects.toThrow(/does not belong/);
    await expect(service.create(body({ currency: 'USD' }), actor(), context)).rejects.toThrow(/invoice currency/);
  });

  it('refuses payments against an unissued invoice', async () => {
    prisma.finalInvoice.findUniqueOrThrow.mockResolvedValueOnce({ ...invoice, status: FinalInvoiceStatus.DRAFT });
    await expect(service.create(body(), actor(), context)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('flags a duplicate transaction reference unless confirmed', async () => {
    prisma.payment.findMany.mockResolvedValue([{ id: 'p0', receiptNumber: 'KI/RCT/00009', amount: new D(1), status: PaymentStatus.VERIFIED, customer: { name: 'Acme' } }]);
    await expect(service.create(body({ transactionReference: 'UTR 123' }), actor(), context)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create(body({ transactionReference: 'UTR 123', confirmDuplicateReference: true }), actor(), context)).resolves.toBeDefined();
  });

  it('verification recomputes the invoice from verified payments (30k → partially paid)', async () => {
    prisma.payment.findUnique.mockResolvedValue({ allocations: [{ finalInvoiceId: 'inv1' }] });
    prisma.payment.findUniqueOrThrow.mockResolvedValue({ id: 'p1', receiptNumber: 'KI/RCT/00001', status: PaymentStatus.PENDING_VERIFICATION, amount: new D('30000') });
    prisma.paymentAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new D(0) } }) // fits check: other verified
      .mockResolvedValueOnce({ _sum: { amount: new D('30000') } }); // recompute: verified incl. this
    const r = await service.verify('p1', actor(), context);
    expect(r.invoice).toEqual({ id: 'inv1', amountReceived: '30000.00', outstanding: '70000.00', paymentState: InvoicePaymentState.PARTIALLY_PAID });
  });

  it('verification refuses to overpay when other payments were verified meanwhile', async () => {
    prisma.payment.findUnique.mockResolvedValue({ allocations: [{ finalInvoiceId: 'inv1' }] });
    prisma.payment.findUniqueOrThrow.mockResolvedValue({ id: 'p1', receiptNumber: 'R', status: PaymentStatus.PENDING_VERIFICATION, amount: new D('30000') });
    verifiedSum = new D('80000');
    await expect(service.verify('p1', actor(), context)).rejects.toThrow(/exceeds what is left/);
  });

  it('rejecting and reversing need a reason and the right permission', async () => {
    await expect(service.reject('p1', {}, actor(), context)).rejects.toThrow(/reason/);
    await expect(service.reverse('p1', { reason: 'bounced' }, actor([PERMISSIONS.PAYMENT_READ]), context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.verify('p1', actor([PERMISSIONS.PAYMENT_CREATE]), context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
