import { businessDayEnd, businessDayStart } from '../common/utils/business-date';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertNotReferenced } from '../common/utils/master-delete';
import { AuditService } from '../audit/audit.service';
import { SettingsService, SETTING_KEYS } from '../settings/settings.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName, normalizedNameFilter } from '../common/utils/normalize';
import type {
  CreateStockLocationDto,
  CreateStockMovementDto,
  QueryStockBalancesDto,
  QueryStockMovementsDto,
} from './dto/stock.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';

/** Which direction each movement type moves stock. */
const MOVEMENT_SIGN: Record<StockMovementType, 1 | -1> = {
  OPENING_BALANCE: 1,
  RECEIPT: 1,
  ADJUSTMENT_IN: 1,
  RETURN_IN: 1,
  ISSUE: -1,
  ADJUSTMENT_OUT: -1,
  RETURN_OUT: -1,
};

/** Types with no source document, so the user must say why. */
const REASON_REQUIRED: ReadonlySet<StockMovementType> = new Set([
  StockMovementType.ADJUSTMENT_IN,
  StockMovementType.ADJUSTMENT_OUT,
]);

export interface StockBalance {
  productId: string;
  locationId: string | null;
  onHand: number;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
  ) {}

  // -------------------------------------------------------------------------
  // Gate
  // -------------------------------------------------------------------------

  /**
   * Every stock operation passes through here.
   *
   * With tracking off the catalogue is authoritative and no quantity exists,
   * so returning an empty list would be a lie. A clear 409 tells the caller
   * the feature is switched off rather than that there is no stock.
   */
  async assertTrackingEnabled(): Promise<void> {
    if (!(await this.settingsService.isStockTrackingEnabled())) {
      throw new ConflictException(
        'Stock tracking is disabled. A Super Admin can enable it in Settings ' +
          'once the stock process is confirmed.',
      );
    }
  }

  async isTrackingEnabled(): Promise<boolean> {
    return this.settingsService.isStockTrackingEnabled();
  }

  // -------------------------------------------------------------------------
  // Locations
  // -------------------------------------------------------------------------

  /** Permanently deletes a stock location that has never held a movement. */
  async deleteLocation(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.stockLocation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Stock location ${id} was not found`);
    const movements = await this.prisma.stockMovement.count({ where: { locationId: id } });
    assertNotReferenced(`The location "${existing.name}"`, [{ label: 'stock movement', count: movements }]);
    await this.prisma.stockLocation.delete({ where: { id } });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'stock_location.delete',
      entityType: 'StockLocation',
      entityId: id,
      summary: `Deleted stock location ${existing.name}`,
      before: { name: existing.name },
    });
    return { id, deleted: true };
  }

  async listLocations() {
    return this.prisma.stockLocation.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { movements: true } } },
    });
  }

  /**
   * The location movements default to.
   *
   * Created on first use so enabling stock tracking does not require a
   * separate setup step.
   */
  async getOrCreateDefaultLocation(
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; name: string }> {
    const client = tx ?? this.prisma;

    const existing = await client.stockLocation.findFirst({
      where: { isDefault: true },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    const anyLocation = await client.stockLocation.findFirst({
      select: { id: true, name: true },
    });
    if (anyLocation) return anyLocation;

    return client.stockLocation.create({
      data: {
        name: 'Main Store',
        code: 'MAIN',
        isDefault: true,
      },
      select: { id: true, name: true },
    });
  }

  async createLocation(dto: CreateStockLocationDto, actor: AuthenticatedUser) {
    await this.assertTrackingEnabled();

    const clash = await this.prisma.stockLocation.findUnique({
      where: { code: dto.code },
    });
    if (clash) {
      throw new ConflictException(
        `A location with code ${dto.code} already exists (${clash.name}).`,
      );
    }

    const isFirst = (await this.prisma.stockLocation.count()) === 0;

    const location = await this.prisma.stockLocation.create({
      data: {
        name: dto.name,
        code: dto.code,
        address: cleanOptional(dto.address) ?? null,
        isDefault: isFirst,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'stock.location.create',
      entityType: 'StockLocation',
      entityId: location.id,
      summary: `Created stock location ${location.code} - ${location.name}`,
      after: { name: location.name, code: location.code },
    });

    return location;
  }

  // -------------------------------------------------------------------------
  // Balances (always derived)
  // -------------------------------------------------------------------------

  /**
   * On-hand for one product, summed across every location.
   *
   * Computed from the ledger on every read. There is no cached quantity
   * column, so a balance cannot drift away from the movements that produced it.
   */
  async getProductBalance(productId: string): Promise<number> {
    const result = await this.prisma.stockMovement.aggregate({
      where: { productId },
      _sum: { quantityDelta: true },
    });
    return result._sum.quantityDelta ?? 0;
  }

  /** Per-location breakdown for one product. */
  async getProductBalanceByLocation(productId: string) {
    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['locationId'],
      where: { productId },
      _sum: { quantityDelta: true },
    });

    const locations = await this.prisma.stockLocation.findMany({
      where: { id: { in: grouped.map((g) => g.locationId) } },
      select: { id: true, name: true, code: true },
    });
    const byId = new Map(locations.map((l) => [l.id, l]));

    return grouped.map((row) => ({
      location: byId.get(row.locationId) ?? null,
      onHand: row._sum.quantityDelta ?? 0,
    }));
  }

  /**
   * On-hand for many products in ONE query.
   *
   * Used by every product list so rendering 25 rows costs two queries, not 26.
   */
  async getBalancesFor(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { quantityDelta: true },
    });

    const balances = new Map<string, number>();
    for (const id of productIds) balances.set(id, 0);
    for (const row of grouped) {
      balances.set(row.productId, row._sum.quantityDelta ?? 0);
    }
    return balances;
  }

  /** Stock report: every tracked product with its on-hand and reorder state. */
  async listBalances(
    query: QueryStockBalancesDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.assertTrackingEnabled();

    const and: Prisma.ProductWhereInput[] = [{ archivedAt: null }];

    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { normalizedName: normalizedNameFilter(query.search) },
          { productCode: { contains: query.search, mode: 'insensitive' } },
          { modelNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = { AND: and };

    // Low-stock and out-of-stock depend on a SUM over the ledger, which cannot
    // be expressed as a Prisma product filter. For those views the candidate
    // set is resolved first, then filtered on the computed balance.
    const needsBalanceFilter = query.lowStockOnly || query.outOfStockOnly;

    if (!needsBalanceFilter) {
      const [products, totalItems] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          select: this.balanceProductSelect(),
          orderBy: { name: 'asc' },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.product.count({ where }),
      ]);

      const balances = await this.getBalancesFor(products.map((p) => p.id));
      const items = products.map((p) => this.toBalanceRow(p, balances.get(p.id) ?? 0));

      return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
    }

    const candidates = await this.prisma.product.findMany({
      where,
      select: this.balanceProductSelect(),
      orderBy: { name: 'asc' },
      // Bounded so a filtered report cannot pull an unbounded table into memory.
      take: 5000,
    });

    const balances = await this.getBalancesFor(candidates.map((p) => p.id));

    const filtered = candidates
      .map((p) => this.toBalanceRow(p, balances.get(p.id) ?? 0))
      .filter((row) => {
        if (query.outOfStockOnly && row.onHand > 0) return false;
        if (query.lowStockOnly && !row.isLowStock) return false;
        return true;
      });

    const page = filtered.slice(query.skip, query.skip + query.take);
    return buildPaginatedResult(page, filtered.length, query.page, query.pageSize);
  }

  private balanceProductSelect() {
    return {
      id: true,
      productCode: true,
      name: true,
      modelNumber: true,
      reorderLevel: true,
      company: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    } satisfies Prisma.ProductSelect;
  }

  private toBalanceRow(
    product: {
      id: string;
      productCode: string;
      name: string;
      modelNumber: string | null;
      reorderLevel: number | null;
      company: { id: string; name: string };
      category: { id: string; name: string } | null;
    },
    onHand: number,
  ) {
    return {
      ...product,
      onHand,
      // A product with no reorder level is never "low": the business has not
      // said what low means for it.
      isLowStock: product.reorderLevel !== null && onHand <= product.reorderLevel,
      isOutOfStock: onHand <= 0,
    };
  }

  // -------------------------------------------------------------------------
  // Posting movements
  // -------------------------------------------------------------------------

  /**
   * Appends a movement to the ledger.
   *
   * Runs in a transaction that re-reads the balance, so two concurrent issues
   * cannot each see sufficient stock and both succeed.
   */
  async postMovement(
    productId: string,
    dto: CreateStockMovementDto,
    actor: AuthenticatedUser,
    context: RequestContext,
    options: { referenceType?: string; referenceId?: string } = {},
  ) {
    await this.assertTrackingEnabled();

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productCode: true, name: true, archivedAt: true },
    });

    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (product.archivedAt) {
      throw new BadRequestException(
        'This product is archived. Restore it before posting stock movements.',
      );
    }

    if (REASON_REQUIRED.has(dto.type) && !cleanOptional(dto.reason)) {
      throw new BadRequestException(
        'A reason is required for a stock adjustment, so the ledger explains why the count changed.',
      );
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('occurredAt is not a valid date.');
    }
    // A future-dated movement would make the current balance wrong today.
    if (occurredAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('A stock movement cannot be dated in the future.');
    }

    const location = dto.locationId
      ? await this.loadLocation(dto.locationId)
      : await this.getOrCreateDefaultLocation();

    const allowNegative = await this.settingsService.getBoolean(
      SETTING_KEYS.ALLOW_NEGATIVE_STOCK,
    );

    const sign = MOVEMENT_SIGN[dto.type];
    const quantityDelta = sign * dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      // Serialise every movement for this product. Without the row lock two
      // concurrent issues both read the same balance under READ COMMITTED and
      // both pass the negative-stock check (and two opening balances can both
      // see "none recorded yet").
      const locked = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
        SELECT "archivedAt" FROM "products" WHERE "id" = ${productId}::uuid FOR UPDATE`;
      // Re-checked under the lock: the product may have been archived since
      // the read above.
      if (locked[0]?.archivedAt) {
        throw new BadRequestException(
          'This product is archived. Restore it before posting stock movements.',
        );
      }

      // Opening balance is the starting count, so it only makes sense once.
      if (dto.type === StockMovementType.OPENING_BALANCE) {
        const existingOpening = await tx.stockMovement.count({
          where: {
            productId,
            locationId: location.id,
            type: StockMovementType.OPENING_BALANCE,
          },
        });
        if (existingOpening > 0) {
          throw new ConflictException(
            'An opening balance has already been recorded for this product at this location. Use an adjustment instead.',
          );
        }
      }

      const current = await tx.stockMovement.aggregate({
        where: { productId, locationId: location.id },
        _sum: { quantityDelta: true },
      });
      const balanceBefore = current._sum.quantityDelta ?? 0;
      const balanceAfter = balanceBefore + quantityDelta;

      // Only outbound movements are refused: a receipt that reduces an existing
      // deficit (left over from when negative stock was allowed) must succeed.
      if (quantityDelta < 0 && balanceAfter < 0 && !allowNegative) {
        throw new ConflictException(
          `Only ${balanceBefore} unit(s) are in stock at ${location.name}; cannot remove ${dto.quantity}.`,
        );
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId,
          locationId: location.id,
          type: dto.type,
          quantityDelta,
          balanceAfter,
          reason: cleanOptional(dto.reason) ?? null,
          referenceType: options.referenceType ?? null,
          referenceId: options.referenceId ?? null,
          occurredAt,
          createdById: actor.id,
        },
        include: {
          location: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, productCode: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'stock.movement.post',
          entityType: 'StockMovement',
          entityId: movement.id,
          summary:
            `${dto.type} ${Math.abs(quantityDelta)} of ${product.productCode} ` +
            `(${product.name}) at ${location.name}: ${balanceBefore} -> ${balanceAfter}`,
          after: {
            type: dto.type,
            quantityDelta,
            balanceBefore,
            balanceAfter,
            reason: movement.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return movement;
    });
  }

  // -------------------------------------------------------------------------
  // Ledger
  // -------------------------------------------------------------------------

  async listMovements(
    query: QueryStockMovementsDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.assertTrackingEnabled();

    const where: Prisma.StockMovementWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: businessDayStart(query.from) } : {}),
              ...(query.to ? { lt: businessDayEnd(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ [query.sortBy]: query.sortDir }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.take,
        include: {
          product: {
            select: { id: true, productCode: true, name: true, modelNumber: true },
          },
          location: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  /** Headline numbers for the inventory dashboard. */
  async getSummary() {
    await this.assertTrackingEnabled();

    const products = await this.prisma.product.findMany({
      where: { archivedAt: null },
      select: { id: true, reorderLevel: true },
    });

    const balances = await this.getBalancesFor(products.map((p) => p.id));

    let totalUnits = 0;
    let outOfStock = 0;
    let lowStock = 0;
    let inStock = 0;

    for (const product of products) {
      const onHand = balances.get(product.id) ?? 0;
      totalUnits += onHand;
      if (onHand <= 0) outOfStock += 1;
      else inStock += 1;
      if (product.reorderLevel !== null && onHand <= product.reorderLevel) {
        lowStock += 1;
      }
    }

    return {
      trackedProducts: products.length,
      totalUnits,
      inStock,
      outOfStock,
      lowStock,
      movements: await this.prisma.stockMovement.count(),
      locations: await this.prisma.stockLocation.count(),
    };
  }

  private async loadLocation(locationId: string) {
    const location = await this.prisma.stockLocation.findUnique({
      where: { id: locationId },
      select: { id: true, name: true, isActive: true },
    });
    if (!location) throw new BadRequestException('The selected stock location does not exist.');
    if (!location.isActive) throw new BadRequestException('The selected stock location is inactive.');
    return location;
  }

}
