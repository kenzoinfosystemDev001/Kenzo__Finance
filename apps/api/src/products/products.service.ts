import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName } from '../common/utils/normalize';
import type {
  CreateProductCategoryDto,
  CreateProductDto,
  QueryProductsDto,
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
  isActive: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { vendors: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
  ) {}

  async findAll(query: QueryProductsDto): Promise<PaginatedResult<unknown>> {
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
        ],
      });
    }

    const where: Prisma.ProductWhereInput = and.length > 0 ? { AND: and } : {};

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: productSelect,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        category: { select: { id: true, name: true } },
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
              },
            },
          },
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!product) throw new NotFoundException(`Product ${id} was not found`);
    return product;
  }

  async create(dto: CreateProductDto, actor: AuthenticatedUser) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, archivedAt: null },
      select: { id: true, name: true, code: true },
    });
    if (!company) {
      throw new BadRequestException('The selected brand does not exist or is archived.');
    }

    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException('The selected product category does not exist.');
      }
    }

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
          specifications: (dto.specifications ?? undefined) as Prisma.InputJsonValue,
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
          after: { name: product.name, modelNumber: product.modelNumber, companyId: dto.companyId },
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

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name: dto.name, normalizedName: normalizeName(dto.name) }
          : {}),
        ...(dto.modelNumber !== undefined ? { modelNumber: dto.modelNumber } : {}),
        ...(dto.designNumber !== undefined
          ? { designNumber: cleanOptional(dto.designNumber) ?? null }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
        ...(dto.description !== undefined
          ? { description: cleanOptional(dto.description) ?? null }
          : {}),
        ...(dto.specifications !== undefined
          ? { specifications: dto.specifications as Prisma.InputJsonValue }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: productSelect,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      summary: `Updated product ${updated.productCode}`,
      before: { name: existing.name, modelNumber: existing.modelNumber, isActive: existing.isActive },
      after: { name: updated.name, modelNumber: updated.modelNumber, isActive: updated.isActive },
    });

    return updated;
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Product ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This product is already archived.');

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

  // --- Product categories ---------------------------------------------------

  async listCategories() {
    return this.prisma.productCategory.findMany({
      where: { isActive: true },
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
}
