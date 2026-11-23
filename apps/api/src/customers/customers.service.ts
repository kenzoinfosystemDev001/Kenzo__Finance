import { businessDayEnd, businessDayStart } from '../common/utils/business-date';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerStatus, CustomerType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertNotReferenced } from '../common/utils/master-delete';
import { AuditService } from '../audit/audit.service';
import { NumberingService, SEQUENCE_KEYS } from '../numbering/numbering.service';
import { buildPaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { cleanOptional, normalizeEmail, normalizeName, normalizedNameFilter, normalizePhone, normalizeTaxId } from '../common/utils/normalize';
import { panFromGstin } from '../common/utils/tax-id';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type {
  CreateCustomerDto,
  CustomerCategoryDto,
  CustomerLookupQueryDto,
  CustomerStatusDto,
  QueryCustomersDto,
  UpdateCustomerCategoryDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import { addressData, contactData, CUSTOMER_ENTITY, isIndia, resolveAddressDefaults, resolveContactPrimary } from './customer-shared';

export interface CustomerDuplicate {
  customerId: string;
  customerCode: string;
  name: string;
  status: CustomerStatus;
  matchedOn: 'gstin' | 'pan' | 'name' | 'email' | 'phone';
  severity: 'blocking' | 'warning';
}

const listSelect = {
  id: true,
  customerCode: true,
  name: true,
  customerType: true,
  status: true,
  industry: true,
  gstin: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  contacts: { where: { isPrimary: true }, take: 1, select: { id: true, name: true, designation: true, phone: true, email: true } },
  // Default billing first, else any default, for the City / Country columns.
  addresses: {
    where: { isDefault: true },
    orderBy: { addressType: 'asc' },
    take: 1,
    select: { city: true, state: true, country: true, addressType: true },
  },
  _count: { select: { contacts: true, addresses: true, interests: true, documents: true } },
} satisfies Prisma.CustomerSelect;

const detailInclude = {
  category: true,
  contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
  addresses: { orderBy: [{ addressType: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }] },
  interests: {
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          isActive: true,
          archivedAt: true,
          company: { select: { id: true, name: true } },
        },
      },
      productModel: { select: { id: true, modelCode: true, modelName: true, modelNumber: true, isActive: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
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
} satisfies Prisma.CustomerInclude;

const AUDIT_KEYS = [
  'name', 'customerType', 'categoryId', 'industry', 'website', 'description', 'status', 'taxCountry',
  'gstin', 'pan', 'cin', 'taxRegistrationNumber', 'otherRegistration', 'companySize', 'businessType',
  'annualTurnoverRange', 'employeeCount',
] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numberingService: NumberingService,
  ) {}

  // -------------------------------------------------------------------------
  // Duplicate detection: GSTIN is a hard identifier (blocking); name, PAN,
  // email and phone produce warnings the user may acknowledge. Nothing is
  // ever merged automatically.
  // -------------------------------------------------------------------------

  async findDuplicates(
    input: { name?: string; gstin?: string; pan?: string; emails?: Array<string | undefined>; phones?: Array<string | undefined> },
    excludeId?: string,
  ): Promise<CustomerDuplicate[]> {
    const gstin = normalizeTaxId(input.gstin);
    const pan = normalizeTaxId(input.pan);
    const normalizedName = input.name ? normalizeName(input.name) : undefined;
    const emails = [...new Set((input.emails ?? []).map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e)))];
    const phones = [...new Set((input.phones ?? []).map((p) => normalizePhone(p)).filter((p): p is string => Boolean(p)))];

    const or: Prisma.CustomerWhereInput[] = [];
    if (gstin) or.push({ gstin });
    if (pan) or.push({ pan });
    if (normalizedName) or.push({ normalizedName });
    if (emails.length) or.push({ contacts: { some: { email: { in: emails } } } });
    if (phones.length) or.push({ contacts: { some: { OR: [{ phone: { in: phones } }, { alternatePhone: { in: phones } }] } } });
    if (!or.length) return [];

    const candidates = await this.prisma.customer.findMany({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: {
        id: true,
        customerCode: true,
        name: true,
        normalizedName: true,
        status: true,
        gstin: true,
        pan: true,
        contacts: { select: { email: true, phone: true, alternatePhone: true } },
      },
      take: 10,
    });

    return candidates.flatMap((c): CustomerDuplicate[] => {
      const base = { customerId: c.id, customerCode: c.customerCode, name: c.name, status: c.status };
      if (gstin && c.gstin === gstin) return [{ ...base, matchedOn: 'gstin', severity: 'blocking' }];
      if (pan && c.pan === pan) return [{ ...base, matchedOn: 'pan', severity: 'warning' }];
      if (normalizedName && c.normalizedName === normalizedName) return [{ ...base, matchedOn: 'name', severity: 'warning' }];
      if (c.contacts.some((k) => k.email && emails.includes(k.email))) return [{ ...base, matchedOn: 'email', severity: 'warning' }];
      if (c.contacts.some((k) => [k.phone, k.alternatePhone].some((p) => p && phones.includes(p)))) {
        return [{ ...base, matchedOn: 'phone', severity: 'warning' }];
      }
      return [];
    });
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(dto: CreateCustomerDto, actor: AuthenticatedUser, context: RequestContext) {
    const tax = this.validateTax(dto.customerType, dto.taxCountry ?? 'India', dto);
    if (dto.categoryId) await this.assertCategoryUsable(dto.categoryId);

    const contacts = resolveContactPrimary((dto.contacts ?? []).map(contactData));
    const addresses = resolveAddressDefaults((dto.addresses ?? []).map(addressData));
    // Business rule: at least one way to reach the customer.
    if (!contacts.some((c) => c.phone || c.email)) {
      throw new BadRequestException('Add at least one contact person with a phone number or email address.');
    }

    const duplicates = await this.findDuplicates({
      name: dto.name,
      gstin: tax.gstin ?? undefined,
      pan: tax.pan ?? undefined,
      emails: contacts.map((c) => c.email ?? undefined),
      phones: contacts.flatMap((c) => [c.phone ?? undefined, c.alternatePhone ?? undefined]),
    });
    const blocking = duplicates.filter((d) => d.severity === 'blocking');
    if (blocking.length) {
      throw new ConflictException({
        message: `A customer with this GSTIN already exists: ${blocking[0].name} (${blocking[0].customerCode}).`,
        duplicates: blocking,
      });
    }
    const warnings = duplicates.filter((d) => d.severity === 'warning');
    if (warnings.length && !dto.confirmPossibleDuplicate) {
      throw new ConflictException({
        message: 'A similar customer already exists. Review the matches and confirm to create this customer anyway.',
        duplicates: warnings,
        requiresConfirmation: true,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const customerCode = await this.numberingService.allocate(SEQUENCE_KEYS.CUSTOMER, tx);
      const customer = await tx.customer.create({
        data: {
          customerCode,
          customerType: dto.customerType,
          name: dto.name,
          normalizedName: normalizeName(dto.name),
          categoryId: dto.categoryId ?? null,
          industry: cleanOptional(dto.industry) ?? null,
          website: cleanOptional(dto.website) ?? null,
          description: cleanOptional(dto.description) ?? null,
          status: dto.status ?? CustomerStatus.ACTIVE,
          ...tax,
          ...this.businessProfile(dto.customerType, dto),
          createdById: actor.id,
          updatedById: actor.id,
          contacts: { create: contacts },
          addresses: addresses.length ? { create: addresses } : undefined,
        },
        include: detailInclude,
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'customer.create',
          entityType: CUSTOMER_ENTITY,
          entityId: customer.id,
          summary: `Created ${customer.customerType === CustomerType.BUSINESS ? 'business' : 'individual'} customer ${customer.customerCode} - ${customer.name} with ${contacts.length} contact(s) and ${addresses.length} address(es)`,
          after: this.snapshot(customer),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return customer;
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findAll(query: QueryCustomersDto) {
    const where = this.buildWhere(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: listSelect,
        orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return buildPaginatedResult(items, totalItems, query.page, query.pageSize);
  }

  async summary() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [total, active, inactive, individual, business, newThisMonth] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { status: CustomerStatus.ACTIVE } }),
      this.prisma.customer.count({ where: { status: CustomerStatus.INACTIVE } }),
      this.prisma.customer.count({ where: { customerType: CustomerType.INDIVIDUAL } }),
      this.prisma.customer.count({ where: { customerType: CustomerType.BUSINESS } }),
      this.prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
    ]);
    return { total, active, inactive, individual, business, newThisMonth, generatedAt: now.toISOString() };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, include: detailInclude });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    return customer;
  }

  async findAllForExport(query: QueryCustomersDto) {
    return this.prisma.customer.findMany({
      where: this.buildWhere(query),
      select: {
        ...listSelect,
        website: true,
        pan: true,
        cin: true,
        taxCountry: true,
        taxRegistrationNumber: true,
      },
      orderBy: [{ [query.sortBy]: query.sortDir }, { id: 'asc' }],
      take: 5000,
    });
  }

  /** Activity: the customer plus its contacts, addresses, interests and documents. */
  async activity(id: string, pagination: PaginationQueryDto) {
    await this.assertExists(id);
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: CUSTOMER_ENTITY, entityId: id },
        { parentEntityType: CUSTOMER_ENTITY, parentEntityId: id },
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
   * Customer selector for later modules (enquiries, quotations, PIs): active
   * customers by default, with primary contact and default addresses.
   */
  async lookup(query: CustomerLookupQueryDto) {
    const and: Prisma.CustomerWhereInput[] = [];
    if (!query.includeInactive) and.push({ status: CustomerStatus.ACTIVE });
    if (query.search) {
      const text = { contains: query.search, mode: 'insensitive' } as const;
      and.push({ OR: [{ name: text }, { customerCode: text }, { gstin: { contains: query.search.toUpperCase() } }, { contacts: { some: { name: text } } }] });
    }
    return this.prisma.customer.findMany({
      where: and.length ? { AND: and } : {},
      select: {
        id: true,
        customerCode: true,
        name: true,
        customerType: true,
        status: true,
        gstin: true,
        contacts: { where: { isPrimary: true }, take: 1, select: { name: true, phone: true, email: true } },
        addresses: { where: { isDefault: true }, select: { id: true, addressType: true, city: true, state: true, country: true } },
      },
      orderBy: { name: 'asc' },
      take: 25,
    });
  }

  /** The check later business documents must run before referencing a customer. */
  async assertSelectableForTransaction(customerId: string, actor: AuthenticatedUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, customerCode: true, status: true },
    });
    if (!customer) throw new NotFoundException(`Customer ${customerId} was not found`);
    if (customer.status === CustomerStatus.INACTIVE && !actor.permissions.includes(PERMISSIONS.CUSTOMER_USE_INACTIVE)) {
      throw new BadRequestException(`${customer.name} is inactive. Activate the customer before using it.`);
    }
    return customer;
  }

  private buildWhere(query: QueryCustomersDto): Prisma.CustomerWhereInput {
    const and: Prisma.CustomerWhereInput[] = [];
    if (query.customerType) and.push({ customerType: query.customerType });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.status) and.push({ status: query.status });
    if (query.industry) and.push({ industry: { contains: query.industry, mode: 'insensitive' } });
    if (query.country) and.push({ addresses: { some: { country: { equals: query.country, mode: 'insensitive' } } } });
    if (query.state) and.push({ addresses: { some: { state: { contains: query.state, mode: 'insensitive' } } } });
    if (query.productId) and.push({ interests: { some: { productId: query.productId } } });
    if (query.createdFrom) and.push({ createdAt: { gte: businessDayStart(query.createdFrom) } });
    if (query.createdTo) {
      // Inclusive: everything before the start of the following business day.
      and.push({ createdAt: { lt: businessDayEnd(query.createdTo) } });
    }
    if (query.search) {
      const term = query.search;
      const text = { contains: term, mode: 'insensitive' } as const;
      // Phones are stored as digits: "98765 43210" must match "9876543210".
      const digits = term.replace(/\D/g, '');
      const phone = { contains: digits.length >= 4 ? digits : term };
      and.push({
        OR: [
          { name: text },
          { normalizedName: normalizedNameFilter(term) },
          { customerCode: text },
          { gstin: { contains: term.toUpperCase().replace(/\s/g, '') } },
          { pan: { contains: term.toUpperCase().replace(/\s/g, '') } },
          { industry: text },
          { contacts: { some: { OR: [{ name: text }, { email: text }, { phone }, { alternatePhone: phone }] } } },
          { addresses: { some: { OR: [{ city: text }, { country: text }, { state: text }] } } },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }

  // -------------------------------------------------------------------------
  // Update / status / delete
  // -------------------------------------------------------------------------

  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer ${id} was not found`);

    const customerType = dto.customerType ?? existing.customerType;
    const taxCountry = dto.taxCountry !== undefined ? dto.taxCountry || 'India' : existing.taxCountry;
    // Re-validate the full tax picture with the edited values merged in.
    const merged = {
      gstin: dto.gstin !== undefined ? dto.gstin : existing.gstin ?? undefined,
      pan: dto.pan !== undefined ? dto.pan : existing.pan ?? undefined,
      cin: dto.cin !== undefined ? dto.cin : existing.cin ?? undefined,
      taxRegistrationNumber: dto.taxRegistrationNumber !== undefined ? dto.taxRegistrationNumber : existing.taxRegistrationNumber ?? undefined,
      otherRegistration: dto.otherRegistration !== undefined ? dto.otherRegistration : existing.otherRegistration ?? undefined,
    };
    const tax = this.validateTax(customerType, taxCountry, merged);
    if (tax.gstin && tax.gstin !== existing.gstin) {
      const clash = await this.prisma.customer.findFirst({ where: { gstin: tax.gstin, id: { not: id } }, select: { name: true, customerCode: true } });
      if (clash) throw new ConflictException(`GSTIN already belongs to ${clash.name} (${clash.customerCode}).`);
    }
    // Only a newly chosen category must be active; deactivating a category
    // must not make its existing customers uneditable.
    if (dto.categoryId && dto.categoryId !== existing.categoryId) await this.assertCategoryUsable(dto.categoryId);

    const data: Prisma.CustomerUncheckedUpdateInput = { updatedById: actor.id, customerType, ...tax };
    if (dto.name) {
      data.name = dto.name;
      data.normalizedName = normalizeName(dto.name);
    }
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId || null;
    if (dto.industry !== undefined) data.industry = cleanOptional(dto.industry) ?? null;
    if (dto.website !== undefined) data.website = cleanOptional(dto.website) ?? null;
    if (dto.description !== undefined) data.description = cleanOptional(dto.description) ?? null;
    const profileInput = {
      companySize: dto.companySize !== undefined ? dto.companySize : existing.companySize ?? undefined,
      businessType: dto.businessType !== undefined ? dto.businessType : existing.businessType ?? undefined,
      annualTurnoverRange: dto.annualTurnoverRange !== undefined ? dto.annualTurnoverRange : existing.annualTurnoverRange ?? undefined,
      employeeCount: dto.employeeCount !== undefined ? dto.employeeCount : existing.employeeCount ?? undefined,
    };
    Object.assign(data, this.businessProfile(customerType, profileInput));

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data, include: detailInclude });
      const before = this.snapshot(existing);
      const after = this.snapshot(updated);
      const changed = Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'customer.update',
          entityType: CUSTOMER_ENTITY,
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

  async setStatus(id: string, dto: CustomerStatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.assertExists(id);
    if (existing.status === dto.status) {
      throw new BadRequestException(`This customer is already ${dto.status === CustomerStatus.ACTIVE ? 'active' : 'inactive'}.`);
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { status: dto.status, updatedById: actor.id },
        select: { id: true, customerCode: true, name: true, status: true },
      });
      const activated = dto.status === CustomerStatus.ACTIVE;
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: activated ? 'customer.activate' : 'customer.deactivate',
          entityType: CUSTOMER_ENTITY,
          entityId: id,
          summary: `${activated ? 'Activated' : 'Deactivated'} customer${dto.reason ? `: ${dto.reason}` : ''}`,
          before: { status: existing.status },
          after: { status: dto.status, reason: dto.reason ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Records that keep a customer from being physically deleted. Enquiries,
   * quotations, PIs, payments and deliveries add their counts here.
   */
  async getReferenceCounts(id: string): Promise<Record<string, number>> {
    const [documents, enquiries, quotations, proformaInvoices, finalInvoices, payments, deliveries] = await this.prisma.$transaction([
      // Removed (archived) files do not block: remove() detaches them.
      this.prisma.document.count({ where: { customerId: id, archivedAt: null } }),
      this.prisma.enquiry.count({ where: { customerId: id } }),
      this.prisma.quotation.count({ where: { customerId: id } }),
      this.prisma.proformaInvoice.count({ where: { customerId: id } }),
      this.prisma.finalInvoice.count({ where: { customerId: id } }),
      this.prisma.payment.count({ where: { customerId: id } }),
      this.prisma.delivery.count({ where: { customerId: id } }),
    ]);
    return { documents, enquiries, quotations, proformaInvoices, finalInvoices, payments, deliveries };
  }

  /** Permanent delete of a customer nothing refers to; contacts, addresses and interests go with it. */
  async remove(id: string, actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Customer ${id} was not found`);
    const blocking = Object.entries(await this.getReferenceCounts(id)).filter(([, count]) => count > 0);
    if (blocking.length) {
      throw new ConflictException({
        message: 'This customer is referenced by other records and cannot be deleted. Deactivate it instead to keep its history.',
        details: Object.fromEntries(blocking),
      });
    }
    await this.prisma.$transaction(async (tx) => {
      // Document.customer is Restrict: detach removed (archived) files, which
      // are kept for audit, or the delete fails on the foreign key.
      await tx.document.updateMany({ where: { customerId: id, archivedAt: { not: null } }, data: { customerId: null } });
      await tx.customer.delete({ where: { id } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'customer.delete',
          entityType: CUSTOMER_ENTITY,
          entityId: id,
          summary: `Permanently deleted customer ${existing.customerCode} - ${existing.name}`,
          before: this.snapshot(existing),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  // -------------------------------------------------------------------------
  // Categories (configurable)
  // -------------------------------------------------------------------------

  async listCategories(includeInactive: boolean) {
    return this.prisma.customerCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    });
  }

  async createCategory(dto: CustomerCategoryDto, actor: AuthenticatedUser) {
    const normalizedName = normalizeName(dto.name);
    const clash = await this.prisma.customerCategory.findUnique({ where: { normalizedName } });
    if (clash) throw new ConflictException(`The category "${clash.name}" already exists.`);
    const category = await this.prisma.customerCategory.create({
      data: { name: dto.name, normalizedName, description: cleanOptional(dto.description) ?? null },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'customer_category.create',
      entityType: 'CustomerCategory',
      entityId: category.id,
      summary: `Created customer category ${category.name}`,
    });
    return category;
  }

  /** Permanently deletes a customer category that no customer uses. */
  async deleteCategory(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.customerCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} was not found`);
    const customers = await this.prisma.customer.count({ where: { categoryId: id } });
    assertNotReferenced(`The category "${existing.name}"`, [{ label: 'customer', count: customers }]);
    await this.prisma.customerCategory.delete({ where: { id } });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'customer_category.delete',
      entityType: 'CustomerCategory',
      entityId: id,
      summary: `Deleted customer category ${existing.name}`,
      before: { name: existing.name },
    });
    return { id, deleted: true };
  }

  async updateCategory(id: string, dto: UpdateCustomerCategoryDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.customerCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Category ${id} was not found`);
    if (dto.name && normalizeName(dto.name) !== existing.normalizedName) {
      const clash = await this.prisma.customerCategory.findUnique({ where: { normalizedName: normalizeName(dto.name) } });
      if (clash) throw new ConflictException(`The category "${clash.name}" already exists.`);
    }
    const updated = await this.prisma.customerCategory.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name, normalizedName: normalizeName(dto.name) } : {}),
        ...(dto.description !== undefined ? { description: cleanOptional(dto.description) ?? null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'customer_category.update',
      entityType: 'CustomerCategory',
      entityId: id,
      summary: `Updated customer category ${updated.name}`,
      before: { name: existing.name, isActive: existing.isActive },
      after: { name: updated.name, isActive: updated.isActive },
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async assertExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    return customer;
  }

  /**
   * Country-aware tax rules. Indian identifiers are only valid for Indian
   * customers, a CIN only for Indian businesses, and a GSTIN's embedded PAN
   * must match the PAN. Customers elsewhere use taxRegistrationNumber.
   */
  private validateTax(
    customerType: CustomerType,
    taxCountry: string,
    input: { gstin?: string | null; pan?: string | null; cin?: string | null; taxRegistrationNumber?: string | null; otherRegistration?: string | null },
  ) {
    const gstin = normalizeTaxId(input.gstin) ?? null;
    const pan = normalizeTaxId(input.pan) ?? null;
    const cin = normalizeTaxId(input.cin) ?? null;
    const country = cleanOptional(taxCountry) ?? 'India';

    if (!isIndia(country) && (gstin || pan || cin)) {
      throw new BadRequestException(
        `GSTIN, PAN and CIN are Indian identifiers. For a customer in ${country}, use the Tax Registration Number instead.`,
      );
    }
    if (cin && customerType === CustomerType.INDIVIDUAL) {
      throw new BadRequestException('A CIN identifies a company; it does not apply to an individual customer.');
    }
    if (gstin && pan) {
      const embedded = panFromGstin(gstin);
      if (embedded && embedded !== pan) {
        throw new BadRequestException(`PAN does not match the GSTIN. The GSTIN contains PAN ${embedded}.`);
      }
    }
    return {
      taxCountry: country,
      gstin,
      pan,
      cin,
      taxRegistrationNumber: cleanOptional(input.taxRegistrationNumber) ?? null,
      otherRegistration: cleanOptional(input.otherRegistration) ?? null,
    };
  }

  /** Business profile fields are kept only for business customers. */
  private businessProfile(
    customerType: CustomerType,
    input: { companySize?: string | null; businessType?: string | null; annualTurnoverRange?: string | null; employeeCount?: number | null },
  ) {
    if (customerType !== CustomerType.BUSINESS) {
      return { companySize: null, businessType: null, annualTurnoverRange: null, employeeCount: null };
    }
    return {
      companySize: cleanOptional(input.companySize) ?? null,
      businessType: cleanOptional(input.businessType) ?? null,
      annualTurnoverRange: cleanOptional(input.annualTurnoverRange) ?? null,
      employeeCount: input.employeeCount ?? null,
    };
  }

  private async assertCategoryUsable(categoryId: string) {
    const category = await this.prisma.customerCategory.findUnique({ where: { id: categoryId }, select: { isActive: true } });
    if (!category) throw new BadRequestException('The selected customer category does not exist.');
    if (!category.isActive) throw new BadRequestException('The selected customer category is inactive.');
  }

  private snapshot(customer: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(AUDIT_KEYS.filter((k) => k in customer).map((k) => [k, customer[k]]));
  }
}
