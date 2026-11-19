import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { StockService } from './stock.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const actor: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'inventory@kenzoinfosystems.com',
  fullName: 'Inventory Manager',
  roles: ['INVENTORY_MANAGER'],
  permissions: [],
};

const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };

describe('StockService', () => {
  let service: StockService;
  let prisma: {
    product: { findUnique: jest.Mock };
    stockLocation: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    stockMovement: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let settings: { isStockTrackingEnabled: jest.Mock; getBoolean: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          productCode: 'KI/PRD/00001',
          name: 'Latitude 3540',
          archivedAt: null,
        }),
      },
      stockLocation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'loc1', name: 'Main Store' }),
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      stockMovement: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantityDelta: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'm1', ...data })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };

    settings = {
      isStockTrackingEnabled: jest.fn().mockResolvedValue(true),
      getBoolean: jest.fn().mockResolvedValue(false), // allowNegativeStock
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(StockService);
  });

  describe('feature gate', () => {
    it('refuses every stock operation while tracking is off', async () => {
      settings.isStockTrackingEnabled.mockResolvedValue(false);

      await expect(
        service.postMovement('p1', { type: StockMovementType.RECEIPT, quantity: 5 }, actor, context),
      ).rejects.toBeInstanceOf(ConflictException);

      await expect(service.assertTrackingEnabled()).rejects.toThrow(
        /Stock tracking is disabled/,
      );
    });

    it('allows operations once tracking is on', async () => {
      await expect(service.assertTrackingEnabled()).resolves.toBeUndefined();
    });
  });

  describe('movement direction', () => {
    it('stores a receipt as a positive delta', async () => {
      await service.postMovement(
        'p1',
        { type: StockMovementType.RECEIPT, quantity: 10 },
        actor,
        context,
      );

      expect(prisma.stockMovement.create.mock.calls[0][0].data.quantityDelta).toBe(10);
    });

    it('stores an issue as a negative delta even though quantity is positive', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 50 },
      });

      await service.postMovement(
        'p1',
        { type: StockMovementType.ISSUE, quantity: 10 },
        actor,
        context,
      );

      const data = prisma.stockMovement.create.mock.calls[0][0].data;
      expect(data.quantityDelta).toBe(-10);
      expect(data.balanceAfter).toBe(40);
    });

    it('records the running balance after each movement', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 7 },
      });

      await service.postMovement(
        'p1',
        { type: StockMovementType.ADJUSTMENT_IN, quantity: 3, reason: 'Recount' },
        actor,
        context,
      );

      expect(prisma.stockMovement.create.mock.calls[0][0].data.balanceAfter).toBe(10);
    });
  });

  describe('negative stock', () => {
    it('refuses an issue larger than the quantity on hand', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 4 },
      });

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.ISSUE, quantity: 5 },
          actor,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('permits going negative when that is explicitly allowed', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 4 },
      });
      settings.getBoolean.mockResolvedValue(true);

      await service.postMovement(
        'p1',
        { type: StockMovementType.ISSUE, quantity: 5 },
        actor,
        context,
      );

      expect(prisma.stockMovement.create.mock.calls[0][0].data.balanceAfter).toBe(-1);
    });

    it('allows issuing exactly the quantity on hand', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 5 },
      });

      await service.postMovement(
        'p1',
        { type: StockMovementType.ISSUE, quantity: 5 },
        actor,
        context,
      );

      expect(prisma.stockMovement.create.mock.calls[0][0].data.balanceAfter).toBe(0);
    });
  });

  describe('validation', () => {
    it('requires a reason for an adjustment', async () => {
      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.ADJUSTMENT_IN, quantity: 2 },
          actor,
          context,
        ),
      ).rejects.toThrow(/reason is required/i);
    });

    it('accepts an adjustment that supplies a reason', async () => {
      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.ADJUSTMENT_IN, quantity: 2, reason: 'Physical count' },
          actor,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it('does not require a reason for a receipt', async () => {
      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.RECEIPT, quantity: 2 },
          actor,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a future-dated movement', async () => {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.RECEIPT, quantity: 1, occurredAt: tomorrow },
          actor,
          context,
        ),
      ).rejects.toThrow(/cannot be dated in the future/i);
    });

    it('rejects a movement against an archived product', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'p1',
        productCode: 'KI/PRD/00001',
        name: 'Latitude',
        archivedAt: new Date(),
      });

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.RECEIPT, quantity: 1 },
          actor,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a movement against a product that does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.RECEIPT, quantity: 1 },
          actor,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('opening balance', () => {
    it('is allowed once per product and location', async () => {
      prisma.stockMovement.count.mockResolvedValue(0);

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.OPENING_BALANCE, quantity: 25 },
          actor,
          context,
        ),
      ).resolves.toBeDefined();
    });

    it('is refused a second time', async () => {
      prisma.stockMovement.count.mockResolvedValue(1);

      await expect(
        service.postMovement(
          'p1',
          { type: StockMovementType.OPENING_BALANCE, quantity: 25 },
          actor,
          context,
        ),
      ).rejects.toThrow(/already been recorded/i);
    });
  });

  describe('balances', () => {
    it('derives on-hand from the sum of movements', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: 42 },
      });

      await expect(service.getProductBalance('p1')).resolves.toBe(42);
    });

    it('reports zero when a product has no movements', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({
        _sum: { quantityDelta: null },
      });

      await expect(service.getProductBalance('p1')).resolves.toBe(0);
    });

    it('fetches many balances in one grouped query', async () => {
      prisma.stockMovement.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantityDelta: 5 } },
        { productId: 'p2', _sum: { quantityDelta: 0 } },
      ]);

      const balances = await service.getBalancesFor(['p1', 'p2', 'p3']);

      expect(prisma.stockMovement.groupBy).toHaveBeenCalledTimes(1);
      expect(balances.get('p1')).toBe(5);
      expect(balances.get('p2')).toBe(0);
      // A product with no rows still reports 0 rather than undefined.
      expect(balances.get('p3')).toBe(0);
    });

    it('does not query at all for an empty product list', async () => {
      await expect(service.getBalancesFor([])).resolves.toEqual(new Map());
      expect(prisma.stockMovement.groupBy).not.toHaveBeenCalled();
    });
  });
});
