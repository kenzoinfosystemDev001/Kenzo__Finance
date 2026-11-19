import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  cleanOptional,
  normalizeEmail,
  normalizePhone,
} from '../common/utils/normalize';
import type { VendorContactInputDto } from './dto/create-vendor.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';

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
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
  }

  async create(
    vendorId: string,
    dto: VendorContactInputDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorExists(vendorId);

    return this.prisma.$transaction(async (tx) => {
      // At most one primary contact per vendor.
      if (dto.isPrimary) {
        await tx.vendorContact.updateMany({
          where: { vendorId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const contact = await tx.vendorContact.create({
        data: {
          vendorId,
          name: dto.name.trim(),
          designation: cleanOptional(dto.designation) ?? null,
          email: normalizeEmail(dto.email) ?? null,
          phone: normalizePhone(dto.phone) ?? null,
          isPrimary: dto.isPrimary ?? false,
          notes: cleanOptional(dto.notes) ?? null,
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.contact.create',
          entityType: 'VendorContact',
          entityId: contact.id,
          summary: `Added contact ${contact.name} to vendor ${vendorId}`,
          after: { name: contact.name, email: contact.email, phone: contact.phone },
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
    dto: Partial<VendorContactInputDto>,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    const existing = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!existing) throw new NotFoundException('Contact was not found for this vendor.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.vendorContact.updateMany({
          where: { vendorId, isPrimary: true, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }

      const updated = await tx.vendorContact.update({
        where: { id: contactId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.designation !== undefined
            ? { designation: cleanOptional(dto.designation) ?? null }
            : {}),
          ...(dto.email !== undefined
            ? { email: normalizeEmail(dto.email) ?? null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: normalizePhone(dto.phone) ?? null }
            : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.notes !== undefined
            ? { notes: cleanOptional(dto.notes) ?? null }
            : {}),
        },
      });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.contact.update',
          entityType: 'VendorContact',
          entityId: contactId,
          summary: `Updated contact ${updated.name} on vendor ${vendorId}`,
          before: { name: existing.name, email: existing.email, phone: existing.phone },
          after: { name: updated.name, email: updated.email, phone: updated.phone },
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
    const existing = await this.prisma.vendorContact.findFirst({
      where: { id: contactId, vendorId },
    });
    if (!existing) throw new NotFoundException('Contact was not found for this vendor.');

    await this.prisma.vendorContact.delete({ where: { id: contactId } });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'vendor.contact.delete',
      entityType: 'VendorContact',
      entityId: contactId,
      summary: `Removed contact ${existing.name} from vendor ${vendorId}`,
      before: { name: existing.name, email: existing.email, phone: existing.phone },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async assertVendorExists(vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
  }
}
