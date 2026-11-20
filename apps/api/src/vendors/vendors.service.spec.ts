import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../numbering/numbering.service';
import { computeGstinChecksum } from '../common/utils/tax-id';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { CreateVendorDto } from './dto/create-vendor.dto';

const gstinOf = (first14: string): string => first14 + computeGstinChecksum(first14);

const VALID_GSTIN = gstinOf('29ABCDE1234F1Z'); // embeds PAN ABCDE1234F

const actor: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'vendor.manager@kenzoinfosystems.com',
  fullName: 'Vendor Manager',
  roles: ['VENDOR_MANAGER'],
  permissions: [],
};

const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('VendorsService', () => {
  let service: VendorsService;
  let prisma: {
    vendor: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    vendorCategory: { findUnique: jest.Mock };
    company: { count: jest.Mock };
    product: { findFirst: jest.Mock };
    vendorProduct: { findUnique: jest.Mock; create: jest.Mock };
    vendorCompany: { upsert: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    productModel: { count: jest.Mock };
    ocrJob: { findUnique: jest.Mock; updateMany: jest.Mock };
    document: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      vendor: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        // Used to re-read a vendor after its OCR source document is attached.
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'new-vendor',
          vendorCode: 'KI/VEN/0001',
          businessName: 'Shree Computers Pvt Ltd',
          documents: [{ id: 'doc1', originalFilename: 'profile.pdf' }],
        }),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      vendorCategory: { findUnique: jest.fn() },
      company: { count: jest.fn().mockResolvedValue(0) },
      product: { findFirst: jest.fn() },
      vendorProduct: { findUnique: jest.fn(), create: jest.fn() },
      vendorCompany: {
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'vc1' }),
      },
      productModel: { count: jest.fn().mockResolvedValue(0) },
      ocrJob: { findUnique: jest.fn(), updateMany: jest.fn() },
      document: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      // Runs the callback with the mock itself standing in for the tx client.
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        {
          provide: NumberingService,
          useValue: { allocate: jest.fn().mockResolvedValue('KI/VEN/0001') },
        },
      ],
    }).compile();

    service = module.get(VendorsService);
  });

  const baseDto = (overrides: Partial<CreateVendorDto> = {}): CreateVendorDto =>
    ({ businessName: 'Shree Computers Pvt Ltd', ...overrides }) as CreateVendorDto;

  describe('duplicate detection', () => {
    it('reports a GSTIN match as blocking', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          vendorCode: 'KI/VEN/0007',
          businessName: 'Existing Vendor',
          normalizedName: 'existing vendor',
          gstin: VALID_GSTIN,
          email: null,
          phone: null,
        },
      ]);

      const matches = await service.findDuplicates({ gstin: VALID_GSTIN });

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ matchedOn: 'gstin', severity: 'blocking' });
    });

    it('reports a name match as a warning, not blocking', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          vendorCode: 'KI/VEN/0007',
          businessName: 'Shree Computers Pvt. Ltd.',
          normalizedName: 'shree computers pvt ltd',
          gstin: null,
          email: null,
          phone: null,
        },
      ]);

      const matches = await service.findDuplicates({
        businessName: 'SHREE COMPUTERS PVT LTD',
      });

      expect(matches[0]).toMatchObject({ matchedOn: 'name', severity: 'warning' });
    });

    it('returns nothing when no identifying input is supplied', async () => {
      await expect(service.findDuplicates({})).resolves.toEqual([]);
      expect(prisma.vendor.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('refuses a vendor whose GSTIN already exists', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          vendorCode: 'KI/VEN/0007',
          businessName: 'Existing Vendor',
          normalizedName: 'existing vendor',
          gstin: VALID_GSTIN,
          email: null,
          phone: null,
        },
      ]);

      await expect(
        service.create(baseDto({ gstin: VALID_GSTIN }), actor, context),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.vendor.create).not.toHaveBeenCalled();
    });

    it('refuses a possible duplicate until it is explicitly confirmed', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          vendorCode: 'KI/VEN/0007',
          businessName: 'Shree Computers Pvt Ltd',
          normalizedName: 'shree computers pvt ltd',
          gstin: null,
          email: null,
          phone: null,
        },
      ]);

      await expect(service.create(baseDto(), actor, context)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.vendor.create).not.toHaveBeenCalled();
    });

    it('creates the vendor when the duplicate warning is acknowledged', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        {
          id: 'v1',
          vendorCode: 'KI/VEN/0007',
          businessName: 'Shree Computers Pvt Ltd',
          normalizedName: 'shree computers pvt ltd',
          gstin: null,
          email: null,
          phone: null,
        },
      ]);
      prisma.vendor.create.mockResolvedValue({
        id: 'new',
        vendorCode: 'KI/VEN/0001',
        businessName: 'Shree Computers Pvt Ltd',
      });

      await service.create(
        baseDto({ confirmPossibleDuplicate: true }),
        actor,
        context,
      );

      expect(prisma.vendor.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a PAN that contradicts the GSTIN', async () => {
      await expect(
        service.create(
          baseDto({ gstin: VALID_GSTIN, pan: 'ZZZZZ9999Z' }),
          actor,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.vendor.findMany).not.toHaveBeenCalled();
    });

    it('accepts a PAN that matches the one embedded in the GSTIN', async () => {
      prisma.vendor.create.mockResolvedValue({
        id: 'new',
        vendorCode: 'KI/VEN/0001',
        businessName: 'Shree Computers Pvt Ltd',
      });

      await service.create(
        baseDto({ gstin: VALID_GSTIN, pan: 'ABCDE1234F' }),
        actor,
        context,
      );

      expect(prisma.vendor.create).toHaveBeenCalledTimes(1);
    });

    it('normalises the business name for duplicate detection', async () => {
      prisma.vendor.create.mockResolvedValue({ id: 'new', vendorCode: 'KI/VEN/0001' });

      await service.create(baseDto({ businessName: '  Shree   Computers  ' }), actor, context);

      const data = prisma.vendor.create.mock.calls[0][0].data;
      expect(data.businessName).toBe('Shree   Computers');
      expect(data.normalizedName).toBe('shree computers');
    });

    it('refuses to reuse an OCR draft that already produced a vendor', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'COMPLETED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: new Date(),
      });

      await expect(
        service.create(baseDto({ ocrJobId: 'job1' }), actor, context),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.vendor.create).not.toHaveBeenCalled();
    });

    it('refuses an OCR draft that has not finished extracting', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'FAILED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: null,
      });

      await expect(
        service.create(baseDto({ ocrJobId: 'job1' }), actor, context),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks the OCR draft consumed and attaches its document', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'COMPLETED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: null,
      });
      prisma.vendor.create.mockResolvedValue({
        id: 'new-vendor',
        vendorCode: 'KI/VEN/0001',
        businessName: 'Shree Computers Pvt Ltd',
      });
      prisma.ocrJob.updateMany.mockResolvedValue({ count: 1 });

      await service.create(baseDto({ ocrJobId: 'job1' }), actor, context);

      expect(prisma.ocrJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job1', consumedAt: null } }),
      );
      expect(prisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: 'doc1', vendorId: null, productId: null, customerId: null, enquiryId: null, quotationId: null },
        data: { vendorId: 'new-vendor' },
      });
    });

    it('refuses to re-home an OCR source document that already belongs to a record', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'COMPLETED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: null,
      });
      prisma.vendor.create.mockResolvedValue({ id: 'new-vendor', vendorCode: 'KI/VEN/0001', businessName: 'Shree Computers Pvt Ltd' });
      prisma.ocrJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.document.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.create(baseDto({ ocrJobId: 'job1' }), actor, context)).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the attached document on the created vendor', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'COMPLETED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: null,
      });
      prisma.vendor.create.mockResolvedValue({
        id: 'new-vendor',
        vendorCode: 'KI/VEN/0001',
        businessName: 'Shree Computers Pvt Ltd',
        documents: [],
      });
      prisma.ocrJob.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.create(
        baseDto({ ocrJobId: 'job1' }),
        actor,
        context,
      );

      // The vendor is re-read after the document is attached, so the response
      // reflects the document rather than the pre-attachment snapshot.
      expect(prisma.vendor.findUniqueOrThrow).toHaveBeenCalled();
      expect((result as { documents: unknown[] }).documents).toHaveLength(1);
    });

    it('fails the whole create when a concurrent request consumed the draft first', async () => {
      prisma.ocrJob.findUnique.mockResolvedValue({
        id: 'job1',
        status: 'COMPLETED',
        targetType: 'VENDOR',
        documentId: 'doc1',
        consumedAt: null,
      });
      prisma.vendor.create.mockResolvedValue({ id: 'new', vendorCode: 'KI/VEN/0001' });
      // The guarded update matched no rows: another request won the race.
      prisma.ocrJob.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.create(baseDto({ ocrJobId: 'job1' }), actor, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('archive', () => {
    it('soft-deletes rather than removing the row', async () => {
      prisma.vendor.findUnique.mockResolvedValue({
        id: 'v1',
        vendorCode: 'KI/VEN/0001',
        archivedAt: null,
      });
      prisma.vendor.update.mockResolvedValue({
        id: 'v1',
        vendorCode: 'KI/VEN/0001',
        archivedAt: new Date(),
      });

      await service.archive('v1', actor, context, 'No longer trading');

      const call = prisma.vendor.update.mock.calls[0][0];
      expect(call.data.archivedAt).toBeInstanceOf(Date);
      expect(call.data.status).toBe('INACTIVE');
    });

    it('refuses to archive an already archived vendor', async () => {
      prisma.vendor.findUnique.mockResolvedValue({
        id: 'v1',
        archivedAt: new Date(),
      });

      await expect(service.archive('v1', actor, context)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('mapProduct', () => {
    const dellLaptop = {
      id: 'p1',
      name: 'Latitude Laptop',
      companyId: 'c1',
      company: { name: 'Dell' },
    };
    const createdMapping = {
      id: 'vp1',
      vendorSku: null,
      isPreferred: false,
      models: [],
      product: { id: 'p1', name: 'Latitude Laptop' },
    };

    it('refuses a product whose brand is not mapped to the vendor', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', archivedAt: null });
      prisma.product.findFirst.mockResolvedValue(dellLaptop);
      prisma.vendorProduct.findUnique.mockResolvedValue(null);

      await expect(
        service.mapProduct('v1', { productId: 'p1' }, actor, context),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.vendorProduct.create).not.toHaveBeenCalled();
      expect(prisma.vendorCompany.create).not.toHaveBeenCalled();
    });

    it('maps the brand too only when explicitly confirmed', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', archivedAt: null });
      prisma.product.findFirst.mockResolvedValue(dellLaptop);
      prisma.vendorProduct.findUnique.mockResolvedValue(null);
      prisma.vendorProduct.create.mockResolvedValue(createdMapping);

      await service.mapProduct(
        'v1',
        { productId: 'p1', mapBrand: true },
        { ...actor, permissions: [...actor.permissions, 'vendor.manage_brands'] },
        context,
      );

      expect(prisma.vendorCompany.create).toHaveBeenCalledWith({
        data: { vendorId: 'v1', companyId: 'c1' },
      });
    });

    it('maps directly when the brand is already mapped', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', archivedAt: null });
      prisma.product.findFirst.mockResolvedValue(dellLaptop);
      prisma.vendorProduct.findUnique.mockResolvedValue(null);
      prisma.vendorCompany.findUnique.mockResolvedValue({ id: 'vc1' });
      prisma.vendorProduct.create.mockResolvedValue(createdMapping);

      await service.mapProduct('v1', { productId: 'p1' }, actor, context);

      expect(prisma.vendorProduct.create).toHaveBeenCalled();
      expect(prisma.vendorCompany.create).not.toHaveBeenCalled();
    });

    it('refuses to map a product to an archived vendor', async () => {
      prisma.vendor.findUnique.mockResolvedValue({
        id: 'v1',
        archivedAt: new Date(),
      });

      await expect(
        service.mapProduct('v1', { productId: 'p1' }, actor, context),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to map the same product twice', async () => {
      prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', archivedAt: null });
      prisma.product.findFirst.mockResolvedValue({
        id: 'p1',
        name: 'Latitude',
        modelNumber: 'LAT',
        companyId: 'c1',
      });
      prisma.vendorProduct.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.mapProduct('v1', { productId: 'p1' }, actor, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
