import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VendorStatus } from '@prisma/client';
import { CreateVendorDto } from './create-vendor.dto';

/**
 * Every scalar field optional; send `null` to clear one.
 *
 * Nested collections are excluded because replacing a collection through a
 * PATCH is ambiguous (replace all? merge? delete missing?). Contacts,
 * addresses, brands, products and documents each have their own endpoints so
 * every change is validated and audited individually.
 *
 * `status` is excluded too: activation is a separately permissioned action
 * (PATCH /vendors/:id/status, vendor.deactivate).
 */
export class UpdateVendorDto extends PartialType(
  OmitType(CreateVendorDto, [
    'contacts',
    'addresses',
    'companyIds',
    'productIds',
    'ocrJobId',
    'confirmPossibleDuplicate',
    'status',
  ] as const),
) {}

export class UpdateVendorStatusDto {
  @ApiProperty({ enum: VendorStatus })
  @IsEnum(VendorStatus)
  status!: VendorStatus;

  @ApiPropertyOptional({ description: 'Why the vendor is being (de)activated; kept in the audit log' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  reason?: string;
}

export class ArchiveVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  reason?: string;
}
