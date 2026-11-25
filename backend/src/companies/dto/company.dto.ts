import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class CreateCompanyDto {
  @ApiProperty({ example: 'Dell' })
  @IsString()
  @IsNotEmpty({ message: 'Brand name is required' })
  @MaxLength(150)
  @Transform(trim)
  name!: string;

  @ApiPropertyOptional({ example: 'DELL', description: 'Short code used in product codes' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  website?: string;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  // Validated whenever present, so `null` or a blank name is a 400.
  @ValidateIf((o: UpdateCompanyDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export const COMPANY_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

export class QueryCompaniesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by brand name or code' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ enum: COMPANY_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(COMPANY_SORT_FIELDS)
  sortBy: (typeof COMPANY_SORT_FIELDS)[number] = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override sortDir: 'asc' | 'desc' = 'asc';
}
