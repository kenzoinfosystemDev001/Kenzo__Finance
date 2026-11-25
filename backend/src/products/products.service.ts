import { businessDayEnd, businessDayStart } from '../common/utils/business-date';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertNotReferenced } from '../common/utils/master-delete';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { StockService } from '../stock/stock.service';
import { DocumentsService } from '../documents/documents.service';
import { VendorsService } from '../vendors/vendors.service';
import {
  buildPaginatedResult,
  PaginationQueryDto,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName, normalizedNameFilter } from '../common/utils/normalize';
import { PERMISSIONS } from '../common/authz/permissions';
import type {
  CreateProductCategoryDto,
  CreateProductDto,
  CreateProductModelDto,
  MapProductVendorDto,
  ProductLookupQueryDto,
  QueryProductsDto,
  StatusDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import type { UpdateVendorProductDto } from '../vendors/dto/mapping.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import { normalizeModelNumber, toSpecificationJson } from './product-specs';

export const PRODUCT_ENTITY = 'Product';

const productListSelect = {
  id: true,
  productCode: true,
  sku: true,
  name: true,
  description: true,
  reorderLevel: true,
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  imageDocumentId: true,
  company: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { vendors: true, models: true } },
} satisfies Prisma.ProductSelect;

const modelSelect = {
  id: true,
  modelCode: true,
  modelName: true,
  modelNumber: true,
  description: true,
  specifications: true,
  isActive: true,
  imageDocumentId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { vendors: true } },
} satisfies Prisma.ProductModelSelect;

