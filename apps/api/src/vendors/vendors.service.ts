import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import {
  buildPaginatedResult,
  PaginationQueryDto,
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
import { PERMISSIONS } from '../common/authz/permissions';
import type { CreateVendorDto } from './dto/create-vendor.dto';
import type { UpdateVendorDto, UpdateVendorStatusDto } from './dto/update-vendor.dto';
import type { QueryVendorsDto } from './dto/query-vendors.dto';
import type {
  MapVendorCompanyDto,
  MapVendorProductDto,
  UpdateVendorCompanyDto,
  UpdateVendorProductDto,
} from './dto/mapping.dto';
import type { VendorLookupQueryDto } from './dto/vendor-children.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  addressData,
  contactData,
  resolveAddressPrimaries,
  resolveContactPrimaries,
  VENDOR_ENTITY,
} from './vendor-shared';

export interface DuplicateMatch {
  vendorId: string;
  vendorCode: string;
  businessName: string;
  status?: VendorStatus;
  archived?: boolean;
  matchedOn: 'gstin' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
}

export interface DuplicateCheckInput {
  businessName?: string;
  gstin?: string;
  /** Company and contact emails / phones are all compared. */
  emails?: Array<string | undefined | null>;
  phones?: Array<string | undefined | null>;
  /** Legacy single-value inputs, still accepted. */
  email?: string;
  phone?: string;
}

const brandSelect = { id: true, name: true, code: true } as const;

const productSummarySelect = {
  id: true,
  productCode: true,
  name: true,
  isActive: true,
  archivedAt: true,
  company: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  _count: { select: { models: true } },
} satisfies Prisma.ProductSelect;

/** Model-level detail of a vendor<->product mapping. */
const mappingModelsInclude = {
  orderBy: { createdAt: 'asc' },
  include: {
    productModel: {
      select: { id: true, modelCode: true, modelName: true, modelNumber: true, isActive: true },
    },
  },
} satisfies Prisma.VendorProduct$modelsArgs;

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
  // Primary contact for the "Primary Contact" column (GENERAL sorts first).
  contacts: {
    where: { isPrimary: true },
    orderBy: { contactType: 'asc' },
    take: 1,
    select: { id: true, name: true, designation: true, phone: true, email: true },
  },
  // First few brands for the badge column; the full count is in _count.
  companies: {
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { company: { select: { id: true, name: true } } },
  },
  _count: { select: { products: true, companies: true } },
} satisfies Prisma.VendorSelect;

