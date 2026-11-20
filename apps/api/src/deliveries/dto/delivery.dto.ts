import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DeliveryStatus, TransportMode } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const nullable = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? null : value;

export class DeliveryItemDto {
  @ApiProperty() @IsUUID('4') invoiceItemId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10000) packageCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(trim) remarks?: string;
}

export class CreateDeliveryDto {
  @ApiProperty() @IsUUID('4') customerId!: string;
  @ApiProperty() @IsUUID('4') finalInvoiceId!: string;
  @ApiProperty() @IsDateString() deliveryDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedDate?: string;
  @ApiProperty() @IsString() @MaxLength(2000) @Transform(trim) deliveryAddress!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) contactPerson?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(nullable) contactNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) internalRemarks?: string | null;
  @ApiProperty({ type: [DeliveryItemDto] })
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items!: DeliveryItemDto[];
}

export class UpdateDeliveryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() deliveryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(trim) deliveryAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) contactPerson?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(nullable) contactNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) internalRemarks?: string | null;
  @ApiPropertyOptional({ type: [DeliveryItemDto] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items?: DeliveryItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) remarks?: string | null;
}

export class ScheduleDeliveryDto {
  @ApiProperty() @IsDateString() expectedDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) remarks?: string | null;
}

export class DispatchDeliveryDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() dispatchDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) @Transform(nullable) dispatchTime?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TransportMode) transportMode?: TransportMode;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) transporterName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(nullable) vehicleNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) driverName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(nullable) driverContact?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) courierCompany?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) trackingNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(nullable) lrGrNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) dispatchRemarks?: string | null;
}

export class TrackingDto {
  @ApiProperty() @IsString() @MaxLength(100) @Transform(trim) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(nullable) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) remarks?: string | null;
}

export class ConfirmDeliveryDto {
  @ApiProperty() @IsString() @MaxLength(200) @Transform(trim) receiverName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) @Transform(nullable) receiverContact?: string | null;
  @ApiProperty() @IsDateString() actualDeliveryDate!: string;
  @ApiProperty() @IsBoolean() deliveryConfirmation!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) remarks?: string | null;
}

export class FailureDto {
  @ApiProperty() @IsDateString() failureDate!: string;
  @ApiProperty() @IsString() @MaxLength(2000) @Transform(trim) failureReason!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() nextAttemptDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) @Transform(nullable) remarks?: string | null;
}

export class CancelDeliveryDto {
  @ApiProperty() @IsString() @MaxLength(2000) @Transform(trim) reason!: string;
}

export const DELIVERY_SORT_FIELDS = ['deliveryNumber','deliveryDate','expectedDate','actualDeliveryDate','dispatchDate','status','createdAt'] as const;
export class QueryDeliveriesDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') finalInvoiceId?: string;
  @ApiPropertyOptional() @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray() @IsEnum(DeliveryStatus,{each:true}) status?: DeliveryStatus[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) @Transform(trim) transporter?: string;
  @ApiPropertyOptional({enum:DELIVERY_SORT_FIELDS,default:'createdAt'}) @IsOptional() @IsIn(DELIVERY_SORT_FIELDS) sortBy:(typeof DELIVERY_SORT_FIELDS)[number]='createdAt';
}