/** Statistics and stock filters cannot be pushed into one Prisma query. */
const MAX_FILTER_CANDIDATES = 5000;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
    private readonly stockService: StockService,
    private readonly documentsService: DocumentsService,
    private readonly vendorsService: VendorsService,
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
    const needsBalanceFilter = trackingEnabled && (query.lowStockOnly || query.outOfStockOnly);

    if (!needsBalanceFilter) {
      const [products, totalItems] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          select: productListSelect,
          orderBy: this.buildOrderBy(query),
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
      select: productListSelect,
      orderBy: this.buildOrderBy(query),
      take: MAX_FILTER_CANDIDATES,
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

  /** Dashboard figures counted from live (non-archived) rows. */
  async summary() {
    const live = { archivedAt: null } satisfies Prisma.ProductWhereInput;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, active, inactive, archived, addedLast30Days, brands, models, activeModels, vendorMappings, modelMappings] =
      await this.prisma.$transaction([
        this.prisma.product.count({ where: live }),
        this.prisma.product.count({ where: { ...live, isActive: true } }),
        this.prisma.product.count({ where: { ...live, isActive: false } }),
        this.prisma.product.count({ where: { archivedAt: { not: null } } }),
        this.prisma.product.count({ where: { ...live, createdAt: { gte: since } } }),
        this.prisma.company.count({ where: { archivedAt: null, products: { some: live } } }),
        this.prisma.productModel.count({ where: { product: live } }),
        this.prisma.productModel.count({ where: { product: live, isActive: true } }),
        this.prisma.vendorProduct.count({ where: { product: live, vendor: { archivedAt: null } } }),
        this.prisma.vendorProductModel.count({
          where: { productModel: { product: live }, vendorProduct: { vendor: { archivedAt: null } } },
        }),
      ]);

    return {
      products: { total, active, inactive, archived, addedLast30Days },
      brands,
      models: { total: models, active: activeModels },
      vendorMappings: { products: vendorMappings, models: modelMappings },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Adds on-hand figures to product rows in a single extra query. When stock
   * tracking is off nothing is added: a 0 would read as "none in stock".
   */
  private async attachStock(
    products: Array<Record<string, unknown> & { id: string; reorderLevel: number | null }>,
    trackingEnabled: boolean,
  ): Promise<unknown[]> {
    if (!trackingEnabled) return products;

    const balances = await this.stockService.getBalancesFor(products.map((p) => p.id));

    return products.map((product) => {
      const onHand = balances.get(product.id) ?? 0;
      return {
        ...product,
        onHand,
        isLowStock: product.reorderLevel !== null && onHand <= (product.reorderLevel ?? 0),
        isOutOfStock: onHand <= 0,
      };
    });
  }

  private buildOrderBy(query: QueryProductsDto): Prisma.ProductOrderByWithRelationInput[] {
    const dir = query.sortDir;
    const tieBreaker: Prisma.ProductOrderByWithRelationInput = { id: 'asc' };
    switch (query.sortBy) {
      case 'modelCount':
        return [{ models: { _count: dir } }, { name: 'asc' }, tieBreaker];
      case 'vendorCount':
        return [{ vendors: { _count: dir } }, { name: 'asc' }, tieBreaker];
      default:
        return [{ [query.sortBy]: dir }, tieBreaker];
    }
  }

  private buildWhere(query: QueryProductsDto): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [];

    if (!query.includeArchived) and.push({ archivedAt: null });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.vendorId) and.push({ vendors: { some: { vendorId: query.vendorId } } });

    if (query.createdFrom) and.push({ createdAt: { gte: businessDayStart(query.createdFrom) } });
    if (query.createdTo) {
      // Inclusive: everything before the start of the following business day.
      and.push({ createdAt: { lt: businessDayEnd(query.createdTo) } });
    }

    if (query.companyName) {
      and.push({ company: { name: { contains: query.companyName, mode: 'insensitive' } } });
    }

    if (query.modelNumber) {
      const text = { contains: query.modelNumber, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { modelNumber: text },
          { models: { some: { OR: [{ modelNumber: text }, { modelName: text }] } } },
        ],
      });
    }

    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { name: text },
          { normalizedName: normalizedNameFilter(query.search) },
          { productCode: text },
          { sku: text },
          { modelNumber: text },
          { description: text },
          { company: { name: text } },
          { category: { name: text } },
          { models: { some: { OR: [{ modelName: text }, { modelNumber: text }, { modelCode: text }] } } },
          { vendors: { some: { vendor: { OR: [{ businessName: text }, { vendorCode: text }] } } } },
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
        createdBy: { select: { id: true, fullName: true } },
        updatedBy: { select: { id: true, fullName: true } },
        imageDocument: {
          select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true },
        },
        models: { select: modelSelect, orderBy: [{ isActive: 'desc' }, { modelName: 'asc' }] },
        documents: {
          where: { archivedAt: null, kind: { not: DocumentKind.PRODUCT_IMAGE } },
          select: {
            id: true,
            kind: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            replacesDocumentId: true,
            uploadedBy: { select: { id: true, fullName: true } },
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
                contactPerson: true,
                phone: true,
                email: true,
                city: true,
                status: true,
                archivedAt: true,
                companies: { select: { companyId: true } },
                _count: { select: { products: true } },
                contacts: {
                  where: { isPrimary: true },
                  orderBy: { contactType: 'asc' },
                  take: 1,
                  select: { name: true, phone: true, email: true },
                },
              },
            },
            models: {
              select: {
                productModelId: true,
                productModel: { select: { id: true, modelName: true, modelNumber: true } },
              },
            },
          },
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!product) throw new NotFoundException(`Product ${id} was not found`);

    // Whether each mapped vendor is (still) mapped to this product's brand.
    const vendors = product.vendors.map(({ vendor, ...mapping }) => {
      const { companies, ...vendorFields } = vendor;
      return {
        ...mapping,
        vendor: vendorFields,
        brandMapped: companies.some((c) => c.companyId === product.companyId),
      };
    });

    const base = { ...product, vendors };
    const trackingEnabled = await this.stockService.isTrackingEnabled();
    if (!trackingEnabled) return { ...base, stockTrackingEnabled: false };

    const [onHand, byLocation] = await Promise.all([
      this.stockService.getProductBalance(id),
      this.stockService.getProductBalanceByLocation(id),
    ]);

    return {
      ...base,
      stockTrackingEnabled: true,
      onHand,
      stockByLocation: byLocation,
      isLowStock: product.reorderLevel !== null && onHand <= (product.reorderLevel ?? 0),
      isOutOfStock: onHand <= 0,
    };
  }

  /** Activity: the product, its models and documents, and every vendor mapping of it. */
  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);

    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: PRODUCT_ENTITY, entityId: id },
        { parentEntityType: PRODUCT_ENTITY, parentEntityId: id },
        // Vendor mappings are parented to the vendor; match them by productId.
        { entityType: 'VendorProduct', after: { path: ['productId'], equals: id } },
        { entityType: 'VendorProduct', before: { path: ['productId'], equals: id } },
      ],
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          createdAt: true,
          actor: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, pagination.page, pagination.pageSize);
  }

  /**
   * Selector for later modules (enquiry, quotation, PI lines): active
   * products with their active models only.
   */
  async lookup(query: ProductLookupQueryDto) {
    const and: Prisma.ProductWhereInput[] = [{ archivedAt: null, isActive: true }];
    if (query.companyId) and.push({ companyId: query.companyId });
    if (query.vendorId) and.push({ vendors: { some: { vendorId: query.vendorId, status: 'ACTIVE' } } });
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { name: text },
          { productCode: text },
          { sku: text },
          { models: { some: { OR: [{ modelName: text }, { modelNumber: text }] } } },
        ],
      });
    }

    return this.prisma.product.findMany({
      where: { AND: and },
      select: {
        id: true,
        productCode: true,
        name: true,
        company: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        models: {
          where: { isActive: true },
          select: { id: true, modelCode: true, modelName: true, modelNumber: true },
          orderBy: { modelName: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
      take: 25,
    });
  }

  /**
   * The check later business documents must run before referencing a
   * product/model: archived never, inactive only with product.use_inactive.
   */
  async assertSelectableForTransaction(productId: string, modelId: string | null, actor: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, isActive: true, archivedAt: true },
    });
    if (!product || product.archivedAt) throw new BadRequestException('The product is not available.');
    const allowInactive = actor.permissions.includes(PERMISSIONS.PRODUCT_USE_INACTIVE);
    if (!product.isActive && !allowInactive) throw new BadRequestException(`${product.name} is inactive.`);

    if (modelId) {
      const model = await this.prisma.productModel.findFirst({
        where: { id: modelId, productId },
        select: { id: true, modelName: true, isActive: true },
      });
      if (!model) throw new BadRequestException('The model does not belong to this product.');
      if (!model.isActive && !allowInactive) throw new BadRequestException(`${model.modelName} is inactive.`);
    }
    return product;
  }

  /** Flat rows for the catalogue export. Honours the same filters as the list. */
  async findAllForExport(query: QueryProductsDto) {
    const products = await this.prisma.product.findMany({
      where: this.buildWhere(query),
      select: {
        id: true,
        productCode: true,
        sku: true,
        name: true,
        description: true,
        reorderLevel: true,
        isActive: true,
        createdAt: true,
        company: { select: { name: true } },
        category: { select: { name: true } },
        models: { select: { modelName: true, modelNumber: true }, orderBy: { modelName: 'asc' } },
        vendors: { select: { vendor: { select: { businessName: true } } } },
      },
      orderBy: this.buildOrderBy(query),
      take: MAX_FILTER_CANDIDATES,
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

  async create(dto: CreateProductDto, actor: AuthenticatedUser, context: RequestContext) {
    const company = await this.assertBrandUsable(dto.companyId);
    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId);
    await this.assertNameFree(dto.companyId, dto.name, company.name);
    if (dto.sku) await this.assertSkuFree(dto.sku);

    const models = dto.models ?? [];
    this.assertModelNumbersDistinct(models);
    for (const model of models) await this.assertModelNumberFree(dto.companyId, model.modelNumber, company.name);

    return this.prisma.$transaction(async (tx) => {
      const productCode = await this.numberingService.allocate(SEQUENCE_KEYS.PRODUCT, tx);

      const product = await tx.product.create({
        data: {
          productCode,
          sku: cleanOptional(dto.sku) ?? null,
          name: dto.name,
          normalizedName: normalizeName(dto.name),
          companyId: dto.companyId,
          categoryId: dto.categoryId ?? null,
          description: cleanOptional(dto.description) ?? null,
          isActive: dto.isActive ?? true,
          reorderLevel: dto.reorderLevel ?? null,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: productListSelect,
      });

      for (const model of models) {
        await this.createModelInTx(tx, product.id, model, actor);
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.create',
          entityType: PRODUCT_ENTITY,
          entityId: product.id,
          summary: `Created product ${product.productCode} - ${product.name} (${company.name})${models.length ? ` with ${models.length} model(s)` : ''}`,
          after: { name: product.name, sku: product.sku, companyId: dto.companyId, categoryId: dto.categoryId ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return product;
    });
  }

  async update(id: string, dto: UpdateProductDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { company: { select: { name: true } }, models: { select: { modelNumber: true } } },
    });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This product is archived. Restore it before editing.');

    const nextCompanyId = dto.companyId ?? existing.companyId;
    let brandName = existing.company.name;
    if (dto.companyId && dto.companyId !== existing.companyId) {
      brandName = (await this.assertBrandUsable(dto.companyId)).name;
      // Moving brands would orphan vendor mappings made on the old brand.
      const mapped = await this.prisma.vendorProduct.count({ where: { productId: id } });
      if (mapped > 0) {
        throw new ConflictException(
          `This product is mapped to ${mapped} vendor(s) under ${existing.company.name}. Remove those mappings before changing the brand.`,
        );
      }
      for (const model of existing.models) await this.assertModelNumberFree(dto.companyId, model.modelNumber, brandName, id);
    }
    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId);
    if (dto.name && (normalizeName(dto.name) !== existing.normalizedName || nextCompanyId !== existing.companyId)) {
      await this.assertNameFree(nextCompanyId, dto.name, brandName, id);
    }
    if (dto.sku && dto.sku !== existing.sku) await this.assertSkuFree(dto.sku, id);

    const data: Prisma.ProductUncheckedUpdateInput = { updatedById: actor.id };
    if (dto.name) {
      data.name = dto.name;
      data.normalizedName = normalizeName(dto.name);
    }
    if (dto.companyId) data.companyId = dto.companyId;
    if (dto.sku !== undefined) data.sku = cleanOptional(dto.sku) ?? null;
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId || null;
    if (dto.description !== undefined) data.description = cleanOptional(dto.description) ?? null;
    if (dto.reorderLevel !== undefined) data.reorderLevel = dto.reorderLevel;

    const before = { name: existing.name, sku: existing.sku, companyId: existing.companyId, categoryId: existing.categoryId, description: existing.description, reorderLevel: existing.reorderLevel };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data, select: productListSelect });
      const after = { name: updated.name, sku: updated.sku, companyId: updated.company.id, categoryId: updated.category?.id ?? null, description: updated.description, reorderLevel: updated.reorderLevel };
      const changed = Object.keys(after).filter(
        (key) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(after[key as keyof typeof after]),
      );

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.update',
          entityType: PRODUCT_ENTITY,
          entityId: id,
          summary: changed.length ? `Updated ${changed.join(', ')}` : 'Saved without changes',
          before,
          after,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  async setStatus(id: string, dto: StatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This product is archived. Restore it first.');
    if (existing.isActive === dto.isActive) {
      throw new BadRequestException(`This product is already ${dto.isActive ? 'active' : 'inactive'}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { isActive: dto.isActive, updatedById: actor.id },
        select: productListSelect,
      });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: dto.isActive ? 'product.activate' : 'product.deactivate',
          entityType: PRODUCT_ENTITY,
          entityId: id,
          summary: `${dto.isActive ? 'Activated' : 'Deactivated'} product${dto.reason ? `: ${dto.reason}` : ''}`,
          before: { isActive: existing.isActive },
          after: { isActive: dto.isActive, reason: dto.reason ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Soft delete. Refused while stock remains on hand: archiving a product that
   * physically exists would hide real inventory from every report.
   */
  async archive(id: string, actor: AuthenticatedUser, context?: RequestContext) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This product is already archived.');

    // One transaction: the stock check, the state change and its audit row
    // succeed or fail together.
    return this.prisma.$transaction(async (tx) => {
      // Same row lock as StockService.postMovement, so a movement cannot land
      // between the balance check and the archive.
      await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id" = ${id}::uuid FOR UPDATE`;

      // Checked whether or not tracking is currently on: the ledger survives
      // tracking being switched off, and archived products drop out of every
      // stock report once it is switched back on.
      const ledger = await tx.stockMovement.aggregate({
        where: { productId: id },
        _sum: { quantityDelta: true },
      });
      const onHand = ledger._sum.quantityDelta ?? 0;
      if (onHand !== 0) {
        throw new ConflictException(
          `This product still has ${onHand} unit(s) in stock. Issue or adjust the stock to zero before archiving.`,
        );
      }

      const archived = await tx.product.update({
        where: { id },
        data: { archivedAt: new Date(), isActive: false, updatedById: actor.id },
        select: productListSelect,
      });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.archive',
          entityType: PRODUCT_ENTITY,
          entityId: id,
          summary: `Archived product ${archived.productCode} - ${archived.name}`,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        tx,
      );
      return archived;
    });
  }

  async restore(id: string, actor: AuthenticatedUser, context?: RequestContext) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (!existing.archivedAt) throw new BadRequestException('This product is not archived.');

    // One transaction: the state change and its audit row succeed or fail together.
    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.product.update({
        where: { id },
        data: { archivedAt: null, isActive: true, updatedById: actor.id },
        select: productListSelect,
      });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.restore',
          entityType: PRODUCT_ENTITY,
          entityId: id,
          summary: `Restored product ${restored.productCode} - ${restored.name}`,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        tx,
      );
      return restored;
    });
  }

  /**
   * Records that keep a product from being physically deleted. Later modules
   * (enquiry, quotation, PI and delivery lines) add their counts here.
   */
  async getReferenceCounts(id: string): Promise<Record<string, number>> {
    const [vendorMappings, stockMovements, documents, enquiryItems, customerInterests, quotationItems, proformaItems, invoiceItems] = await this.prisma.$transaction([
      this.prisma.vendorProduct.count({ where: { productId: id } }),
      this.prisma.stockMovement.count({ where: { productId: id } }),
      // Removed (archived) files do not block: remove() detaches them.
      this.prisma.document.count({ where: { productId: id, archivedAt: null, kind: { not: DocumentKind.PRODUCT_IMAGE } } }),
      this.prisma.enquiryItem.count({ where: { productId: id } }),
      this.prisma.customerProductInterest.count({ where: { productId: id } }),
      this.prisma.quotationItem.count({ where: { productId: id } }),
      this.prisma.proformaInvoiceItem.count({ where: { productId: id } }),
      this.prisma.finalInvoiceItem.count({ where: { productId: id } }),
    ]);
    return { vendorMappings, stockMovements, documents, enquiryItems, customerInterests, quotationItems, proformaItems, invoiceItems };
  }

  /** Permanent delete of an unreferenced product (e.g. created by mistake). Its models go with it. */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    const existing = await this.prisma.product.findUnique({ where: { id }, include: { _count: { select: { models: true } } } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);

    const references = await this.getReferenceCounts(id);
    const blocking = Object.entries(references).filter(([, count]) => count > 0);
    if (blocking.length > 0) {
      throw new ConflictException({
        message: 'This product is referenced by other records and cannot be deleted. Deactivate or archive it instead.',
        details: Object.fromEntries(blocking),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Images are archived (kept for audit) before the rows that use them go.
      const imageIds = [
        existing.imageDocumentId,
        ...(await tx.productModel.findMany({ where: { productId: id }, select: { imageDocumentId: true } })).map(
          (m) => m.imageDocumentId,
        ),
      ].filter((value): value is string => Boolean(value));
      // Detach every remaining file (current and earlier images) so the
      // document rows survive the product's deletion instead of cascading.
      await tx.document.updateMany({
        where: { OR: [{ id: { in: imageIds } }, { productId: id }] },
        data: { archivedAt: new Date(), productId: null },
      });
      await tx.product.delete({ where: { id } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.delete',
          entityType: PRODUCT_ENTITY,
          entityId: id,
          summary: `Permanently deleted product ${existing.productCode} - ${existing.name} (${existing._count.models} model(s))`,
          before: { name: existing.name, productCode: existing.productCode, companyId: existing.companyId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Vendor mappings (product side). Delegates to the single implementation in
  // VendorsService so the vendor-brand rule and audit trail are identical
  // from either screen.
  // -------------------------------------------------------------------------

  async listVendors(productId: string) {
    const product = await this.findOne(productId);
    return product.vendors;
  }

  async mapVendor(productId: string, dto: MapProductVendorDto, actor: AuthenticatedUser, context: RequestContext) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, archivedAt: true } });
    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (product.archivedAt) throw new BadRequestException('This product is archived. Restore it first.');

    const { vendorId, ...rest } = dto;
    return this.vendorsService.mapProduct(vendorId, { ...rest, productId }, actor, context);
  }

  async updateVendorMapping(
    productId: string,
    vendorId: string,
    dto: UpdateVendorProductDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    return this.vendorsService.updateProductMapping(vendorId, productId, dto, actor, context);
  }

  async unmapVendor(productId: string, vendorId: string, actor: AuthenticatedUser, context: RequestContext) {
    return this.vendorsService.unmapProduct(vendorId, productId, actor, context);
  }

  // -------------------------------------------------------------------------
  // Product image
  // -------------------------------------------------------------------------

  async setImage(productId: string, file: { buffer: Buffer; originalFilename: string }, actor: AuthenticatedUser) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productCode: true, imageDocumentId: true, archivedAt: true },
    });
    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (product.archivedAt) throw new BadRequestException('This product is archived.');

    const document = await this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalFilename, kind: DocumentKind.PRODUCT_IMAGE, productId },
      actor,
    );

    // Explicit list: TIFF passes the upload signature check but browsers
    // cannot render it as a catalogue image.
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(document.mimeType)) {
      // The upload already verified the signature; this rejects a valid PDF
      // being set as the catalogue image.
      await this.documentsService.archive(document.id, actor);
      throw new BadRequestException('The product image must be an image file (PNG, JPEG or WEBP).');
    }

    const previousImageId = product.imageDocumentId;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { imageDocumentId: document.id, updatedById: actor.id } });
      // The replaced image is archived, not deleted: the file stays auditable.
      if (previousImageId) {
        await tx.document.update({ where: { id: previousImageId }, data: { archivedAt: new Date() } });
      }
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: previousImageId ? 'product.image.replace' : 'product.image.set',
          entityType: PRODUCT_ENTITY,
          entityId: productId,
          summary: `${previousImageId ? 'Replaced' : 'Set'} product image`,
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
    if (!product.imageDocumentId) throw new BadRequestException('This product has no image.');

    const imageId = product.imageDocumentId;
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data: { imageDocumentId: null, updatedById: actor.id } });
      await tx.document.update({ where: { id: imageId }, data: { archivedAt: new Date() } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.image.remove',
          entityType: PRODUCT_ENTITY,
          entityId: productId,
          summary: 'Removed product image',
          before: { imageDocumentId: imageId },
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /** Permanently deletes a product category that no product uses (archived products count too). */
  async deleteCategory(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} was not found`);
    const products = await this.prisma.product.count({ where: { categoryId: id } });
    assertNotReferenced(`The category "${existing.name}"`, [{ label: 'product', count: products }]);
    await this.prisma.productCategory.delete({ where: { id } });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product_category.delete',
      entityType: 'ProductCategory',
      entityId: id,
      summary: `Deleted product category ${existing.name}`,
      before: { name: existing.name },
    });
    return { id, deleted: true };
  }

  async listCategories(includeInactive = false) {
    return this.prisma.productCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(dto: CreateProductCategoryDto, actor: AuthenticatedUser) {
    const normalizedName = normalizeName(dto.name);
    const existing = await this.prisma.productCategory.findUnique({ where: { normalizedName } });
    if (existing) throw new ConflictException(`The category "${existing.name}" already exists.`);

    const category = await this.prisma.productCategory.create({
      data: { name: dto.name, normalizedName, description: cleanOptional(dto.description) ?? null },
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

  async updateCategory(id: string, dto: UpdateProductCategoryDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} was not found`);

    if (dto.name && normalizeName(dto.name) !== existing.normalizedName) {
      const clash = await this.prisma.productCategory.findUnique({ where: { normalizedName: normalizeName(dto.name) } });
      if (clash) throw new ConflictException(`The category "${clash.name}" already exists.`);
    }

    // Deactivating a category in use would leave those products pointing at a
    // category the forms no longer offer.
    if (dto.isActive === false) {
      const inUse = await this.prisma.product.count({ where: { categoryId: id, archivedAt: null } });
      if (inUse > 0) throw new ConflictException(`${inUse} active product(s) use this category. Move them first.`);
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name, normalizedName: normalizeName(dto.name) } : {}),
        ...(dto.description !== undefined ? { description: cleanOptional(dto.description) ?? null } : {}),
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
  // Model helpers shared with ProductModelsService
  // -------------------------------------------------------------------------

  /** Creates a model row (code allocation + audit) inside a transaction. */
  async createModelInTx(
    tx: Prisma.TransactionClient,
    productId: string,
    dto: CreateProductModelDto,
    actor: AuthenticatedUser,
  ) {
    const modelCode = await this.numberingService.allocate(SEQUENCE_KEYS.PRODUCT_MODEL, tx);
    const model = await tx.productModel.create({
      data: {
        productId,
        modelCode,
        modelName: dto.modelName,
        modelNumber: dto.modelNumber,
        normalizedModelNumber: normalizeModelNumber(dto.modelNumber),
        description: cleanOptional(dto.description) ?? null,
        specifications: toSpecificationJson(dto.specifications),
        isActive: dto.isActive ?? true,
        createdById: actor.id,
      },
      select: modelSelect,
    });

    await this.auditService.record(
      {
        actorUserId: actor.id,
        action: 'product.model.create',
        entityType: 'ProductModel',
        entityId: model.id,
        parentEntityType: PRODUCT_ENTITY,
        parentEntityId: productId,
        summary: `Added model ${model.modelName} (${model.modelNumber}) - ${model.modelCode}`,
        after: { modelName: model.modelName, modelNumber: model.modelNumber, isActive: model.isActive },
      },
      tx,
    );
    return model;
  }

  /** A model number is unique across the whole brand, not just the product. */
  async assertModelNumberFree(companyId: string, modelNumber: string, brandName: string, excludeProductId?: string, excludeModelId?: string) {
    const clash = await this.prisma.productModel.findFirst({
      where: {
        normalizedModelNumber: normalizeModelNumber(modelNumber),
        product: { companyId, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
        ...(excludeModelId ? { id: { not: excludeModelId } } : {}),
      },
      select: { modelName: true, modelCode: true, product: { select: { name: true } } },
    });
    if (clash) {
      throw new ConflictException(
        `${brandName} already has model number ${modelNumber}: ${clash.modelName} (${clash.modelCode}) under ${clash.product.name}.`,
      );
    }
  }

  private assertModelNumbersDistinct(models: CreateProductModelDto[]) {
    const seen = new Set<string>();
    for (const model of models) {
      const key = normalizeModelNumber(model.modelNumber);
      if (seen.has(key)) throw new BadRequestException(`Model number ${model.modelNumber} is listed twice.`);
      seen.add(key);
    }
  }

  // -------------------------------------------------------------------------
  // Validation helpers
  // -------------------------------------------------------------------------

  async assertExists(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true, archivedAt: true, company: { select: { name: true } } },
    });
    if (!product) throw new NotFoundException(`Product ${id} was not found`);
    return product;
  }

  private async assertBrandUsable(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, archivedAt: null },
      select: { id: true, name: true, isActive: true },
    });
    if (!company) throw new BadRequestException('The selected brand does not exist or is archived.');
    if (!company.isActive) throw new BadRequestException(`The brand ${company.name} is inactive.`);
    return company;
  }

  private async assertNameFree(companyId: string, name: string, brandName: string, excludeId?: string) {
    const clash = await this.prisma.product.findFirst({
      where: { companyId, normalizedName: normalizeName(name), ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { productCode: true, name: true, archivedAt: true },
    });
    if (clash) {
      throw new ConflictException(
        `${brandName} already has a product named ${clash.name} (${clash.productCode})${clash.archivedAt ? ', archived' : ''}. Add a model to it instead of creating a duplicate.`,
      );
    }
  }

  private async assertSkuFree(sku: string, excludeId?: string) {
    const clash = await this.prisma.product.findFirst({
      where: { sku: { equals: sku.trim(), mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { productCode: true, name: true },
    });
    if (clash) throw new ConflictException(`SKU ${sku} is already used by ${clash.name} (${clash.productCode}).`);
  }

  private async assertCategoryUsable(categoryId: string): Promise<void> {
    const category = await this.prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category) throw new BadRequestException('The selected product category does not exist.');
    if (!category.isActive) throw new BadRequestException('The selected product category is inactive.');
  }
}
