import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { cleanOptional, normalizeEmail, normalizePhone } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  CUSTOMER_DOCUMENT_KINDS,
  type AddProductInterestDto,
  type CustomerAddressInputDto,
  type CustomerContactInputDto,
  type CustomerDocumentKind,
  type UpdateCustomerAddressDto,
  type UpdateCustomerContactDto,
  type UpdateProductInterestDto,
} from './dto/customer.dto';
import { addressData, contactData, CUSTOMER_ENTITY, lockCustomerRow } from './customer-shared';

const describeAddress = (a: { addressType: string; addressLine1: string; city: string | null }) =>
  `${a.addressType.toLowerCase()} - ${a.addressLine1}${a.city ? `, ${a.city}` : ''}`;

/**
 * Contacts, addresses, products of interest and documents of a customer.
 * Every write is audited with the customer as parent, so it appears in the
 * customer's activity history.
 */
@Injectable()
export class CustomerChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
  ) {}

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    context: RequestContext | null,
    customerId: string,
    entry: { action: string; entityType: string; entityId: string; summary: string; before?: unknown; after?: unknown },
  ) {
    return this.auditService.record(
      {
        ...entry,
        actorUserId: actor.id,
        parentEntityType: CUSTOMER_ENTITY,
        parentEntityId: customerId,
        ipAddress: context?.ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
      },
      tx,
    );
  }

  private async assertCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} was not found`);
  }

  // -------------------------------------------------------------------------
  // Contacts - exactly one primary; at least one contact must remain reachable.
  // -------------------------------------------------------------------------

  async listContacts(customerId: string) {
    await this.assertCustomer(customerId);
    return this.prisma.customerContact.findMany({ where: { customerId }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] });
  }

  async createContact(customerId: string, dto: CustomerContactInputDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.assertCustomer(customerId);
    const data = contactData(dto);
    return this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, customerId);
      const primary = await tx.customerContact.findFirst({ where: { customerId, isPrimary: true }, select: { id: true } });
      if (!primary) data.isPrimary = true;
      if (data.isPrimary && primary) await tx.customerContact.update({ where: { id: primary.id }, data: { isPrimary: false } });
      const contact = await tx.customerContact.create({ data: { customerId, ...data } });
      await this.audit(tx, actor, context, customerId, {
        action: 'customer.contact.create',
        entityType: 'CustomerContact',
        entityId: contact.id,
        summary: `Added contact ${contact.name}${contact.isPrimary ? ' (primary)' : ''}`,
        after: { name: contact.name, email: contact.email, phone: contact.phone, isPrimary: contact.isPrimary },
      });
      return contact;
    });
  }

  async updateContact(contactId: string, dto: UpdateCustomerContactDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.customerContact.findUnique({ where: { id: contactId } });
    if (!existing) throw new NotFoundException('Contact was not found.');
    if (dto.name !== undefined && !dto.name?.trim()) throw new BadRequestException('Contact name is required.');
    if (dto.isPrimary === false && existing.isPrimary) {
      throw new BadRequestException('A customer always has one primary contact. Mark another contact as primary instead.');
    }

    const next = {
      email: dto.email !== undefined ? normalizeEmail(dto.email) ?? null : existing.email,
      phone: dto.phone !== undefined ? normalizePhone(dto.phone) ?? null : existing.phone,
    };

    return this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, existing.customerId);
      if (!next.email && !next.phone) await this.assertAnotherReachable(tx, existing.customerId, contactId);
      if (dto.isPrimary && !existing.isPrimary) {
        await tx.customerContact.updateMany({ where: { customerId: existing.customerId, isPrimary: true }, data: { isPrimary: false } });
      }
      const updated = await tx.customerContact.update({
        where: { id: contactId },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.designation !== undefined ? { designation: cleanOptional(dto.designation) ?? null } : {}),
          ...(dto.department !== undefined ? { department: cleanOptional(dto.department) ?? null } : {}),
          ...(dto.alternatePhone !== undefined ? { alternatePhone: normalizePhone(dto.alternatePhone) ?? null } : {}),
          email: next.email,
          phone: next.phone,
          ...(dto.isPrimary ? { isPrimary: true } : {}),
        },
      });
      await this.audit(tx, actor, context, existing.customerId, {
        action: 'customer.contact.update',
        entityType: 'CustomerContact',
        entityId: contactId,
        summary: `Updated contact ${updated.name}${dto.isPrimary && !existing.isPrimary ? ' (now primary)' : ''}`,
        before: { name: existing.name, email: existing.email, phone: existing.phone, isPrimary: existing.isPrimary },
        after: { name: updated.name, email: updated.email, phone: updated.phone, isPrimary: updated.isPrimary },
      });
      return updated;
    });
  }

  async removeContact(contactId: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.customerContact.findUnique({ where: { id: contactId } });
    if (!existing) throw new NotFoundException('Contact was not found.');
    await this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, existing.customerId);
      await this.assertAnotherReachable(tx, existing.customerId, contactId);
      await tx.customerContact.delete({ where: { id: contactId } });
      if (existing.isPrimary) {
        const next = await tx.customerContact.findFirst({ where: { customerId: existing.customerId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.customerContact.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
      await this.audit(tx, actor, context, existing.customerId, {
        action: 'customer.contact.delete',
        entityType: 'CustomerContact',
        entityId: contactId,
        summary: `Removed contact ${existing.name}`,
        before: { name: existing.name, email: existing.email, phone: existing.phone },
      });
    });
  }

  /** Business rule: a customer must stay reachable through at least one other contact. */
  private async assertAnotherReachable(tx: Prisma.TransactionClient, customerId: string, excludeContactId: string) {
    const others = await tx.customerContact.count({
      where: { customerId, id: { not: excludeContactId }, OR: [{ phone: { not: null } }, { email: { not: null } }] },
    });
    if (others === 0) {
      throw new ConflictException('This is the only contact with a phone or email. Add another reachable contact first.');
    }
  }

  // -------------------------------------------------------------------------
  // Addresses - many per type, at most one default per type.
  // -------------------------------------------------------------------------

  async listAddresses(customerId: string) {
    await this.assertCustomer(customerId);
    return this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: [{ addressType: 'asc' }, { isDefault: 'desc' }] });
  }

  async createAddress(customerId: string, dto: CustomerAddressInputDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.assertCustomer(customerId);
    const data = addressData(dto);
    return this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, customerId);
      const current = await tx.customerAddress.findFirst({ where: { customerId, addressType: data.addressType, isDefault: true }, select: { id: true } });
      if (!current) data.isDefault = true;
      if (data.isDefault && current) await tx.customerAddress.update({ where: { id: current.id }, data: { isDefault: false } });
      const address = await tx.customerAddress.create({ data: { customerId, ...data } });
      await this.audit(tx, actor, context, customerId, {
        action: 'customer.address.create',
        entityType: 'CustomerAddress',
        entityId: address.id,
        summary: `Added ${describeAddress(address)}${address.isDefault ? ' (default)' : ''}`,
        after: data,
      });
      return address;
    });
  }

  async updateAddress(addressId: string, dto: UpdateCustomerAddressDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!existing) throw new NotFoundException('Address was not found.');
    if (dto.addressLine1 !== undefined && !dto.addressLine1?.trim()) throw new BadRequestException('Address line 1 is required.');
    if (dto.isDefault === false && existing.isDefault && !dto.addressType) {
      throw new BadRequestException('Mark another address of this type as default instead.');
    }

    const nextType = dto.addressType ?? existing.addressType;
    const typeChanged = nextType !== existing.addressType;

    return this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, existing.customerId);
      const otherDefault = await tx.customerAddress.findFirst({
        where: { customerId: existing.customerId, addressType: nextType, isDefault: true, id: { not: addressId } },
        select: { id: true },
      });
      let isDefault = typeChanged ? !otherDefault || dto.isDefault === true : dto.isDefault ?? existing.isDefault;
      if (isDefault && otherDefault) {
        if (dto.isDefault) await tx.customerAddress.update({ where: { id: otherDefault.id }, data: { isDefault: false } });
        else isDefault = false;
      }

      const updated = await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          addressType: nextType,
          ...(dto.addressLine1 ? { addressLine1: dto.addressLine1.trim() } : {}),
          ...(dto.addressLine2 !== undefined ? { addressLine2: cleanOptional(dto.addressLine2) ?? null } : {}),
          ...(dto.city !== undefined ? { city: cleanOptional(dto.city) ?? null } : {}),
          ...(dto.state !== undefined ? { state: cleanOptional(dto.state) ?? null } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: cleanOptional(dto.postalCode) ?? null } : {}),
          ...(dto.country !== undefined ? { country: cleanOptional(dto.country) ?? 'India' } : {}),
          isDefault,
        },
      });

      // The type this address left may now lack a default.
      if (typeChanged && existing.isDefault) await this.promoteDefault(tx, existing.customerId, existing.addressType);

      await this.audit(tx, actor, context, existing.customerId, {
        action: 'customer.address.update',
        entityType: 'CustomerAddress',
        entityId: addressId,
        summary: `Updated ${describeAddress(updated)}`,
        before: { addressType: existing.addressType, addressLine1: existing.addressLine1, city: existing.city, isDefault: existing.isDefault },
        after: { addressType: updated.addressType, addressLine1: updated.addressLine1, city: updated.city, isDefault: updated.isDefault },
      });
      return updated;
    });
  }

  async removeAddress(addressId: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!existing) throw new NotFoundException('Address was not found.');
    await this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, existing.customerId);
      await tx.customerAddress.delete({ where: { id: addressId } });
      if (existing.isDefault) await this.promoteDefault(tx, existing.customerId, existing.addressType);
      await this.audit(tx, actor, context, existing.customerId, {
        action: 'customer.address.delete',
        entityType: 'CustomerAddress',
        entityId: addressId,
        summary: `Removed ${describeAddress(existing)}`,
      });
    });
  }

  private async promoteDefault(tx: Prisma.TransactionClient, customerId: string, addressType: CustomerAddressInputDto['addressType']) {
    const next = await tx.customerAddress.findFirst({ where: { customerId, addressType }, orderBy: { createdAt: 'asc' } });
    if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  // -------------------------------------------------------------------------
  // Products of interest - references to the shared catalogue only.
  // -------------------------------------------------------------------------

  async listInterests(customerId: string) {
    await this.assertCustomer(customerId);
    return this.prisma.customerProductInterest.findMany({
      where: { customerId },
      include: {
        product: { select: { id: true, productCode: true, name: true, company: { select: { name: true } } } },
        productModel: { select: { id: true, modelName: true, modelNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Adds one row per selected model, or one product-level row when no model
   * is chosen. Duplicates are refused. Nothing in Product Management changes,
   * and no enquiry or quotation is created.
   */
  async addInterest(customerId: string, dto: AddProductInterestDto, actor: AuthenticatedUser, context: RequestContext) {
    await this.assertCustomer(customerId);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, archivedAt: null },
      select: { id: true, name: true, models: { select: { id: true, modelName: true } } },
    });
    if (!product) throw new BadRequestException('The selected product does not exist or is archived.');

    const modelIds = [...new Set(dto.modelIds ?? [])];
    const unknown = modelIds.filter((id) => !product.models.some((m) => m.id === id));
    if (unknown.length) throw new BadRequestException('One or more selected models do not belong to this product.');
    const targets: Array<string | null> = modelIds.length ? modelIds : [null];

    return this.prisma.$transaction(async (tx) => {
      await lockCustomerRow(tx, customerId);
      const existing = await tx.customerProductInterest.findMany({
        where: { customerId, productId: product.id },
        select: { productModelId: true },
      });
      const clashes = targets.filter((t) => existing.some((e) => e.productModelId === t));
      if (clashes.length) {
        const names = clashes.map((t) => (t ? product.models.find((m) => m.id === t)?.modelName : `${product.name} (any model)`));
        throw new ConflictException(`Already listed for this customer: ${names.join(', ')}.`);
      }

      const created = [];
      for (const productModelId of targets) {
        const interest = await tx.customerProductInterest.create({
          data: { customerId, productId: product.id, productModelId, notes: cleanOptional(dto.notes) ?? null, createdById: actor.id },
        });
        created.push(interest);
        const label = productModelId ? `${product.name} - ${product.models.find((m) => m.id === productModelId)?.modelName}` : product.name;
        await this.audit(tx, actor, context, customerId, {
          action: 'customer.product.add',
          entityType: 'CustomerProductInterest',
          entityId: interest.id,
          summary: `Added product of interest ${label}`,
          after: { productId: product.id, productModelId, notes: interest.notes },
        });
      }
      return created;
    });
  }

  async updateInterest(customerId: string, interestId: string, dto: UpdateProductInterestDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadInterest(customerId, interestId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerProductInterest.update({
        where: { id: interestId },
        data: { notes: cleanOptional(dto.notes) ?? null },
      });
      await this.audit(tx, actor, context, customerId, {
        action: 'customer.product.update',
        entityType: 'CustomerProductInterest',
        entityId: interestId,
        summary: `Updated notes on ${existing.product.name}`,
        before: { notes: existing.notes },
        after: { notes: updated.notes },
      });
      return updated;
    });
  }

  async removeInterest(customerId: string, interestId: string, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadInterest(customerId, interestId);
    await this.prisma.$transaction(async (tx) => {
      await tx.customerProductInterest.delete({ where: { id: interestId } });
      await this.audit(tx, actor, context, customerId, {
        action: 'customer.product.remove',
        entityType: 'CustomerProductInterest',
        entityId: interestId,
        summary: `Removed product of interest ${existing.product.name}${existing.productModel ? ` - ${existing.productModel.modelName}` : ''}`,
        before: { productId: existing.productId, productModelId: existing.productModelId },
      });
    });
  }

  private async loadInterest(customerId: string, interestId: string) {
    const interest = await this.prisma.customerProductInterest.findFirst({
      where: { id: interestId, customerId },
      include: { product: { select: { name: true } }, productModel: { select: { modelName: true } } },
    });
    if (!interest) throw new NotFoundException('This product is not listed for the customer.');
    return interest;
  }

  // -------------------------------------------------------------------------
  // Documents - customer-scoped view of the shared private store.
  // -------------------------------------------------------------------------

  async listDocuments(customerId: string) {
    await this.assertCustomer(customerId);
    return this.prisma.document.findMany({
      where: { customerId, archivedAt: null },
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
    });
  }

  async uploadDocument(customerId: string, file: { buffer: Buffer; originalname: string } | undefined, kind: CustomerDocumentKind | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertCustomer(customerId);
    return this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: kind ?? DocumentKind.CUSTOMER_OTHER, customerId },
      actor,
    );
  }

  async replaceDocument(customerId: string, documentId: string, file: { buffer: Buffer; originalname: string } | undefined, kind: CustomerDocumentKind | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const current = await this.assertOwnedDocument(customerId, documentId);
    return this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: kind ?? current.kind, customerId, replacesDocumentId: current.id },
      actor,
    );
  }

  async removeDocument(customerId: string, documentId: string, actor: AuthenticatedUser) {
    await this.assertOwnedDocument(customerId, documentId);
    return this.documentsService.archive(documentId, actor);
  }

  async openDocument(customerId: string, documentId: string, actor: AuthenticatedUser, preview: boolean) {
    await this.assertOwnedDocument(customerId, documentId);
    return this.documentsService.openForDownload(documentId, actor, { preview });
  }

  private async assertOwnedDocument(customerId: string, documentId: string) {
    const document = await this.documentsService.findActive(documentId);
    if (document.customerId !== customerId || !(CUSTOMER_DOCUMENT_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document as typeof document & { kind: CustomerDocumentKind };
  }
}
