import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SendQuotationEmailDto {
  @ApiProperty({ enum: ['CUSTOMER', 'VENDOR'] })
  @IsIn(['CUSTOMER', 'VENDOR'])
  recipientType!: 'CUSTOMER' | 'VENDOR';

  @ApiProperty({ description: 'Customer or vendor record the email is addressed to' })
  @IsUUID()
  recipientId!: string;

  @ApiProperty({ description: 'Address for this send only; the saved record is not changed' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid recipient email address.' })
  @MaxLength(254)
  toEmail!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'Add up to five CC addresses.' })
  @IsEmail({}, { each: true, message: 'Enter valid CC email addresses.' })
  @MaxLength(254, { each: true })
  ccEmails?: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  message?: string;

  /** Generated when the dialog opens. A repeated submit with the same key sends nothing new. */
  @ApiProperty({ minLength: 8, maxLength: 64 })
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;
}

export class RecipientSearchQueryDto {
  @IsIn(['CUSTOMER', 'VENDOR'])
  type!: 'CUSTOMER' | 'VENDOR';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
