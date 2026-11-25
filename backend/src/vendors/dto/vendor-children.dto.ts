import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DocumentKind } from '@prisma/client';
import { VendorAddressInputDto, VendorContactInputDto } from './create-vendor.dto';

export class UpdateVendorContactDto extends PartialType(VendorContactInputDto) {}

export class UpdateVendorAddressDto extends PartialType(VendorAddressInputDto) {}

/** Document kinds that may be attached to a vendor. */
export const VENDOR_DOCUMENT_KINDS = [
  DocumentKind.VENDOR_VISITING_CARD,
  DocumentKind.VENDOR_GST_CERTIFICATE,
  DocumentKind.VENDOR_PAN,
  DocumentKind.VENDOR_REGISTRATION_CERTIFICATE,
  DocumentKind.VENDOR_AGREEMENT,
  DocumentKind.VENDOR_PRODUCT_CATALOGUE,
  DocumentKind.VENDOR_ONBOARDING,
  DocumentKind.VENDOR_OTHER,
] as const;

export type VendorDocumentKind = (typeof VENDOR_DOCUMENT_KINDS)[number];

export class VendorLookupQueryDto {
  @ApiPropertyOptional({ description: 'Name / code / GSTIN contains' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  search?: string;

  @ApiPropertyOptional({ description: 'Only vendors that supply this product' })
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ description: 'Only vendors that supply this brand' })
  @IsOptional()
  @IsUUID('4')
  companyId?: string;
}

export class UploadVendorDocumentDto {
  @ApiPropertyOptional({ enum: VENDOR_DOCUMENT_KINDS, default: DocumentKind.VENDOR_OTHER })
  @IsOptional()
  @IsIn(VENDOR_DOCUMENT_KINDS, { message: 'Unknown vendor document type' })
  kind?: VendorDocumentKind;
}
