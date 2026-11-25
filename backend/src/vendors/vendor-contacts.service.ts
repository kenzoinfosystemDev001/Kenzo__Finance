import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cleanOptional, normalizeEmail, normalizePhone } from '../common/utils/normalize';
import type { VendorContactInputDto } from './dto/create-vendor.dto';
import type { UpdateVendorContactDto } from './dto/vendor-children.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  contactData,
  lockVendorRow,
  syncVendorMirrors,
  VENDOR_ENTITY,
} from './vendor-shared';

const auditFields = (contact: {
  contactType: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}) => ({
  contactType: contact.contactType,
  name: contact.name,
  designation: contact.designation,
  email: contact.email,
  phone: contact.phone,
  isPrimary: contact.isPrimary,
});

@Injectable()
export class VendorContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(vendorId: string) {
    await this.assertVendorExists(vendorId);
    return this.prisma.vendorContact.findMany({
      where: { vendorId },
      orderBy: [{ contactType: 'asc' }, { isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async create(
    vendorId: string,
    dto: VendorContactInputDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorEditable(vendorId);
    const data = contactData(dto);

    return this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);

      // The first contact of a type is its primary by default; an explicit
      // primary demotes the previous one of the same type.
      const existingPrimary = await tx.vendorContact.findFirst({
        where: { vendorId, contactType: data.contactType, isPrimary: true },
        select: { id: true },
      });
      if (!existingPrimary) data.isPrimary = true;
      if (data.isPrimary && existingPrimary) {
        await tx.vendorContact.update({
          where: { id: existingPrimary.id },
          data: { isPrimary: false },
        });
      }

      const contact = await tx.vendorContact.create({ data: { vendorId, ...data } });
      await syncVendorMirrors(tx, vendorId, { contact: true });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.contact.create',
          entityType: 'VendorContact',
          entityId: contact.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Added contact ${contact.name}${contact.isPrimary ? ' (primary)' : ''}`,
          after: auditFields(contact),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return contact;
    });
  }

  async update(
    vendorId: string,
    contactId: string,
    dto: UpdateVendorContactDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorEditable(vendorId);
    const existing = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!existing) throw new NotFoundException('Contact was not found for this vendor.');

    if (dto.name !== undefined && (!dto.name || !dto.name.trim())) {
      throw new BadRequestException('Contact name is required.');
    }

    const data: Prisma.VendorContactUpdateInput = {
      ...(dto.contactType !== undefined && dto.contactType !== null
        ? { contactType: dto.contactType }
        : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.designation !== undefined ? { designation: cleanOptional(dto.designation) ?? null } : {}),
      ...(dto.email !== undefined ? { email: normalizeEmail(dto.email) ?? null } : {}),
      ...(dto.alternateEmail !== undefined
        ? { alternateEmail: normalizeEmail(dto.alternateEmail) ?? null }
        : {}),
      ...(dto.phone !== undefined ? { phone: normalizePhone(dto.phone) ?? null } : {}),
      ...(dto.alternatePhone !== undefined
        ? { alternatePhone: normalizePhone(dto.alternatePhone) ?? null }
        : {}),
      ...(dto.notes !== undefined ? { notes: cleanOptional(dto.notes) ?? null } : {}),
    };

    const nextType = dto.contactType ?? existing.contactType;
    const typeChanged = nextType !== existing.contactType;

    return this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);

      const otherPrimary = await tx.vendorContact.findFirst({
        where: { vendorId, contactType: nextType, isPrimary: true, id: { not: contactId } },
        select: { id: true },
      });

      // Primary flag after this change.
      let isPrimary = dto.isPrimary ?? existing.isPrimary;
      if (isPrimary && otherPrimary) {
        if (dto.isPrimary === true) {
          // Explicit request: this contact takes over as primary.
          await tx.vendorContact.update({ where: { id: otherPrimary.id }, data: { isPrimary: false } });
        } else {
          // Moved into a type that already has a primary: keep that one.
          isPrimary = false;
        }
      }
      if (!isPrimary && !otherPrimary) {
        // A type with contacts always has a primary.
        isPrimary = true;
      }
      data.isPrimary = isPrimary;

      const updated = await tx.vendorContact.update({ where: { id: contactId }, data });

      // The type this contact left may now lack a primary.
      if (typeChanged && existing.isPrimary) {
        await this.promoteFirst(tx, vendorId, existing.contactType);
      }
      await syncVendorMirrors(tx, vendorId, { contact: true });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.contact.update',
          entityType: 'VendorContact',
          entityId: contactId,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Updated contact ${updated.name}`,
          before: auditFields(existing),
          after: auditFields(updated),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return updated;
    });
  }

  async remove(
    vendorId: string,
    contactId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    await this.assertVendorEditable(vendorId);
    const existing = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!existing) throw new NotFoundException('Contact was not found for this vendor.');

    await this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);
      await tx.vendorContact.delete({ where: { id: contactId } });

      if (existing.isPrimary) {
        await this.promoteFirst(tx, vendorId, existing.contactType);
      }
      await syncVendorMirrors(tx, vendorId, { contact: true });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.contact.delete',
          entityType: 'VendorContact',
          entityId: contactId,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Removed contact ${existing.name}`,
          before: auditFields(existing),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  /** Makes the oldest remaining contact of a type primary, if any remain. */
  private async promoteFirst(
    tx: Prisma.TransactionClient,
    vendorId: string,
    contactType: VendorContactInputDto['contactType'],
  ): Promise<void> {
    const next = await tx.vendorContact.findFirst({
      where: { vendorId, contactType },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (next) {
      await tx.vendorContact.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
  }

  private async assertVendorExists(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
  }

  private async assertVendorEditable(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, archivedAt: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
    if (vendor.archivedAt) {
      throw new BadRequestException('This vendor is archived. Restore it before editing contacts.');
    }
  }
}
