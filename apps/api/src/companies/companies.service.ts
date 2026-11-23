import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertNotReferenced } from '../common/utils/master-delete';
import { AuditService } from '../audit/audit.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import { cleanOptional, normalizeName, normalizedNameFilter } from '../common/utils/normalize';
import type {
  CreateCompanyDto,
  QueryCompaniesDto,
  UpdateCompanyDto,
} from './dto/company.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryCompaniesDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.CompanyWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search.toUpperCase() } },
              { normalizedName: normalizedNameFilter(query.search) },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: query.skip,
        take: query.take,
        include: { _count: { select: { products: true, vendors: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { products: true, vendors: true } } },
    });
    if (!company) throw new NotFoundException(`Brand ${id} was not found`);
    return company;
  }

  async create(dto: CreateCompanyDto, actor: AuthenticatedUser) {
    const normalizedName = normalizeName(dto.name);

    const existing = await this.prisma.company.findUnique({
      where: { normalizedName },
    });
    if (existing) {
      throw new ConflictException(
        `The brand "${existing.name}" already exists.`,
      );
    }

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        normalizedName,
        code: cleanOptional(dto.code) ?? null,
        website: cleanOptional(dto.website) ?? null,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'company.create',
      entityType: 'Company',
      entityId: company.id,
      summary: `Created brand ${company.name}`,
      after: { name: company.name, code: company.code },
    });

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Brand ${id} was not found`);

    if (dto.name && normalizeName(dto.name) !== existing.normalizedName) {
      const clash = await this.prisma.company.findUnique({
        where: { normalizedName: normalizeName(dto.name) },
      });
      if (clash) {
        throw new ConflictException(`The brand "${clash.name}" already exists.`);
      }
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name: dto.name, normalizedName: normalizeName(dto.name) }
          : {}),
        ...(dto.code !== undefined ? { code: cleanOptional(dto.code) ?? null } : {}),
        ...(dto.website !== undefined
          ? { website: cleanOptional(dto.website) ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'company.update',
      entityType: 'Company',
      entityId: id,
      summary: `Updated brand ${updated.name}`,
      before: { name: existing.name, code: existing.code, isActive: existing.isActive },
      after: { name: updated.name, code: updated.code, isActive: updated.isActive },
    });

    return updated;
  }

  /**
   * Archiving a brand is refused while active products still reference it -
   * otherwise the catalogue would show products under an archived brand.
   */
  /** Permanently deletes a brand that no product or vendor mapping uses. */
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Brand ${id} was not found`);
    const [products, vendorLinks] = await Promise.all([
      this.prisma.product.count({ where: { companyId: id } }),
      this.prisma.vendorCompany.count({ where: { companyId: id } }),
    ]);
    assertNotReferenced(`The brand "${existing.name}"`, [
      { label: 'product', count: products },
      { label: 'vendor mapping', count: vendorLinks },
    ]);
    await this.prisma.company.delete({ where: { id } });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'company.delete',
      entityType: 'Company',
      entityId: id,
      summary: `Deleted brand ${existing.name}`,
      before: { name: existing.name },
    });
    return { id, deleted: true };
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw new NotFoundException(`Brand ${id} was not found`);
    if (existing.archivedAt) throw new BadRequestException('This brand is already archived.');

    const activeProducts = await this.prisma.product.count({
      where: { companyId: id, archivedAt: null },
    });

    if (activeProducts > 0) {
      throw new ConflictException(
        `This brand has ${activeProducts} active product(s). Archive them first.`,
      );
    }

    const archived = await this.prisma.company.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'company.archive',
      entityType: 'Company',
      entityId: id,
      summary: `Archived brand ${archived.name}`,
    });

    return archived;
  }
}
