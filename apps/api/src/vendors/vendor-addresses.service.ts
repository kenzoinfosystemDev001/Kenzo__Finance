import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cleanOptional } from '../common/utils/normalize';
import type { VendorAddressInputDto } from './dto/create-vendor.dto';
import type { UpdateVendorAddressDto } from './dto/vendor-children.dto';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import {
  addressData,
  lockVendorRow,
  syncVendorMirrors,
  VENDOR_ENTITY,
} from './vendor-shared';

const describe = (address: {
  addressType: string;
  addressLine1: string;
  city: string | null;
}) =>
  `${address.addressType.replace(/_/g, ' ').toLowerCase()} - ${address.addressLine1}${address.city ? `, ${address.city}` : ''}`;

const auditFields = (address: Record<string, unknown>) => {
  const keys = [
    'addressType', 'label', 'addressLine1', 'addressLine2', 'city', 'state',
    'postalCode', 'country', 'isPrimary',
  ];
  return Object.fromEntries(keys.map((key) => [key, address[key] ?? null]));
};

/**
 * Vendor addresses. Exactly one address per vendor is primary; it is mirrored
 * onto the vendor row so list queries and exports need no join.
 */
@Injectable()
export class VendorAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(vendorId: string) {
    await this.assertVendorExists(vendorId);
    return this.prisma.vendorAddress.findMany({
      where: { vendorId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    vendorId: string,
    dto: VendorAddressInputDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorEditable(vendorId);
    const data = addressData(dto);

    return this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);

      const existingPrimary = await tx.vendorAddress.findFirst({
        where: { vendorId, isPrimary: true },
        select: { id: true },
      });
      if (!existingPrimary) data.isPrimary = true;
      if (data.isPrimary && existingPrimary) {
        await tx.vendorAddress.update({
          where: { id: existingPrimary.id },
          data: { isPrimary: false },
        });
      }

      const address = await tx.vendorAddress.create({ data: { vendorId, ...data } });
      if (address.isPrimary) await syncVendorMirrors(tx, vendorId, { address: true });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.address.create',
          entityType: 'VendorAddress',
          entityId: address.id,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Added address ${describe(address)}${address.isPrimary ? ' (primary)' : ''}`,
          after: auditFields(address),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );

      return address;
    });
  }

  async update(
    vendorId: string,
    addressId: string,
    dto: UpdateVendorAddressDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    await this.assertVendorEditable(vendorId);
    const existing = await this.prisma.vendorAddress.findFirst({
      where: { id: addressId, vendorId },
    });
    if (!existing) throw new NotFoundException('Address was not found for this vendor.');

    if (dto.addressLine1 !== undefined && (!dto.addressLine1 || !dto.addressLine1.trim())) {
      throw new BadRequestException('Address line 1 is required.');
    }
    if (dto.isPrimary === false && existing.isPrimary) {
      throw new BadRequestException(
        'A vendor always has one primary address. Mark another address as primary instead.',
      );
    }

    const data: Prisma.VendorAddressUpdateInput = {
      ...(dto.addressType !== undefined && dto.addressType !== null
        ? { addressType: dto.addressType }
        : {}),
      ...(dto.label !== undefined ? { label: cleanOptional(dto.label) ?? null } : {}),
      ...(dto.addressLine1 !== undefined ? { addressLine1: dto.addressLine1.trim() } : {}),
      ...(dto.addressLine2 !== undefined ? { addressLine2: cleanOptional(dto.addressLine2) ?? null } : {}),
      ...(dto.city !== undefined ? { city: cleanOptional(dto.city) ?? null } : {}),
      ...(dto.state !== undefined ? { state: cleanOptional(dto.state) ?? null } : {}),
      ...(dto.postalCode !== undefined ? { postalCode: cleanOptional(dto.postalCode) ?? null } : {}),
      ...(dto.country !== undefined ? { country: cleanOptional(dto.country) ?? 'India' } : {}),
      ...(dto.isPrimary === true ? { isPrimary: true } : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);

      if (dto.isPrimary === true && !existing.isPrimary) {
        await tx.vendorAddress.updateMany({
          where: { vendorId, isPrimary: true, id: { not: addressId } },
          data: { isPrimary: false },
        });
      }

      const updated = await tx.vendorAddress.update({ where: { id: addressId }, data });
      if (updated.isPrimary) await syncVendorMirrors(tx, vendorId, { address: true });

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.address.update',
          entityType: 'VendorAddress',
          entityId: addressId,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Updated address ${describe(updated)}`,
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
    addressId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    await this.assertVendorEditable(vendorId);
    const existing = await this.prisma.vendorAddress.findFirst({
      where: { id: addressId, vendorId },
    });
    if (!existing) throw new NotFoundException('Address was not found for this vendor.');

    await this.prisma.$transaction(async (tx) => {
      await lockVendorRow(tx, vendorId);
      await tx.vendorAddress.delete({ where: { id: addressId } });

      if (existing.isPrimary) {
        // Promote the oldest remaining address so the vendor keeps a primary.
        const next = await tx.vendorAddress.findFirst({
          where: { vendorId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) {
          await tx.vendorAddress.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
        await syncVendorMirrors(tx, vendorId, { address: true });
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'vendor.address.delete',
          entityType: 'VendorAddress',
          entityId: addressId,
          parentEntityType: VENDOR_ENTITY,
          parentEntityId: vendorId,
          summary: `Removed address ${describe(existing)}`,
          before: auditFields(existing),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
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
      throw new BadRequestException('This vendor is archived. Restore it before editing addresses.');
    }
  }
}
