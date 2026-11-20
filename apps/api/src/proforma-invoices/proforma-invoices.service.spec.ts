import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, ProformaStatus, QuotationStatus } from '@prisma/client';
import { ProformaInvoicesService } from './proforma-invoices.service';
import { TRANSITIONS } from './proforma-rules';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const D = Prisma.Decimal;
const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };
const actor = (permissions: string[]): AuthenticatedUser => ({ id: 'u1', email: 'a@b.c', fullName: 'Accounts', roles: [], permissions: permissions as never });
const ALL = Object.values(PERMISSIONS).filter((p) => p.startsWith('proforma.'));

const acceptedQuotation = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  quotationNumber: 'KI/QT/00001',
  status: QuotationStatus.ACCEPTED,
  customerId: 'c1',
  contactId: null,
  assignedToId: null,
  currency: 'INR',
  subject: null,
  referenceNumber: null,
  enquiry: null,
  customer: { id: 'c1', name: 'Acme', customerCode: 'KI/CUS/0001' },
  acceptedRevision: { id: 'r1', revisionNumber: 2, grandTotal: new D('1180.00'), items: [], taxBreakdown: null },
  ...overrides,
});

describe('ProformaInvoicesService', () => {
  let prisma: Record<string, any>;
  let settings: { getBoolean: jest.Mock; get: jest.Mock };
  let service: ProformaInvoicesService;

  beforeEach(() => {
    prisma = {
      quotation: { findUnique: jest.fn() },
      proformaInvoice: { findUnique: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
      proformaInvoiceStatusHistory: { create: jest.fn() },
      finalInvoice: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    settings = { getBoolean: jest.fn().mockResolvedValue(false), get: jest.fn().mockResolvedValue(null) };
    const audit = { record: jest.fn() };
    const customers = { assertSelectableForTransaction: jest.fn() };
    const enquiries = { assertContactOfCustomer: jest.fn(), assertAssignableUser: jest.fn() };
    const quotations = { customerSnapshot: jest.fn().mockResolvedValue({ name: 'Acme' }) };
    const pdf = { storeIssuedById: jest.fn() };
    service = new ProformaInvoicesService(prisma as never, audit as never, {} as never, customers as never, enquiries as never, quotations as never, settings as never, pdf as never);
  });

  describe('lifecycle rules', () => {
    it('never allows a manual payment status and keeps cancelled final', () => {
      const all = Object.values(TRANSITIONS).flat();
      expect(all.every((s) => Object.values(ProformaStatus).includes(s))).toBe(true);
      expect(TRANSITIONS.CANCELLED).toEqual([]);
      expect(TRANSITIONS.SENT).toEqual([ProformaStatus.CANCELLED]);
    });
  });

  describe('create', () => {
    it('refuses a quotation that is not accepted', async () => {
      prisma.quotation.findUnique.mockResolvedValue(acceptedQuotation({ status: QuotationStatus.SENT, acceptedRevision: null }));
      await expect(service.create({ quotationId: 'q1' }, actor(ALL), context)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a second live PI for the same accepted revision (409)', async () => {
      prisma.quotation.findUnique.mockResolvedValue(acceptedQuotation());
      prisma.proformaInvoice.findUnique.mockResolvedValue({ id: 'p0', piNumber: 'KI/PI/00001', status: ProformaStatus.DRAFT });
      await expect(service.create({ quotationId: 'q1' }, actor(ALL), context)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an advance larger than the grand total', async () => {
      prisma.quotation.findUnique.mockResolvedValue(acceptedQuotation());
      await expect(service.create({ quotationId: 'q1', advanceAmount: '1180.01' }, actor(ALL), context)).rejects.toThrow(/advance amount cannot exceed/);
    });

    it('rejects a due date before the PI date', async () => {
      prisma.quotation.findUnique.mockResolvedValue(acceptedQuotation());
      await expect(service.create({ quotationId: 'q1', piDate: '2026-11-20', dueDate: '2026-11-19' }, actor(ALL), context)).rejects.toThrow(/due date/);
    });

    it('requires proforma.create', async () => {
      await expect(service.create({ quotationId: 'q1' }, actor([PERMISSIONS.PROFORMA_READ]), context)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('changeStatus', () => {
    const pi = (status: ProformaStatus) => ({ id: 'p1', piNumber: 'KI/PI/00001', status, customerId: 'c1', contactId: null, quotation: { status: QuotationStatus.ACCEPTED, quotationNumber: 'KI/QT/00001' } });

    it('issues a draft directly when approval is off and stores the PDF afterwards', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.DRAFT));
      const result = await service.changeStatus('p1', { status: ProformaStatus.ISSUED }, actor(ALL), context);
      expect(result.issued).toBe(true);
      expect(prisma.proformaInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ProformaStatus.ISSUED, issuedById: 'u1' }) }));
    });

    it('requires approval before issue when the setting is on', async () => {
      settings.getBoolean.mockResolvedValue(true);
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.DRAFT));
      await expect(service.changeStatus('p1', { status: ProformaStatus.ISSUED }, actor(ALL), context)).rejects.toThrow(/must be approved/);
    });

    it('refuses submit for approval when approval is off', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.DRAFT));
      await expect(service.changeStatus('p1', { status: ProformaStatus.PENDING_APPROVAL }, actor(ALL), context)).rejects.toThrow(/Approval is not enabled/);
    });

    it('cancelling needs a reason and frees the revision for a replacement', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.ISSUED));
      await expect(service.changeStatus('p1', { status: ProformaStatus.CANCELLED }, actor(ALL), context)).rejects.toThrow(/reason/);
      await service.changeStatus('p1', { status: ProformaStatus.CANCELLED, remarks: 'Wrong PO' }, actor(ALL), context);
      expect(prisma.proformaInvoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ activeRevisionId: null, cancellationReason: 'Wrong PO' }) }));
    });

    it('cannot be cancelled while a live final invoice exists', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.SENT));
      prisma.finalInvoice.findUnique.mockResolvedValue({ invoiceNumber: 'KI/INV/00001' });
      await expect(service.changeStatus('p1', { status: ProformaStatus.CANCELLED, remarks: 'x' }, actor(ALL), context)).rejects.toThrow(/KI\/INV\/00001/);
    });

    it('refuses an invalid transition (sent back to draft)', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.SENT));
      await expect(service.changeStatus('p1', { status: ProformaStatus.DRAFT, remarks: 'x' }, actor(ALL), context)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('checks the per-step permission (issue needs proforma.issue)', async () => {
      prisma.proformaInvoice.findUniqueOrThrow.mockResolvedValue(pi(ProformaStatus.DRAFT));
      await expect(service.changeStatus('p1', { status: ProformaStatus.ISSUED }, actor([PERMISSIONS.PROFORMA_READ]), context)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