const vendorDetailInclude = {
  category: true,
  contacts: { orderBy: [{ contactType: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }] },
  addresses: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
  companies: {
    include: { company: { select: brandSelect } },
    orderBy: { createdAt: 'asc' },
  },
  products: {
    include: { product: { select: productSummarySelect }, models: mappingModelsInclude },
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
      replacesDocumentId: true,
      uploadedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.VendorInclude;

const NULLABLE_SORT_FIELDS = new Set(['contactPerson', 'phone', 'email', 'city']);

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
   * trading name or a reception phone number. Emails and phones are compared
   * against both the company channels and every contact person.
   */
  async findDuplicates(
    input: DuplicateCheckInput,
    excludeVendorId?: string,
  ): Promise<DuplicateMatch[]> {
    const gstin = normalizeTaxId(input.gstin);
    const normalizedName = input.businessName
      ? normalizeName(input.businessName)
      : undefined;

    const emails = uniqueDefined([input.email, ...(input.emails ?? [])].map((v) => normalizeEmail(v)));
    const phones = uniqueDefined([input.phone, ...(input.phones ?? [])].map((v) => normalizePhone(v)));

    const conditions: Prisma.VendorWhereInput[] = [];
    if (gstin) conditions.push({ gstin });
    if (normalizedName) conditions.push({ normalizedName });
    if (emails.length) {
      conditions.push({ email: { in: emails } });
      conditions.push({ contacts: { some: { email: { in: emails } } } });
    }
    if (phones.length) {
      conditions.push({ phone: { in: phones } });
      conditions.push({ contacts: { some: { phone: { in: phones } } } });
    }

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
        status: true,
        archivedAt: true,
        contacts: { select: { email: true, phone: true } },
      },
      take: 10,
    });

    const matches: DuplicateMatch[] = [];

    for (const candidate of candidates) {
      const base = {
        vendorId: candidate.id,
        vendorCode: candidate.vendorCode,
        businessName: candidate.businessName,
        status: candidate.status,
        archived: Boolean(candidate.archivedAt),
      };
      const contacts = candidate.contacts ?? [];

      if (gstin && candidate.gstin === gstin) {
        matches.push({ ...base, matchedOn: 'gstin', severity: 'blocking' });
        continue;
      }
      if (normalizedName && candidate.normalizedName === normalizedName) {
        matches.push({ ...base, matchedOn: 'name', severity: 'warning' });
        continue;
      }
      const candidateEmails = [candidate.email, ...contacts.map((c) => c.email)];
      if (emails.some((email) => candidateEmails.includes(email))) {
        matches.push({ ...base, matchedOn: 'email', severity: 'warning' });
        continue;
      }
      const candidatePhones = [candidate.phone, ...contacts.map((c) => c.phone)];
      if (phones.some((phone) => candidatePhones.includes(phone))) {
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

    // Validate nested primaries before any database round trip.
    const contacts = resolveContactPrimaries((dto.contacts ?? []).map(contactData));
    const addresses = resolveAddressPrimaries((dto.addresses ?? []).map(addressData));

    const duplicates = await this.findDuplicates({
      businessName: dto.businessName,
      gstin: dto.gstin,
      emails: [dto.email, ...contacts.map((c) => c.email)],
      phones: [dto.phone, ...contacts.map((c) => c.phone)],
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

    // Product mappings bring their brand with them, exactly as mapProduct does.
    const products = dto.productIds?.length
      ? await this.loadMappableProducts(dto.productIds)
      : [];
    const companyIds = [...new Set(dto.companyIds ?? [])];
    // Products need their brand mapped too, and that must be an explicit
    // choice: refuse rather than silently adding a vendor-brand relationship.
    const missingBrands = products.filter((p) => !companyIds.includes(p.companyId));
    if (missingBrands.length > 0) {
      throw new BadRequestException(
        `Select the brand of every chosen product as well: ${[
          ...new Set(missingBrands.map((p) => p.company.name)),
        ].join(', ')}.`,
      );
    }

    const ocrJob = dto.ocrJobId
      ? await this.loadUnconsumedOcrJob(dto.ocrJobId)
      : null;

    const primaryContact =
      contacts.find((c) => c.isPrimary && c.contactType === 'GENERAL') ??
      contacts.find((c) => c.isPrimary);
    const primaryAddress = addresses.find((a) => a.isPrimary);

    // One transaction: number allocation, vendor, contacts, addresses, brand
    // and product mappings, OCR linkage and the audit row all land or none do.
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
          registrationNumber: cleanOptional(dto.registrationNumber) ?? null,
          email: normalizeEmail(dto.email) ?? null,
          alternateEmail: normalizeEmail(dto.alternateEmail) ?? null,
          phone: normalizePhone(dto.phone) ?? null,
          alternatePhone: normalizePhone(dto.alternatePhone) ?? null,
          website: cleanOptional(dto.website) ?? null,
          gstin: normalizeTaxId(dto.gstin) ?? null,
          pan: normalizeTaxId(dto.pan) ?? null,
          categoryId: dto.categoryId ?? null,
          status: dto.status ?? VendorStatus.ACTIVE,
          notes: cleanOptional(dto.notes) ?? null,
          // Mirrors of the primary child rows, written alongside them.
          contactPerson: primaryContact?.name ?? null,
          addressLine1: primaryAddress?.addressLine1 ?? null,
          addressLine2: primaryAddress?.addressLine2 ?? null,
          city: primaryAddress?.city ?? null,
          state: primaryAddress?.state ?? null,
          postalCode: primaryAddress?.postalCode ?? null,
          country: primaryAddress?.country ?? 'India',
          createdById: actor.id,
          updatedById: actor.id,
          contacts: contacts.length ? { create: contacts } : undefined,
          addresses: addresses.length ? { create: addresses } : undefined,
          companies: companyIds.length
            ? { create: companyIds.map((companyId) => ({ companyId })) }
            : undefined,
          products: products.length
            ? { create: products.map((product) => ({ productId: product.id })) }
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
          entityType: VENDOR_ENTITY,
          entityId: created.id,
          summary:
            `Created vendor ${created.vendorCode} - ${created.businessName}` +
            `${ocrJob ? ' (from reviewed OCR draft)' : ''}` +
            describeCounts({
              contact: contacts.length,
              address: addresses.length,
              brand: companyIds.length,
              product: products.length,
            }),
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
        orderBy: this.buildOrderBy(query),
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  /**
   * Dashboard figures, all counted from live rows. Archived vendors are
   * excluded everywhere: they are history, not part of the supplier base.
   */
  async summary() {
    const live = { archivedAt: null } satisfies Prisma.VendorWhereInput;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      active,
      inactive,
      archived,
      addedLast30Days,
      brandsCovered,
      productMappings,
      productMappingsLast30Days,
      productsCovered,
    ] = await this.prisma.$transaction([
      this.prisma.vendor.count({ where: live }),
      this.prisma.vendor.count({ where: { ...live, status: VendorStatus.ACTIVE } }),
      this.prisma.vendor.count({ where: { ...live, status: VendorStatus.INACTIVE } }),
      this.prisma.vendor.count({ where: { archivedAt: { not: null } } }),
      this.prisma.vendor.count({ where: { ...live, createdAt: { gte: since } } }),
      this.prisma.company.count({
        where: { archivedAt: null, vendors: { some: { vendor: live } } },
      }),
      this.prisma.vendorProduct.count({ where: { vendor: live } }),
      this.prisma.vendorProduct.count({
        where: { vendor: live, createdAt: { gte: since } },
      }),
      this.prisma.product.count({
        where: { archivedAt: null, vendors: { some: { vendor: live } } },
      }),
    ]);

    return {
      vendors: { total, active, inactive, archived, addedLast30Days },
      brandsCovered,
      productMappings: { total: productMappings, addedLast30Days: productMappingsLast30Days },
      productsCovered,
      generatedAt: new Date().toISOString(),
    };
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

  /**
   * Activity history: audit rows for the vendor itself plus every child row
   * (contacts, addresses, mappings, documents) linked to it as parent.
   */
  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertVendorExists(id);

    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: VENDOR_ENTITY, entityId: id },
        { parentEntityType: VENDOR_ENTITY, parentEntityId: id },
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
          before: true,
          after: true,
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
   * Lightweight selector for other modules (quotations, purchase flows):
   * active, non-archived vendors only, optionally narrowed to those that
   * supply a given product or brand.
   */
  async lookup(query: VendorLookupQueryDto) {
    const and: Prisma.VendorWhereInput[] = [
      { archivedAt: null, status: VendorStatus.ACTIVE },
    ];

    if (query.search) {
      and.push({
        OR: [
          { businessName: { contains: query.search, mode: 'insensitive' } },
          { vendorCode: { contains: query.search, mode: 'insensitive' } },
          { gstin: { contains: query.search.toUpperCase() } },
        ],
      });
    }
    if (query.productId) and.push({ products: { some: { productId: query.productId } } });
    if (query.companyId) and.push({ companies: { some: { companyId: query.companyId } } });

    return this.prisma.vendor.findMany({
      where: { AND: and },
      select: {
        id: true,
        vendorCode: true,
        businessName: true,
        phone: true,
        email: true,
        city: true,
        status: true,
        products: query.productId
          ? {
              where: { productId: query.productId },
              select: { vendorSku: true, leadTimeDays: true, isPreferred: true },
            }
          : undefined,
      },
      orderBy: { businessName: 'asc' },
      take: 25,
    });
  }

  /**
   * The check every future business document (quotation, PO, ...) must run
   * before referencing a vendor. Archived vendors are never selectable;
   * inactive ones only with vendor.use_inactive.
   */
  async assertSelectableForTransaction(vendorId: string, actor: AuthenticatedUser) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, vendorCode: true, businessName: true, status: true, archivedAt: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
    if (vendor.archivedAt) {
      throw new BadRequestException(`${vendor.businessName} is archived and cannot be used.`);
    }
    if (
      vendor.status === VendorStatus.INACTIVE &&
      !actor.permissions.includes(PERMISSIONS.VENDOR_USE_INACTIVE)
    ) {
      throw new BadRequestException(
        `${vendor.businessName} is inactive. Activate it, or ask a user who may use inactive vendors.`,
      );
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
        registrationNumber: true,
        contactPerson: true,
        email: true,
        alternateEmail: true,
        phone: true,
        alternatePhone: true,
        website: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        gstin: true,
        pan: true,
        status: true,
        archivedAt: true,
        createdAt: true,
        category: { select: { name: true } },
        contacts: {
          where: { isPrimary: true },
          orderBy: { contactType: 'asc' },
          take: 1,
          select: { name: true, phone: true, email: true },
        },
        companies: { select: { company: { select: { name: true } } } },
        _count: { select: { products: true } },
      },
      orderBy: this.buildOrderBy(query),
      // Export is capped; a larger extract belongs in a background job.
      take: 5000,
    });
  }

  private buildOrderBy(query: QueryVendorsDto): Prisma.VendorOrderByWithRelationInput[] {
    const dir = query.sortDir;
    // A unique tie-breaker keeps pagination stable when many rows share a value.
    const tieBreaker: Prisma.VendorOrderByWithRelationInput = { id: 'asc' };

    switch (query.sortBy) {
      case 'productCount':
        return [{ products: { _count: dir } }, { businessName: 'asc' }, tieBreaker];
      case 'brandCount':
        return [{ companies: { _count: dir } }, { businessName: 'asc' }, tieBreaker];
      default:
        if (NULLABLE_SORT_FIELDS.has(query.sortBy)) {
          return [{ [query.sortBy]: { sort: dir, nulls: 'last' } }, tieBreaker];
        }
        return [{ [query.sortBy]: dir }, tieBreaker];
    }
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
      const city = { contains: query.city, mode: 'insensitive' } as const;
      and.push({ OR: [{ city }, { addresses: { some: { city } } }] });
    }

    if (query.state) {
      const state = { contains: query.state, mode: 'insensitive' } as const;
      and.push({ OR: [{ state }, { addresses: { some: { state } } }] });
    }

    if (query.search) {
      const term = query.search;
      const text = { contains: term, mode: 'insensitive' } as const;
      // Phones are stored as digits; "98765 43210" must match "9876543210".
      const digits = term.replace(/\D/g, '');
      const phoneTerm = digits.length >= 4 ? digits : term;

      and.push({
        OR: [
          { businessName: text },
          { legalName: text },
          { normalizedName: { contains: normalizeName(term) } },
          { vendorCode: text },
          { registrationNumber: text },
          { contactPerson: text },
          { email: text },
          { alternateEmail: text },
          { phone: { contains: phoneTerm } },
          { alternatePhone: { contains: phoneTerm } },
          { city: text },
          { gstin: { contains: term.toUpperCase() } },
          {
            contacts: {
              some: {
                OR: [
                  { name: text },
                  { email: text },
                  { alternateEmail: text },
                  { phone: { contains: phoneTerm } },
                  { alternatePhone: { contains: phoneTerm } },
                ],
              },
            },
          },
          { companies: { some: { company: { name: text } } } },
          {
            products: {
              some: {
                product: {
                  OR: [
                    { name: text },
                    { productCode: text },
                    { sku: text },
                    { models: { some: { OR: [{ modelName: text }, { modelNumber: text }, { modelCode: text }] } } },
                  ],
                },
              },
            },
          },
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
                {
                  models: {
                    some: {
                      OR: [
                        { modelNumber: { contains: query.modelNumber, mode: 'insensitive' } },
                        { modelName: { contains: query.modelNumber, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  // -------------------------------------------------------------------------
  // Update / status / archive / delete
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

    await this.assertCategoryExists(dto.categoryId ?? undefined);

    const data: Prisma.VendorUpdateInput = { updatedBy: { connect: { id: actor.id } } };

    if (dto.businessName !== undefined && dto.businessName !== null) {
      data.businessName = dto.businessName.trim();
      data.normalizedName = normalizeName(dto.businessName);
    }
    if (dto.legalName !== undefined) data.legalName = cleanOptional(dto.legalName) ?? null;
    if (dto.registrationNumber !== undefined) {
      data.registrationNumber = cleanOptional(dto.registrationNumber) ?? null;
    }
    if (dto.email !== undefined) data.email = normalizeEmail(dto.email) ?? null;
    if (dto.alternateEmail !== undefined) {
      data.alternateEmail = normalizeEmail(dto.alternateEmail) ?? null;
    }
    if (dto.phone !== undefined) data.phone = normalizePhone(dto.phone) ?? null;
    if (dto.alternatePhone !== undefined) data.alternatePhone = normalizePhone(dto.alternatePhone) ?? null;
    if (dto.website !== undefined) data.website = cleanOptional(dto.website) ?? null;
    if (dto.gstin !== undefined) data.gstin = nextGstin ?? null;
    if (dto.pan !== undefined) data.pan = nextPan ?? null;
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

      const before = this.auditSnapshot(existing);
      const after = this.auditSnapshot(updated);
      const changed = Object.keys(after).filter(
        (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
      );

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.update',
          entityType: VENDOR_ENTITY,
          entityId: id,
          summary: changed.length
            ? `Updated ${changed.join(', ')}`
            : 'Saved without changes',
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

  /** Activate / deactivate. Deactivated vendors stay visible for history. */
  async updateStatus(
    id: string,
    dto: UpdateVendorStatusDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vendor ${id} was not found`);
    if (existing.archivedAt) {
      throw new BadRequestException('This vendor is archived. Restore it first.');
    }
    if (existing.status === dto.status) {
      throw new BadRequestException(
        `This vendor is already ${dto.status === VendorStatus.ACTIVE ? 'active' : 'inactive'}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data: { status: dto.status, updatedById: actor.id },
        select: { id: true, vendorCode: true, businessName: true, status: true },
      });

      const activated = dto.status === VendorStatus.ACTIVE;
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: activated ? 'vendor.activate' : 'vendor.deactivate',
          entityType: VENDOR_ENTITY,
          entityId: id,
          summary: `${activated ? 'Activated' : 'Deactivated'} vendor${dto.reason ? `: ${dto.reason}` : ''}`,
          before: { status: existing.status },
          after: { status: updated.status, reason: dto.reason ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Soft delete. Vendors are never hard-deleted while anything refers to
   * them: historical records must survive deactivation (docs/02_WORKFLOW.md 2).
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
          entityType: VENDOR_ENTITY,
          entityId: id,
          summary: `Archived vendor${reason ? `: ${reason}` : ''}`,
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
          entityType: VENDOR_ENTITY,
          entityId: id,
          summary: 'Restored vendor from archive',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return restored;
    });
  }

  /**
   * Records that keep a vendor from being physically deleted. Later modules
   * add their own count here (quotations, purchase orders, payments...), so
   * the deletion rule grows with the system instead of being bypassed by it.
   */
  async getReferenceCounts(id: string): Promise<Record<string, number>> {
    const [productMappings, documents, ocrDrafts] = await this.prisma.$transaction([
      this.prisma.vendorProduct.count({ where: { vendorId: id } }),
      this.prisma.document.count({ where: { vendorId: id } }),
      this.prisma.ocrJob.count({ where: { resultingVendorId: id } }),
    ]);
    return { productMappings, documents, ocrDrafts };
  }

  /**
   * Permanent deletion, allowed only for a vendor nothing refers to (a record
   * created by mistake). Anything with history must be deactivated or
   * archived instead. Contacts, addresses and brand mappings are part of the
   * vendor and go with it.
   */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    const existing = await this.prisma.vendor.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Vendor ${id} was not found`);

    const references = await this.getReferenceCounts(id);
    const blocking = Object.entries(references).filter(([, count]) => count > 0);
    if (blocking.length > 0) {
      throw new ConflictException({
        message:
          'This vendor is referenced by other records and cannot be deleted. ' +
          'Deactivate or archive it instead to keep its history.',
        details: Object.fromEntries(blocking),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendor.delete({ where: { id } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.delete',
          entityType: VENDOR_ENTITY,
          entityId: id,
          summary: `Permanently deleted vendor ${existing.vendorCode} - ${existing.businessName}`,
          before: this.auditSnapshot(existing),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Brand mappings
  // -------------------------------------------------------------------------

  async listCompanies(vendorId: string) {
    await this.assertVendorExists(vendorId);
    return this.prisma.vendorCompany.findMany({
      where: { vendorId },
      include: {
        company: { select: { ...brandSelect, isActive: true, archivedAt: true } },
      },
      orderBy: { company: { name: 'asc' } },
    });
  }

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

    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.vendorCompany.create({
        data: {
          vendorId,
          companyId: dto.companyId,
          isAuthorized: dto.isAuthorized ?? false,
          remarks: cleanOptional(dto.remarks) ?? null,
        },
        include: { company: { select: brandSelect } },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.company.map',
          entityType: 'VendorCompany',
          entityId: mapping.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Mapped brand ${mapping.company.name}${mapping.isAuthorized ? ' (authorised partner)' : ''}`,
          after: { vendorId, companyId: dto.companyId, isAuthorized: mapping.isAuthorized },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return mapping;
    });
  }

  async updateCompanyMapping(
    vendorId: string,
    companyId: string,
    dto: UpdateVendorCompanyDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.prisma.vendorCompany.findUnique({
      where: { vendorId_companyId: { vendorId, companyId } },
      include: { company: { select: { name: true } } },
    });
    if (!existing) throw new NotFoundException('This brand is not mapped to the vendor.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.vendorCompany.update({
        where: { id: existing.id },
        data: {
          ...(dto.isAuthorized !== undefined ? { isAuthorized: dto.isAuthorized } : {}),
          ...(dto.remarks !== undefined ? { remarks: cleanOptional(dto.remarks) ?? null } : {}),
        },
        include: { company: { select: brandSelect } },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.company.update',
          entityType: 'VendorCompany',
          entityId: existing.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Updated brand mapping ${existing.company.name}`,
          before: { isAuthorized: existing.isAuthorized, remarks: existing.remarks },
          after: { isAuthorized: updated.isAuthorized, remarks: updated.remarks },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Removes a brand mapping. Refused while products of that brand are still
   * mapped: the brand list must never contradict the product list.
   */
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

    const productsOfBrand = await this.prisma.vendorProduct.count({
      where: { vendorId, product: { companyId } },
    });
    if (productsOfBrand > 0) {
      throw new ConflictException(
        `${productsOfBrand} ${mapping.company.name} product(s) are still mapped to this vendor. ` +
          'Remove those product mappings first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendorCompany.delete({ where: { id: mapping.id } });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.company.unmap',
          entityType: 'VendorCompany',
          entityId: mapping.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Removed brand ${mapping.company.name}`,
          before: { vendorId, companyId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Product mappings
  // -------------------------------------------------------------------------

  async listProducts(vendorId: string) {
    await this.assertVendorExists(vendorId);
    return this.prisma.vendorProduct.findMany({
      where: { vendorId },
      include: { product: { select: productSummarySelect }, models: mappingModelsInclude },
      orderBy: [{ product: { company: { name: 'asc' } } }, { product: { name: 'asc' } }],
    });
  }

  /**
   * Maps a shared catalogue product (optionally specific models) to a vendor.
   * This is the single implementation used from both the vendor profile and
   * the product profile.
   *
   * Vendor-brand rule: a vendor can only supply products of brands it is
   * mapped to. When the brand is not mapped the request is refused with
   * code VENDOR_BRAND_NOT_MAPPED, unless the caller explicitly asks to map
   * the brand too (mapBrand) and holds vendor.manage_brands. Nothing is
   * created silently.
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
      select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
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

    const brandMapping = await this.prisma.vendorCompany.findUnique({
      where: { vendorId_companyId: { vendorId, companyId: product.companyId } },
      select: { id: true },
    });

    if (!brandMapping) {
      if (!dto.mapBrand) {
        throw new ConflictException({
          message:
            `This vendor is not mapped to the brand ${product.company.name}. ` +
            'Map the brand to the vendor first, or confirm mapping the brand together with this product.',
          code: 'VENDOR_BRAND_NOT_MAPPED',
          brand: { id: product.companyId, name: product.company.name },
        });
      }
      if (!actor.permissions.includes(PERMISSIONS.VENDOR_MANAGE_BRANDS)) {
        throw new ForbiddenException(
          `Mapping ${product.company.name} to this vendor requires permission to manage vendor brands.`,
        );
      }
    }

    const modelIds = await this.validateModelIds(product.id, dto.modelIds);

    return this.prisma.$transaction(async (tx) => {
      if (!brandMapping) {
        const brand = await tx.vendorCompany.create({
          data: { vendorId, companyId: product.companyId },
        });
        await this.auditService.record(
          {
            actorUserId: actor.id,
            action: 'vendor.company.map',
            entityType: 'VendorCompany',
            entityId: brand.id,
            parentEntityType: VENDOR_ENTITY,
            parentEntityId: vendorId,
            summary: `Mapped brand ${product.company.name} (confirmed while mapping ${product.name})`,
            after: { vendorId, companyId: product.companyId },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
          tx,
        );
      }

      const mapping = await tx.vendorProduct.create({
        data: {
          vendorId,
          productId: dto.productId,
          vendorSku: cleanOptional(dto.vendorSku) ?? null,
          leadTimeDays: dto.leadTimeDays ?? null,
          isPreferred: dto.isPreferred ?? false,
          remarks: cleanOptional(dto.remarks) ?? null,
          models: modelIds.length
            ? { create: modelIds.map((productModelId) => ({ productModelId })) }
            : undefined,
        },
        include: { product: { select: productSummarySelect }, models: mappingModelsInclude },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.product.map',
          entityType: 'VendorProduct',
          entityId: mapping.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary:
            `Mapped product ${product.name}` +
            (mapping.models.length
              ? ` (models: ${mapping.models.map((m) => m.productModel.modelName).join(', ')})`
              : ''),
          after: {
            vendorId,
            productId: dto.productId,
            modelIds,
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
      include: { product: { select: { name: true } }, models: { select: { productModelId: true } } },
    });

    if (!existing) throw new NotFoundException('This product is not mapped to the vendor.');

    const modelIds =
      dto.modelIds !== undefined ? await this.validateModelIds(productId, dto.modelIds) : undefined;
    const previousModelIds = existing.models.map((m) => m.productModelId);

    return this.prisma.$transaction(async (tx) => {
      if (modelIds !== undefined) {
        // Replace the model set: drop the ones no longer selected, add new ones.
        await tx.vendorProductModel.deleteMany({
          where: { vendorProductId: existing.id, productModelId: { notIn: modelIds } },
        });
        const toAdd = modelIds.filter((id) => !previousModelIds.includes(id));
        if (toAdd.length) {
          await tx.vendorProductModel.createMany({
            data: toAdd.map((productModelId) => ({ vendorProductId: existing.id, productModelId })),
          });
        }
      }

      const updated = await tx.vendorProduct.update({
        where: { id: existing.id },
        data: {
          ...(dto.vendorSku !== undefined
            ? { vendorSku: cleanOptional(dto.vendorSku) ?? null }
            : {}),
          ...(dto.leadTimeDays !== undefined ? { leadTimeDays: dto.leadTimeDays } : {}),
          ...(dto.isPreferred !== undefined ? { isPreferred: dto.isPreferred } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.remarks !== undefined
            ? { remarks: cleanOptional(dto.remarks) ?? null }
            : {}),
        },
        include: { product: { select: productSummarySelect }, models: mappingModelsInclude },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.product.update',
          entityType: 'VendorProduct',
          entityId: existing.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Updated product mapping ${existing.product.name}`,
          before: {
            productId,
            modelIds: previousModelIds,
            vendorSku: existing.vendorSku,
            leadTimeDays: existing.leadTimeDays,
            isPreferred: existing.isPreferred,
            status: existing.status,
            remarks: existing.remarks,
          },
          after: {
            productId,
            modelIds: updated.models.map((m) => m.productModelId),
            vendorSku: updated.vendorSku,
            leadTimeDays: updated.leadTimeDays,
            isPreferred: updated.isPreferred,
            status: updated.status,
            remarks: updated.remarks,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return updated;
    });
  }

  /** Models must belong to the product; duplicates are collapsed. */
  private async validateModelIds(productId: string, modelIds?: string[]): Promise<string[]> {
    const unique = [...new Set(modelIds ?? [])];
    if (unique.length === 0) return [];
    const found = await this.prisma.productModel.count({
      where: { id: { in: unique }, productId },
    });
    if (found !== unique.length) {
      throw new BadRequestException('One or more selected models do not belong to this product.');
    }
    return unique;
  }

  async unmapProduct(
    vendorId: string,
    productId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const mapping = await this.prisma.vendorProduct.findUnique({
      where: { vendorId_productId: { vendorId, productId } },
      include: { product: { select: { name: true } } },
    });

    if (!mapping) throw new NotFoundException('This product is not mapped to the vendor.');

    await this.prisma.$transaction(async (tx) => {
      await tx.vendorProduct.delete({ where: { id: mapping.id } });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.product.unmap',
          entityType: 'VendorProduct',
          entityId: mapping.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Removed product ${mapping.product.name}`,
          before: { vendorId, productId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Characters 3-12 of a GSTIN are the holder's PAN. If both are supplied and
   * disagree, one of them is a typo.
   */
  private assertGstinMatchesPan(gstin?: string | null, pan?: string | null): void {
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

  async assertVendorExists(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
  }

  /** Not archived. Inactive vendors may still have master data maintained. */
  async assertVendorActive(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, archivedAt: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
    if (vendor.archivedAt) {
      throw new BadRequestException('This vendor is archived. Restore it first.');
    }
  }

  private async assertCategoryExists(categoryId?: string | null): Promise<void> {
    if (!categoryId) return;
    const category = await this.prisma.vendorCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });
    if (!category) throw new BadRequestException('The selected vendor type does not exist.');
    if (!category.isActive) throw new BadRequestException('The selected vendor type is inactive.');
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

  private async loadMappableProducts(productIds: string[]) {
    const unique = [...new Set(productIds)];
    const products = await this.prisma.product.findMany({
      where: { id: { in: unique }, archivedAt: null },
      select: { id: true, companyId: true, company: { select: { name: true } } },
    });
    if (products.length !== unique.length) {
      throw new BadRequestException('One or more selected products do not exist or are archived.');
    }
    return products;
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
      'vendorCode', 'businessName', 'legalName', 'registrationNumber',
      'email', 'alternateEmail', 'phone', 'alternatePhone', 'website',
      'gstin', 'pan', 'categoryId', 'status', 'notes', 'archivedAt',
    ];

    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in vendor) snapshot[key] = vendor[key];
    }
    return snapshot;
  }
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function describeCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);
  return parts.length ? ` with ${parts.join(', ')}` : '';
}
