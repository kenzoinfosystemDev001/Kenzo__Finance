import { BadRequestException } from '@nestjs/common';
import { Prisma, VendorAddressType, VendorContactType } from '@prisma/client';
import type { Request } from 'express';
import {
  cleanOptional,
  normalizeEmail,
  normalizePhone,
} from '../common/utils/normalize';
import type { RequestContext } from '../auth/auth.service';
import type {
  VendorAddressInputDto,
  VendorContactInputDto,
} from './dto/create-vendor.dto';

/**
 * Helpers shared by the vendor, contact and address services, so the rules
 * for "what is primary" and "what the vendor row mirrors" live in one place.
 */

export const VENDOR_ENTITY = 'Vendor';

export function contextOf(request: Request): RequestContext {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

/** Column values for a contact row, normalised the same way everywhere. */
export function contactData(dto: VendorContactInputDto) {
  return {
    contactType: dto.contactType ?? VendorContactType.GENERAL,
    name: dto.name.trim(),
    designation: cleanOptional(dto.designation) ?? null,
    email: normalizeEmail(dto.email) ?? null,
    alternateEmail: normalizeEmail(dto.alternateEmail) ?? null,
    phone: normalizePhone(dto.phone) ?? null,
    alternatePhone: normalizePhone(dto.alternatePhone) ?? null,
    isPrimary: dto.isPrimary ?? false,
    notes: cleanOptional(dto.notes) ?? null,
  };
}

/** Column values for an address row. */
export function addressData(dto: VendorAddressInputDto) {
  return {
    addressType: dto.addressType ?? VendorAddressType.OFFICE,
    label: cleanOptional(dto.label) ?? null,
    addressLine1: dto.addressLine1.trim(),
    addressLine2: cleanOptional(dto.addressLine2) ?? null,
    city: cleanOptional(dto.city) ?? null,
    state: cleanOptional(dto.state) ?? null,
    postalCode: cleanOptional(dto.postalCode) ?? null,
    country: cleanOptional(dto.country) ?? 'India',
    isPrimary: dto.isPrimary ?? false,
  };
}

/**
 * Validates and completes primary flags for contacts submitted together.
 *
 * - Two primaries of the same contact type is a client error, not something
 *   to resolve silently by picking one.
 * - Each contact type with no primary gets its first contact as primary, so
 *   every type in use has a definite main contact.
 */
export function resolveContactPrimaries<T extends { contactType: VendorContactType; isPrimary: boolean }>(
  contacts: T[],
): T[] {
  const seen = new Set<VendorContactType>();
  for (const contact of contacts) {
    if (!contact.isPrimary) continue;
    if (seen.has(contact.contactType)) {
      throw new BadRequestException(
        `Only one primary contact is allowed per contact type (${contact.contactType.toLowerCase()}).`,
      );
    }
    seen.add(contact.contactType);
  }

  // Every contact type that has contacts gets a primary (the first of that
  // type), matching the rule the contacts service enforces on later edits.
  return contacts.map((contact) => {
    if (contact.isPrimary || seen.has(contact.contactType)) return contact;
    seen.add(contact.contactType);
    return { ...contact, isPrimary: true };
  });
}

/** Exactly one primary address: first one when none flagged, error when several. */
export function resolveAddressPrimaries<T extends { isPrimary: boolean }>(addresses: T[]): T[] {
  const primaries = addresses.filter((address) => address.isPrimary).length;
  if (primaries > 1) {
    throw new BadRequestException('Only one address can be the primary address.');
  }
  if (addresses.length > 0 && primaries === 0) {
    return addresses.map((address, index) => ({ ...address, isPrimary: index === 0 }));
  }
  return addresses;
}

/**
 * Serialises concurrent writes to one vendor's child rows. Primary-flag
 * invariants ("one primary per type") are check-then-write, so two parallel
 * requests must not both pass the check.
 */
export async function lockVendorRow(
  tx: Prisma.TransactionClient,
  vendorId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "vendors" WHERE "id" = ${vendorId}::uuid FOR UPDATE`;
}

/**
 * Refreshes the denormalised copies on the vendor row from the authoritative
 * child tables: contactPerson from the primary contact (GENERAL first), and
 * the address columns from the primary address.
 */
export async function syncVendorMirrors(
  tx: Prisma.TransactionClient,
  vendorId: string,
  what: { contact?: boolean; address?: boolean },
): Promise<void> {
  const data: Prisma.VendorUncheckedUpdateInput = {};

  if (what.contact) {
    // Enum order puts GENERAL first, so the general primary wins when present.
    const primary = await tx.vendorContact.findFirst({
      where: { vendorId, isPrimary: true },
      orderBy: { contactType: 'asc' },
      select: { name: true },
    });
    data.contactPerson = primary?.name ?? null;
  }

  if (what.address) {
    const primary = await tx.vendorAddress.findFirst({
      where: { vendorId, isPrimary: true },
    });
    data.addressLine1 = primary?.addressLine1 ?? null;
    data.addressLine2 = primary?.addressLine2 ?? null;
    data.city = primary?.city ?? null;
    data.state = primary?.state ?? null;
    data.postalCode = primary?.postalCode ?? null;
    data.country = primary?.country ?? 'India';
  }

  if (Object.keys(data).length > 0) {
    await tx.vendor.update({ where: { id: vendorId }, data });
  }
}
