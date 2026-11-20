import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { DocumentKind, InvoicePaymentState, PaymentStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullable = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const blank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
/** Money stays a string end to end (no float rounding). */
const moneyIn = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value);
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const CODE = /^[A-Z][A-Z0-9_]{1,29}$/;

class PaymentFieldsDto {
  @ApiProperty({ example: '2026-11-20' }) @IsDateString() paymentDate!: string;
  @ApiProperty({ example: '30000.00', description: 'Greater than zero; at most 2 decimals' })
  @Transform(moneyIn)
  @Matches(MONEY, { message: 'Amount must be a number with up to 2 decimals' })
  amount!: string;
  @ApiProperty({ example: 'BANK_TRANSFER', description: 'An active method code from the payment settings' })
  @IsString() @Matches(CODE, { message: 'Unknown payment method' }) method!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) transactionReference?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(100) bankReference?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsUUID('4') receivedById?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional({ default: false, description: 'Proceed although another payment has the same transaction reference' })
  @IsOptional() @IsBoolean() confirmDuplicateReference?: boolean;
}

export class CreatePaymentDto extends PaymentFieldsDto {
  @ApiProperty() @IsUUID('4') customerId!: string;
  @ApiProperty({ description: 'The final invoice this payment settles (single-invoice allocation)' }) @IsUUID('4') finalInvoiceId!: string;
  @ApiPropertyOptional({ description: "Must equal the invoice's currency (no conversion)" })
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class UpdatePaymentDto extends PaymentFieldsDto {}

export class PaymentReasonDto {
  @ApiPropertyOptional({ description: 'Required to reject or reverse' })
  @IsOptional() @IsString() @MaxLength(2000) @Transform(blank) reason?: string;
}

export const PAYMENT_SORT_FIELDS = ['receiptNumber', 'paymentDate', 'amount', 'status', 'createdAt'] as const;

export class QueryPaymentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Receipt no., invoice no., customer, transaction or bank reference' })
  @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @ApiPropertyOptional({ enum: PaymentStatus, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray() @IsEnum(PaymentStatus, { each: true }) status?: PaymentStatus[];
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') finalInvoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(CODE) method?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMin?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(MONEY) amountMax?: string;
  @ApiPropertyOptional({ enum: PAYMENT_SORT_FIELDS, default: 'createdAt' }) @IsOptional() @IsIn(PAYMENT_SORT_FIELDS) sortBy: (typeof PAYMENT_SORT_FIELDS)[number] = 'createdAt';
}

export class EligibleInvoicesQueryDto {
  @ApiProperty() @IsUUID('4') customerId!: string;
}

export class PaymentReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(CODE) method?: string;
}

export class PaymentMethodDto {
  @ApiProperty({ example: 'BANK_TRANSFER' }) @IsString() @Matches(CODE, { message: 'Method codes are UPPER_CASE letters, digits and _' }) code!: string;
  @ApiProperty({ example: 'Bank Transfer' }) @IsString() @MinLength(1) @MaxLength(50) @Transform(trim) label!: string;
  @ApiProperty() @IsBoolean() active!: boolean;
}

export class PaymentSettingsDto {
  @ApiProperty({ type: [PaymentMethodDto] })
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PaymentMethodDto) methods!: PaymentMethodDto[];
  @ApiProperty({ type: [String], description: 'Method codes verified automatically when recorded by a user who may verify (empty = never)' })
  @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) autoVerifyMethods!: string[];
}

export const PAYMENT_UPLOAD_KINDS = [DocumentKind.PAYMENT_PROOF] as const;
export class UploadPaymentDocumentDto {
  @ApiPropertyOptional({ enum: PAYMENT_UPLOAD_KINDS }) @IsOptional() @IsIn(PAYMENT_UPLOAD_KINDS) kind?: (typeof PAYMENT_UPLOAD_KINDS)[number];
}

export { InvoicePaymentState };
