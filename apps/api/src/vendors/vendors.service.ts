import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination.dto';
import {
  cleanOptional,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeTaxId,
} from '../common/utils/normalize';
import { panFromGstin } from '../common/utils/tax-id';
import type { CreateVendorDto } from './dto/create-vendor.dto';
import type { UpdateVendorDto } from './dto/update-vendor.dto';
import type { QueryVendorsDto } from './dto/query-vendors.dto';
import type {
  MapVendorCompanyDto,
  MapVendorProductDto,
  UpdateVendorProductDto,
} from './dto/mapping.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';

export interface DuplicateMatch {
  vendorId: string;
  vendorCode: string;
  businessName: string;
  matchedOn: 'gstin' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
}

/** Vendor fields returned on list rows. Keeps payloads small and predictable. */
const vendorListSelect = {
  id: true,
  vendorCode: true,
  businessName: true,
  legalName: true,
  contactPerson: true,
  email: true,
  phone: true,
  city: true,
  state: true,
  gstin: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  _count: { select: { products: true, companies: true } },
} satisfies Prisma.VendorSelect;

const vendorDetailInclude = {
  category: true,
  contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
  companies: {
    include: { company: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: 'asc' },
  },
  products: {
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          modelNumber: true,
          designNumber: true,
          company: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
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
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.VendorInclude;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
  ) {}

  // -------------------------------------------------------------------------
  // Duplicate detection
  // -------------------------------------------------------------------------

  /**
   * Finds vendors that may already represent this business.
   *
   * GSTIN is a hard identifier: a match is 'blocking'. Name, email and phone
   * matches are 'warning' - the user is shown the existing record and may
   * proceed deliberately, because two genuinely different firms can share a
   * trading name or a reception phone number.
   */
  async findDuplicates(
    input: { businessName?: string; gstin?: string; email?: string; phone?: string },
    excludeVendorId?: string,
  ): Promise<DuplicateMatch[]> {
    const gstin = normalizeTaxId(input.gstin);
    const normalizedName = input.businessName
      ? normalizeName(input.businessName)
      : undefined;
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);

    const conditions: Prisma.VendorWhereInput[] = [];
    if (gstin) conditions.push({ gstin });
    if (normalizedName) conditions.push({ normalizedName });
    if (email) conditions.push({ email });
    if (phone) conditions.push({ phone });

    if (conditions.length === 0) return [];

    const candidates = await this.prisma.vendor.findMany({
      where: {
        OR: conditions,
        ...(excludeVendorId ? { id: { not: excludeVendorId } } : {}),
      },
      select: {
        id: true,
        vendorCode: true,
        businessName: true,
        normalizedName: true,
        gstin: true,
        email: true,
        phone: true,
      },
      take: 10,
    });

    const matches: DuplicateMatch[] = [];

    for (const candidate of candidates) {
      const base = {
        vendorId: candidate.id,
        vendorCode: candidate.vendorCode,
        businessName: candidate.businessName,
      };

      if (gstin && candidate.gstin === gstin) {
        matches.push({ ...base, matchedOn: 'gstin', severity: 'blocking' });
        continue;
      }
      if (normalizedName && candidate.normalizedName === normalizedName) {
        matches.push({ ...base, matchedOn: 'name', severity: 'warning' });
        continue;
      }
      if (email && candidate.email === email) {
        matches.push({ ...base, matchedOn: 'email', severity: 'warning' });
        continue;
      }
      if (phone && candidate.phone === phone) {
        matches.push({ ...base, matchedOn: 'phone', severity: 'warning' });
      }
    }

    return matches;
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(
    dto: CreateVendorDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    this.assertGstinMatchesPan(dto.gstin, dto.pan);

    const duplicates = await this.findDuplicates({
      businessName: dto.businessName,
      gstin: dto.gstin,
      email: dto.email,
      phone: dto.phone,
    });

    const blocking = duplicates.filter((d) => d.severity === 'blocking');
    if (blocking.length > 0) {
      throw new ConflictException({
        message: `A vendor with this GSTIN already exists: ${blocking[0].businessName} (${blocking[0].vendorCode}).`,
        duplicates: blocking,
      });
    }

    const warnings = duplicates.filter((d) => d.severity === 'warning');
    if (warnings.length > 0 && !dto.confirmPossibleDuplicate) {
      throw new ConflictException({
        message:
          'A similar vendor already exists. Review the matches and resubmit ' +
          'with confirmPossibleDuplicate=true to create this vendor anyway.',
        duplicates: warnings,
        requiresConfirmation: true,
      });
    }

    await this.assertCategoryExists(dto.categoryId);
    if (dto.companyIds?.length) {
      await this.assertCompaniesExist(dto.companyIds);
    }

    const ocrJob = dto.ocrJobId
      ? await this.loadUnconsumedOcrJob(dto.ocrJobId)
      : null;

    // One transaction: number allocation, vendor, contacts, brand mappings,
    // OCR linkage and the audit row either all land or none do.
    const vendor = await this.prisma.$transaction(async (tx) => {
      const vendorCode = await this.numberingService.allocate(
        SEQUENCE_KEYS.VENDOR,
        tx,
      );

      const created = await tx.vendor.create({
        data: {
          vendorCode,
          businessName: dto.businessName.trim(),
          legalName: cleanOptional(dto.legalName) ?? null,
          normalizedName: normalizeName(dto.businessName),
          contactPerson: cleanOptional(dto.contactPerson) ?? null,
          email: normalizeEmail(dto.email) ?? null,
          phone: normalizePhone(dto.phone) ?? null,
          alternatePhone: normalizePhone(dto.alternatePhone) ?? null,
          website: cleanOptional(dto.website) ?? null,
          addressLine1: cleanOptional(dto.addressLine1) ?? null,
          addressLine2: cleanOptional(dto.addressLine2) ?? null,
          city: cleanOptional(dto.city) ?? null,
          state: cleanOptional(dto.state) ?? null,
          postalCode: cleanOptional(dto.postalCode) ?? null,
          country: cleanOptional(dto.country) ?? 'India',
          gstin: normalizeTaxId(dto.gstin) ?? null,
          pan: normalizeTaxId(dto.pan) ?? null,
          categoryId: dto.categoryId ?? null,
          status: dto.status ?? VendorStatus.ACTIVE,
          notes: cleanOptional(dto.notes) ?? null,
          createdById: actor.id,
          updatedById: actor.id,
          contacts: dto.contacts?.length
            ? {
                create: dto.contacts.map((contact) => ({
                  name: contact.name.trim(),
                  designation: cleanOptional(contact.designation) ?? null,
                  email: normalizeEmail(contact.email) ?? null,
                  phone: normalizePhone(contact.phone) ?? null,
                  isPrimary: contact.isPrimary ?? false,
                  notes: cleanOptional(contact.notes) ?? null,
                })),
              }
            : undefined,
          companies: dto.companyIds?.length
            ? { create: dto.companyIds.map((companyId) => ({ companyId })) }
            : undefined,
        },
        include: vendorDetailInclude,
      });

      if (ocrJob) {
        // Guarded update: only consume the draft if it is still unconsumed, so
        // two concurrent confirmations cannot both create a vendor from it.
        const consumed = await tx.ocrJob.updateMany({
          where: { id: ocrJob.id, consumedAt: null },
          data: { consumedAt: new Date(), resultingVendorId: created.id },
        });

        if (consumed.count === 0) {
          throw new ConflictException(
            'This OCR draft has already been used to create a vendor.',
          );
        }

        // Attach the source document to the new vendor so the original stays
        // retrievable from the vendor record.
        await tx.document.update({
          where: { id: ocrJob.documentId },
          data: { vendorId: created.id },
        });

        // `created` was read before the document was attached, so re-read it;
        // otherwise the response reports no documents on a vendor that has one.
        const withDocument = await tx.vendor.findUniqueOrThrow({
          where: { id: created.id },
          include: vendorDetailInclude,
        });
        Object.assign(created, withDocument);
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.create',
          entityType: 'Vendor',
          entityId: created.id,
          summary: `Created vendor ${created.vendorCode} - ${created.businessName}${ocrJob ? ' (from OCR draft)' : ''}`,
          after: this.auditSnapshot(created),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return created;
    });

    return vendor;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findAll(query: QueryVendorsDto): Promise<PaginatedResult<unknown>> {
    const where = this.buildWhere(query);

    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.vendor.findMany({
        where,
        select: vendorListSelect,
        orderBy: { [query.sortBy]: query.sortDir },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: vendorDetailInclude,
    });

    if (!vendor) {
      throw new NotFoundException(`Vendor ${id} was not found`);
    }

    return vendor;
  }

  /** Flat rows for CSV/Excel export. Honours the same filters as the list. */
  async findAllForExport(query: QueryVendorsDto) {
    return this.prisma.vendor.findMany({
      where: this.buildWhere(query),
      select: {
        vendorCode: true,
        businessName: true,
        legalName: true,
        contactPerson: true,
        email: true,
        phone: true,
        alternatePhone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        gstin: true,
        pan: true,
        status: true,
        createdAt: true,
        category: { select: { name: true } },
        companies: { select: { company: { select: { name: true } } } },
        _count: { select: { products: true } },
      },
      orderBy: { [query.sortBy]: query.sortDir },
      // Export is capped; a larger extract belongs in a background job.
      take: 5000,
    });
  }

  private buildWhere(query: QueryVendorsDto): Prisma.VendorWhereInput {
    const and: Prisma.VendorWhereInput[] = [];

    if (!query.includeArchived) {
      and.push({ archivedAt: null });
    }

    if (query.status) and.push({ status: query.status });

    if (query.categoryIds?.length) {
      and.push({ categoryId: { in: query.categoryIds } });
    }

    if (query.city) {
      and.push({ city: { contains: query.city, mode: 'insensitive' } });
    }

    if (query.state) {
      and.push({ state: { contains: query.state, mode: 'insensitive' } });
    }

    if (query.search) {
      const term = query.search;
      and.push({
        OR: [
          { businessName: { contains: term, mode: 'insensitive' } },
          { legalName: { contains: term, mode: 'insensitive' } },
          { normalizedName: { contains: normalizeName(term) } },
          { vendorCode: { contains: term, mode: 'insensitive' } },
          { contactPerson: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          { city: { contains: term, mode: 'insensitive' } },
          { gstin: { contains: term.toUpperCase() } },
        ],
      });
    }

    // Brand filter: match either a direct vendor-brand mapping or a brand
    // reached through one of the vendor's mapped products. A vendor listed
    // against a Dell laptop is a Dell vendor even if nobody ticked the brand.
    if (query.companyId) {
      and.push({
        OR: [
          { companies: { some: { companyId: query.companyId } } },
          { products: { some: { product: { companyId: query.companyId } } } },
        ],
      });
    }

    if (query.companyName) {
      const nameFilter = { contains: query.companyName, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { companies: { some: { company: { name: nameFilter } } } },
          { products: { some: { product: { company: { name: nameFilter } } } } },
        ],
      });
    }

    if (query.productId) {
      and.push({ products: { some: { productId: query.productId } } });
    }

    if (query.productName) {
      and.push({
        products: {
          some: {
            product: {
              name: { contains: query.productName, mode: 'insensitive' },
            },
          },
        },
      });
    }

    if (query.modelNumber) {
      and.push({
        products: {
          some: {
            product: {
              OR: [
                { modelNumber: { contains: query.modelNumber, mode: 'insensitive' } },
                { designNumber: { contains: query.modelNumber, mode: 'insensitive' } },
              ],
            },
          },
        },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  // -------------------------------------------------------------------------
  // Update / archive
  // -------------------------------------------------------------------------

  async update(
    id: string,
    dto: UpdateVendorDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vendor ${id} was not found`);
    if (existing.archivedAt) {
      throw new BadRequestException(
        'This vendor is archived. Restore it before editing.',
      );
    }

    const nextGstin =
      dto.gstin !== undefined ? normalizeTaxId(dto.gstin) : existing.gstin;
    const nextPan = dto.pan !== undefined ? normalizeTaxId(dto.pan) : existing.pan;
    this.assertGstinMatchesPan(nextGstin ?? undefined, nextPan ?? undefined);

    if (nextGstin && nextGstin !== existing.gstin) {
      const clash = await this.prisma.vendor.findFirst({
        where: { gstin: nextGstin, id: { not: id } },
        select: { vendorCode: true, businessName: true },
      });
      if (clash) {
        throw new ConflictException(
          `GSTIN already belongs to ${clash.businessName} (${clash.vendorCode}).`,
        );
      }
    }

    await this.assertCategoryExists(dto.categoryId);

    const data: Prisma.VendorUpdateInput = { updatedBy: { connect: { id: actor.id } } };

    if (dto.businessName !== undefined) {
      data.businessName = dto.businessName.trim();
      data.normalizedName = normalizeName(dto.businessName);
    }
    if (dto.legalName !== undefined) data.legalName = cleanOptional(dto.legalName) ?? null;
    if (dto.contactPerson !== undefined) data.contactPerson = cleanOptional(dto.contactPerson) ?? null;
    if (dto.email !== undefined) data.email = normalizeEmail(dto.email) ?? null;
    if (dto.phone !== undefined) data.phone = normalizePhone(dto.phone) ?? null;
    if (dto.alternatePhone !== undefined) data.alternatePhone = normalizePhone(dto.alternatePhone) ?? null;
    if (dto.website !== undefined) data.website = cleanOptional(dto.website) ?? null;
    if (dto.addressLine1 !== undefined) data.addressLine1 = cleanOptional(dto.addressLine1) ?? null;
    if (dto.addressLine2 !== undefined) data.addressLine2 = cleanOptional(dto.addressLine2) ?? null;
    if (dto.city !== undefined) data.city = cleanOptional(dto.city) ?? null;
    if (dto.state !== undefined) data.state = cleanOptional(dto.state) ?? null;
    if (dto.postalCode !== undefined) data.postalCode = cleanOptional(dto.postalCode) ?? null;
    if (dto.country !== undefined) data.country = cleanOptional(dto.country) ?? 'India';
    if (dto.gstin !== undefined) data.gstin = nextGstin ?? null;
    if (dto.pan !== undefined) data.pan = nextPan ?? null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = cleanOptional(dto.notes) ?? null;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data,
        include: vendorDetailInclude,
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.update',
          entityType: 'Vendor',
          entityId: id,
          summary: `Updated vendor ${updated.vendorCode}`,
          before: this.auditSnapshot(existing),
          after: this.auditSnapshot(updated),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Soft delete. Vendors are never hard-deleted: historical purchases and
   * documents must survive deactivation (docs/02_WORKFLOW.md 2).
   */
  async archive(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
    reason?: string,
  ) {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vendor ${id} was not found`);
    if (existing.archivedAt) {
      throw new BadRequestException('This vendor is already archived.');
    }

    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.vendor.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          status: VendorStatus.INACTIVE,
          updatedById: actor.id,
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.archive',
          entityType: 'Vendor',
          entityId: id,
          summary: `Archived vendor ${archived.vendorCode}${reason ? `: ${reason}` : ''}`,
          before: this.auditSnapshot(existing),
          after: this.auditSnapshot(archived),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return archived;
    });
  }

  async restore(id: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vendor ${id} was not found`);
    if (!existing.archivedAt) {
      throw new BadRequestException('This vendor is not archived.');
    }

    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.vendor.update({
        where: { id },
        data: {
          archivedAt: null,
          status: VendorStatus.ACTIVE,
          updatedById: actor.id,
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.restore',
          entityType: 'Vendor',
          entityId: id,
          summary: `Restored vendor ${restored.vendorCode}`,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return restored;
    });
  }

  // -------------------------------------------------------------------------
  // Brand and product mappings
  // -------------------------------------------------------------------------

  async mapCompany(
    vendorId: string,
    dto: MapVendorCompanyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorActive(vendorId);
    await this.assertCompaniesExist([dto.companyId]);

    const existing = await this.prisma.vendorCompany.findUnique({
      where: { vendorId_companyId: { vendorId, companyId: dto.companyId } },
    });

    if (existing) {
      throw new ConflictException('This brand is already mapped to the vendor.');
    }

    const mapping = await this.prisma.vendorCompany.create({
      data: {
        vendorId,
        companyId: dto.companyId,
        isAuthorized: dto.isAuthorized ?? false,
        remarks: cleanOptional(dto.remarks) ?? null,
      },
      include: { company: { select: { id: true, name: true } } },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor.company.map',
      entityType: 'VendorCompany',
      entityId: mapping.id,
      summary: `Mapped brand ${mapping.company.name} to vendor ${vendorId}`,
      after: { vendorId, companyId: dto.companyId, isAuthorized: mapping.isAuthorized },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return mapping;
  }

  async unmapCompany(
    vendorId: string,
    companyId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const mapping = await this.prisma.vendorCompany.findUnique({
      where: { vendorId_companyId: { vendorId, companyId } },
      include: { company: { select: { name: true } } },
    });

    if (!mapping) throw new NotFoundException('This brand is not mapped to the vendor.');

    await this.prisma.vendorCompany.delete({ where: { id: mapping.id } });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor.company.unmap',
      entityType: 'VendorCompany',
      entityId: mapping.id,
      summary: `Removed brand ${mapping.company.name} from vendor ${vendorId}`,
      before: { vendorId, companyId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Maps a product to a vendor.
   *
   * The product's brand is auto-mapped in the same transaction: a vendor that
   * supplies a Dell laptop necessarily supplies Dell, and letting the two
   * drift apart would make brand search unreliable.
   */
  async mapProduct(
    vendorId: string,
    dto: MapVendorProductDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorActive(vendorId);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, archivedAt: null },
      select: { id: true, name: true, companyId: true, modelNumber: true },
    });

    if (!product) {
      throw new BadRequestException('The selected product does not exist or is archived.');
    }

    const existing = await this.prisma.vendorProduct.findUnique({
      where: { vendorId_productId: { vendorId, productId: dto.productId } },
    });

    if (existing) {
      throw new ConflictException('This product is already mapped to the vendor.');
    }

    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.vendorProduct.create({
        data: {
          vendorId,
          productId: dto.productId,
          vendorSku: cleanOptional(dto.vendorSku) ?? null,
          leadTimeDays: dto.leadTimeDays ?? null,
          isPreferred: dto.isPreferred ?? false,
          remarks: cleanOptional(dto.remarks) ?? null,
        },
        include: {
          product: {
            select: {
              id: true,
              productCode: true,
              name: true,
              modelNumber: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Idempotent: does nothing when the brand mapping already exists.
      await tx.vendorCompany.upsert({
        where: {
          vendorId_companyId: { vendorId, companyId: product.companyId },
        },
        create: { vendorId, companyId: product.companyId },
        update: {},
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.product.map',
          entityType: 'VendorProduct',
          entityId: mapping.id,
          summary: `Mapped product ${product.name} (${product.modelNumber}) to vendor ${vendorId}`,
          after: {
            vendorId,
            productId: dto.productId,
            vendorSku: mapping.vendorSku,
            isPreferred: mapping.isPreferred,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return mapping;
    });
  }

  async updateProductMapping(
    vendorId: string,
    productId: string,
    dto: UpdateVendorProductDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.prisma.vendorProduct.findUnique({
      where: { vendorId_productId: { vendorId, productId } },
    });

    if (!existing) throw new NotFoundException('This product is not mapped to the vendor.');

    const updated = await this.prisma.vendorProduct.update({
      where: { id: existing.id },
      data: {
        ...(dto.vendorSku !== undefined
          ? { vendorSku: cleanOptional(dto.vendorSku) ?? null }
          : {}),
        ...(dto.leadTimeDays !== undefined ? { leadTimeDays: dto.leadTimeDays } : {}),
        ...(dto.isPreferred !== undefined ? { isPreferred: dto.isPreferred } : {}),
        ...(dto.remarks !== undefined
          ? { remarks: cleanOptional(dto.remarks) ?? null }
          : {}),
      },
      include: {
        product: {
          select: { id: true, name: true, modelNumber: true, productCode: true },
        },
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor.product.update',
      entityType: 'VendorProduct',
      entityId: existing.id,
      summary: `Updated product mapping for vendor ${vendorId}`,
      before: { vendorSku: existing.vendorSku, leadTimeDays: existing.leadTimeDays, isPreferred: existing.isPreferred },
      after: { vendorSku: updated.vendorSku, leadTimeDays: updated.leadTimeDays, isPreferred: updated.isPreferred },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return updated;
  }

  async unmapProduct(
    vendorId: string,
    productId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const mapping = await this.prisma.vendorProduct.findUnique({
      where: { vendorId_productId: { vendorId, productId } },
      include: { product: { select: { name: true, modelNumber: true } } },
    });

    if (!mapping) throw new NotFoundException('This product is not mapped to the vendor.');

    await this.prisma.vendorProduct.delete({ where: { id: mapping.id } });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor.product.unmap',
      entityType: 'VendorProduct',
      entityId: mapping.id,
      summary: `Removed product ${mapping.product.name} (${mapping.product.modelNumber}) from vendor ${vendorId}`,
      before: { vendorId, productId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Characters 3-12 of a GSTIN are the holder's PAN. If both are supplied and
   * disagree, one of them is a typo.
   */
  private assertGstinMatchesPan(gstin?: string, pan?: string): void {
    const normalizedGstin = normalizeTaxId(gstin);
    const normalizedPan = normalizeTaxId(pan);
    if (!normalizedGstin || !normalizedPan) return;

    const embedded = panFromGstin(normalizedGstin);
    if (embedded && embedded !== normalizedPan) {
      throw new BadRequestException(
        `PAN does not match the GSTIN. The GSTIN contains PAN ${embedded}.`,
      );
    }
  }

  private async assertVendorActive(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, archivedAt: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
    if (vendor.archivedAt) {
      throw new BadRequestException('This vendor is archived. Restore it first.');
    }
  }

  private async assertCategoryExists(categoryId?: string): Promise<void> {
    if (!categoryId) return;
    const category = await this.prisma.vendorCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category) throw new BadRequestException('The selected vendor category does not exist.');
    if (!category.isActive) throw new BadRequestException('The selected vendor category is inactive.');
  }

  private async assertCompaniesExist(companyIds: string[]): Promise<void> {
    const unique = [...new Set(companyIds)];
    const found = await this.prisma.company.count({
      where: { id: { in: unique }, archivedAt: null },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more selected brands do not exist or are archived.');
    }
  }

  private async loadUnconsumedOcrJob(ocrJobId: string) {
    const job = await this.prisma.ocrJob.findUnique({
      where: { id: ocrJobId },
      select: { id: true, status: true, consumedAt: true, documentId: true, targetType: true },
    });

    if (!job) throw new BadRequestException('The referenced OCR draft was not found.');
    if (job.targetType !== 'VENDOR') {
      throw new BadRequestException('The referenced OCR draft is not a vendor draft.');
    }
    if (job.status !== 'COMPLETED') {
      throw new BadRequestException('The referenced OCR draft has not completed extraction.');
    }
    if (job.consumedAt) {
      throw new ConflictException('This OCR draft has already been used to create a vendor.');
    }

    return job;
  }

  /** Audit payload: business fields only, no relations or internal counters. */
  private auditSnapshot(vendor: Record<string, unknown>): Record<string, unknown> {
    const keys = [
      'vendorCode', 'businessName', 'legalName', 'contactPerson', 'email',
      'phone', 'alternatePhone', 'website', 'addressLine1', 'addressLine2',
      'city', 'state', 'postalCode', 'country', 'gstin', 'pan', 'categoryId',
      'status', 'notes', 'archivedAt',
    ];

    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in vendor) snapshot[key] = vendor[key];
    }
    return snapshot;
  }
}
