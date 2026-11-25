import { BadRequestException } from '@nestjs/common';
import { CustomerAddressType, Prisma } from '@prisma/client';
import { cleanOptional, normalizeEmail, normalizePhone } from '../common/utils/normalize';
import type { CustomerAddressInputDto, CustomerContactInputDto } from './dto/customer.dto';

export const CUSTOMER_ENTITY = 'Customer';

export const isIndia = (country: string | null | undefined) => /^(india|in|bharat)$/i.test((country ?? '').trim());

export function contactData(dto: CustomerContactInputDto) {
  return {
    name: dto.name.trim(),
    designation: cleanOptional(dto.designation) ?? null,
    department: cleanOptional(dto.department) ?? null,
    email: normalizeEmail(dto.email) ?? null,
    phone: normalizePhone(dto.phone) ?? null,
    alternatePhone: normalizePhone(dto.alternatePhone) ?? null,
    isPrimary: dto.isPrimary ?? false,
  };
}

export function addressData(dto: CustomerAddressInputDto) {
  return {
    addressType: dto.addressType,
    addressLine1: dto.addressLine1.trim(),
    addressLine2: cleanOptional(dto.addressLine2) ?? null,
    city: cleanOptional(dto.city) ?? null,
    state: cleanOptional(dto.state) ?? null,
    postalCode: cleanOptional(dto.postalCode) ?? null,
    country: cleanOptional(dto.country) ?? 'India',
    isDefault: dto.isDefault ?? false,
  };
}

/** Exactly one primary contact: two is an error, none makes the first primary. */
export function resolveContactPrimary<T extends { isPrimary: boolean }>(contacts: T[]): T[] {
  const primaries = contacts.filter((c) => c.isPrimary).length;
  if (primaries > 1) throw new BadRequestException('Only one contact can be the primary contact.');
  if (contacts.length && !primaries) return contacts.map((c, i) => ({ ...c, isPrimary: i === 0 }));
  return contacts;
}

/** At most one default per address type; the first of each type defaults when none is marked. */
export function resolveAddressDefaults<T extends { addressType: CustomerAddressType; isDefault: boolean }>(addresses: T[]): T[] {
  const byType = new Map<CustomerAddressType, T[]>();
  for (const address of addresses) byType.set(address.addressType, [...(byType.get(address.addressType) ?? []), address]);
  for (const [type, rows] of byType) {
    if (rows.filter((r) => r.isDefault).length > 1) {
      throw new BadRequestException(`Only one ${type.toLowerCase()} address can be the default.`);
    }
  }
  return addresses.map((address) => {
    const rows = byType.get(address.addressType)!;
    return rows.some((r) => r.isDefault) ? address : { ...address, isDefault: rows[0] === address };
  });
}

/** Serialises concurrent writes to one customer's child rows (primary/default flags). */
export async function lockCustomerRow(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE`;
}
