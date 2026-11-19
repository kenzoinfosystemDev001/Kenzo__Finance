import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto';

/**
 * Every field optional, minus the create-only fields.
 *
 * `contacts` is excluded because replacing a nested collection through a PATCH
 * is ambiguous (replace all? merge? delete missing?). Contacts are managed
 * through their own endpoints instead.
 */
export class UpdateVendorDto extends PartialType(
  OmitType(CreateVendorDto, [
    'contacts',
    'companyIds',
    'ocrJobId',
    'confirmPossibleDuplicate',
  ] as const),
) {}
