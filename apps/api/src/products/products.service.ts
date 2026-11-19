import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { StockService } from '../stock/stock.service';
import { DocumentsService } from '../documents/documents.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName } from '../common/utils/normalize';
import type {
  CreateProductCategoryDto,
  CreateProductDto,
  QueryProductsDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const productSelect = {
  id: true,
  productCode: true,
  name: true,
  modelNumber: true,
  designNumber: true,
  description: true,
  specifications: true,
  reorderLevel: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  imageDocumentId: true,
  company: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { vendors: true } },
} satisfies Prisma.ProductSelect;

/** Specification keys are user-supplied; keep them sane and bounded. */
const MAX_SPEC_ENTRIES = 60;
const MAX_SPEC_KEY_LENGTH = 80;
const MAX_SPEC_VALUE_LENGTH = 500;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly stockService: StockService,
    private readonly documentsService: DocumentsService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findAll(query: QueryProductsDto): Promise<PaginatedResult<unknown>> {
    const where = this.buildWhere(query);
    const trackingEnabled = await this.stockService.isTrackingEnabled();

    // Stock-based filters need a SUM over the ledger, which is not expressible
    // as a Prisma product filter, so those views resolve candidates first and
    // then filter on the computed balance.
    const needsBalanceFilter =
      trackingEnabled && (query.lowStockOnly || query.outOfStockOnly);

    if (!needsBalanceFilter) {
      const [products, totalItems] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          select: productSelect,
          orderBy: { [query.sortBy]: query.sortDir },
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.product.count({ where }),
      ]);

      const items = await this.attachStock(products, trackingEnabled);
      return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
    }

    const candidates = await this.prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: { [query.sortBy]: query.sortDir },
      take: 5000,
    });

    const withStock = await this.attachStock(candidates, true);

    const filtered = withStock.filter((row) => {
      const item = row as { onHand: number; isLowStock: boolean };
      if (query.outOfStockOnly && item.onHand > 0) return false;
      if (query.lowStockOnly && !item.isLowStock) return false;
      return true;
    });

    const page = filtered.slice(query.skip, query.skip + query.take);
    return buildPaginatedResult(page, filtered.length, query.page, query.pageSize);
  }

  /**
   * Adds on-hand figures to product rows in a single extra query.
   *
   * When tracking is off nothing is added: a `0` would read as "none in stock"
   * rather than "quantities are not tracked".
   */
  private async attachStock(
    products: Array<Record<string, unknown> & { id: string; reorderLevel: number | null }>,
    trackingEnabled: boolean,
  ): Promise<unknown[]> {
    if (!trackingEnabled) return products;

    const balances = await this.stockService.getBalancesFor(
      products.map((p) => p.id),
    );

    return products.map((product) => {
      const onHand = balances.get(product.id) ?? 0;
      return {
        ...product,
        onHand,
        isLowStock:
          product.reorderLevel !== null && onHand <= (product.reorderLevel ?? 0),
        isOutOfStock: onHand <= 0,
      };
    });
  }

  private buildWhere(query: QueryProductsDto): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [];

    if (!query.includeArchived) and.push({ archivedAt: null });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.vendorId) and.push({ vendors: { some: { vendorId: query.vendorId } } });

    if (query.companyName) {
      and.push({
        company: { name: { contains: query.companyName, mode: 'insensitive' } },
      });
    }
    if (query.modelNumber) {
      and.push({ modelNumber: { contains: query.modelNumber, mode: 'insensitive' } });
    }
    if (query.designNumber) {
      and.push({ designNumber: { contains: query.designNumber, mode: 'insensitive' } });
    }

    if (query.search) {
      const term = query.search;
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { normalizedName: { contains: normalizeName(term) } },
          { productCode: { contains: term, mode: 'insensitive' } },
          { modelNumber: { contains: term, mode: 'insensitive' } },
          { designNumber: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { company: { name: { contains: term, mode: 'insensitive' } } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true } },
        imageDocument: {
          select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true },
        },
        documents: {
          where: { archivedAt: null },
          select: {
            id: true,
            kind: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        vendors: {
          include: {
            vendor: {
              select: {
                id: true,
                vendorCode: true,
                businessName: true,
                phone: true,
                email: true,
                city: true,
                status: true,
                archivedAt: true,
              },
            },
          },
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!product) throw new NotFoundException(`Product ${id} was not found`);

    const trackingEnabled = await this.stockService.isTrackingEnabled();

    if (!trackingEnabled) {
      return { ...product, stockTrackingEnabled: false };
    }

    const [onHand, byLocation] = await Promise.all([
      this.stockService.getProductBalance(id),
      this.stockService.getProductBalanceByLocation(id),
    ]);

    return {
      ...product,
      stockTrackingEnabled: true,
      onHand,
      stockByLocation: byLocation,
      isLowStock:
        product.reorderLevel !== null && onHand <= (product.reorderLevel ?? 0),
      isOutOfStock: onHand <= 0,
    };
  }

  /** Flat rows for the catalogue export. Honours the same filters as the list. */
  async findAllForExport(query: QueryProductsDto) {
    const products = await this.prisma.product.findMany({
      where: this.buildWhere(query),
      select: {
        id: true,
        productCode: true,
        name: true,
        modelNumber: true,
        designNumber: true,
        description: true,
        specifications: true,
        reorderLevel: true,
        isActive: true,
        createdAt: true,
        company: { select: { name: true } },
        category: { select: { name: true } },
        vendors: {
          select: { vendor: { select: { businessName: true } } },
        },
      },
      orderBy: { [query.sortBy]: query.sortDir },
      take: 5000,
    });

    const trackingEnabled = await this.stockService.isTrackingEnabled();
    const balances = trackingEnabled
      ? await this.stockService.getBalancesFor(products.map((p) => p.id))
      : new Map<string, number>();

    return { products, balances, trackingEnabled };
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  async create(dto: CreateProductDto, actor: AuthenticatedUser) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, archivedAt: null },
      select: { id: true, name: true },
    });
    if (!company) {
      throw new BadRequestException('The selected brand does not exist or is archived.');
    }

    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId);

    const clash = await this.prisma.product.findUnique({
      where: {
        companyId_modelNumber: {
          companyId: dto.companyId,
          modelNumber: dto.modelNumber,
        },
      },
      select: { id: true, productCode: true, name: true },
    });
    if (clash) {
      throw new ConflictException(
        `${company.name} already has model ${dto.modelNumber}: ${clash.name} (${clash.productCode}).`,
      );
    }

    const specifications = this.normalizeSpecifications(dto.specifications);

    return this.prisma.$transaction(async (tx) => {
      const productCode = await this.numberingService.allocate(
        SEQUENCE_KEYS.PRODUCT,
        tx,
      );

      const product = await tx.product.create({
        data: {
          productCode,
          name: dto.name,
          normalizedName: normalizeName(dto.name),
          companyId: dto.companyId,
          categoryId: dto.categoryId ?? null,
          modelNumber: dto.modelNumber,
          designNumber: cleanOptional(dto.designNumber) ?? null,
          description: cleanOptional(dto.description) ?? null,
          specifications: specifications ?? Prisma.JsonNull,
          reorderLevel: dto.reorderLevel ?? null,
        },
        select: productSelect,
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.create',
          entityType: 'Product',
          entityId: product.id,
          summary: `Created product ${product.productCode} - ${product.name} (${company.name} ${product.modelNumber})`,
          after: {
            name: product.name,
            modelNumber: product.modelNumber,
            companyId: dto.companyId,
            reorderLevel: product.reorderLevel,
          },
        },
        tx,
      );

      return product;
    });
  }

  async update(id: string, dto: UpdateProductDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) {
      throw new BadRequestException('This product is archived. Restore it before editing.');
    }

    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId);

    if (dto.modelNumber && dto.modelNumber !== existing.modelNumber) {
      const clash = await this.prisma.product.findUnique({
        where: {
          companyId_modelNumber: {
            companyId: existing.companyId,
            modelNumber: dto.modelNumber,
          },
        },
        select: { id: true, name: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
          `This brand already has model ${dto.modelNumber}: ${clash.name}.`,
        );
      }
    }

    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
      data.normalizedName = normalizeName(dto.name);
    }
    if (dto.modelNumber !== undefined) data.modelNumber = dto.modelNumber;
    if (dto.designNumber !== undefined) {
      data.designNumber = cleanOptional(dto.designNumber) ?? null;
    }
    if (dto.description !== undefined) {
      data.description = cleanOptional(dto.description) ?? null;
    }
    if (dto.specifications !== undefined) {
      const specifications = this.normalizeSpecifications(dto.specifications);
      data.specifications = specifications ?? Prisma.JsonNull;
    }
    if (dto.reorderLevel !== undefined) data.reorderLevel = dto.reorderLevel;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      select: productSelect,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      summary: `Updated product ${updated.productCode}`,
      before: {
        name: existing.name,
        modelNumber: existing.modelNumber,
        reorderLevel: existing.reorderLevel,
        isActive: existing.isActive,
      },
      after: {
        name: updated.name,
        modelNumber: updated.modelNumber,
        reorderLevel: updated.reorderLevel,
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  /**
   * Soft delete. Refused while stock remains on hand: archiving a product that
   * physically exists would hide real inventory from every report.
   */
  async archive(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This product is already archived.');

    if (await this.stockService.isTrackingEnabled()) {
      const onHand = await this.stockService.getProductBalance(id);
      if (onHand !== 0) {
        throw new ConflictException(
          `This product still has ${onHand} unit(s) in stock. Issue or adjust the stock to zero before archiving.`,
        );
      }
    }

    const archived = await this.prisma.product.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
      select: productSelect,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product.archive',
      entityType: 'Product',
      entityId: id,
      summary: `Archived product ${archived.productCode} - ${archived.name}`,
    });

    return archived;
  }

  async restore(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (!existing.archivedAt) throw new BadRequestException('This product is not archived.');

    const restored = await this.prisma.product.update({
      where: { id },
      data: { archivedAt: null, isActive: true },
      select: productSelect,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product.restore',
      entityType: 'Product',
      entityId: id,
      summary: `Restored product ${restored.productCode} - ${restored.name}`,
    });

    return restored;
  }

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  async setImage(
    productId: string,
    file: { buffer: Buffer; originalFilename: string },
    actor: AuthenticatedUser,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productCode: true, imageDocumentId: true, archivedAt: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (product.archivedAt) {
      throw new BadRequestException('This product is archived.');
    }

    const document = await this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalFilename,
        kind: DocumentKind.PRODUCT_IMAGE,
        productId,
      },
      actor,
    );

    if (!document.mimeType.startsWith('image/')) {
      // The upload already verified the signature; this rejects a valid PDF
      // being set as the catalogue image.
      await this.documentsService.archive(document.id, actor);
      throw new BadRequestException(
        'The product image must be an image file (PNG, JPEG, WEBP or TIFF).',
      );
    }

    const previousImageId = product.imageDocumentId;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { imageDocumentId: document.id },
      });

      // The replaced image is archived, not deleted: the file stays auditable.
      if (previousImageId) {
        await tx.document.update({
          where: { id: previousImageId },
          data: { archivedAt: new Date() },
        });
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.image.set',
          entityType: 'Product',
          entityId: productId,
          summary: `Set catalogue image for ${product.productCode}`,
          before: { imageDocumentId: previousImageId },
          after: { imageDocumentId: document.id },
        },
        tx,
      );
    });

    return document;
  }

  async removeImage(productId: string, actor: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productCode: true, imageDocumentId: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (!product.imageDocumentId) {
      throw new BadRequestException('This product has no catalogue image.');
    }

    const imageId = product.imageDocumentId;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { imageDocumentId: null },
      });
      await tx.document.update({
        where: { id: imageId },
        data: { archivedAt: new Date() },
      });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.image.remove',
          entityType: 'Product',
          entityId: productId,
          summary: `Removed catalogue image from ${product.productCode}`,
          before: { imageDocumentId: imageId },
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  async listCategories(includeInactive = false) {
    return this.prisma.productCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(dto: CreateProductCategoryDto, actor: AuthenticatedUser) {
    const normalizedName = normalizeName(dto.name);

    const existing = await this.prisma.productCategory.findUnique({
      where: { normalizedName },
    });
    if (existing) {
      throw new ConflictException(`The category "${existing.name}" already exists.`);
    }

    const category = await this.prisma.productCategory.create({
      data: {
        name: dto.name,
        normalizedName,
        description: cleanOptional(dto.description) ?? null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product_category.create',
      entityType: 'ProductCategory',
      entityId: category.id,
      summary: `Created product category ${category.name}`,
    });

    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateProductCategoryDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} was not found`);

    if (dto.name && normalizeName(dto.name) !== existing.normalizedName) {
      const clash = await this.prisma.productCategory.findUnique({
        where: { normalizedName: normalizeName(dto.name) },
      });
      if (clash) {
        throw new ConflictException(`The category "${clash.name}" already exists.`);
      }
    }

    // Deactivating a category in use would leave those products pointing at a
    // category the forms no longer offer.
    if (dto.isActive === false) {
      const inUse = await this.prisma.product.count({
        where: { categoryId: id, archivedAt: null },
      });
      if (inUse > 0) {
        throw new ConflictException(
          `${inUse} active product(s) use this category. Move them first.`,
        );
      }
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name: dto.name, normalizedName: normalizeName(dto.name) }
          : {}),
        ...(dto.description !== undefined
          ? { description: cleanOptional(dto.description) ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product_category.update',
      entityType: 'ProductCategory',
      entityId: id,
      summary: `Updated product category ${updated.name}`,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertCategoryUsable(categoryId: string): Promise<void> {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category) throw new BadRequestException('The selected product category does not exist.');
    if (!category.isActive) throw new BadRequestException('The selected product category is inactive.');
  }

  /**
   * Coerces the specification map to trimmed string key/values and rejects
   * anything oversized. Keeps a free-form field from becoming a dumping ground
   * for nested objects nothing can render.
   */
  private normalizeSpecifications(
    input?: Record<string, unknown> | null,
  ): Prisma.InputJsonValue | null {
    if (input === undefined || input === null) return null;

    const entries = Object.entries(input);
    if (entries.length === 0) return null;

    if (entries.length > MAX_SPEC_ENTRIES) {
      throw new BadRequestException(
        `A product may have at most ${MAX_SPEC_ENTRIES} specification entries.`,
      );
    }

    const result: Record<string, string> = {};

    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.trim();
      if (!key) continue;

      if (key.length > MAX_SPEC_KEY_LENGTH) {
        throw new BadRequestException(
          `Specification name "${key.slice(0, 20)}..." is too long.`,
        );
      }

      if (rawValue === null || rawValue === undefined) continue;
      if (typeof rawValue === 'object') {
        throw new BadRequestException(
          `Specification "${key}" must be a simple value, not a nested object.`,
        );
      }

      const value = String(rawValue).trim();
      if (!value) continue;

      if (value.length > MAX_SPEC_VALUE_LENGTH) {
        throw new BadRequestException(`Specification "${key}" is too long.`);
      }

      result[key] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
  }
}
