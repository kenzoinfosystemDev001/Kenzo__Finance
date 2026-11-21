import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullable = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const ROLE_CODE = /^[A-Z][A-Z0-9_]{1,49}$/;

export class CreateUserDto {
  @ApiProperty() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail({}, { message: 'A valid email address is required' }) @MaxLength(254) email!: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty({ message: 'Full name is required' }) @MaxLength(200) fullName!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) phone?: string | null;
  @ApiProperty({ minLength: 12, description: 'Initial password, shared with the user out of band. They can change it after signing in.' })
  @IsString() @MinLength(12, { message: 'Password must be at least 12 characters' }) @MaxLength(256) password!: string;
  @ApiProperty({ type: [String], example: ['SALES_MANAGER'] })
  @IsArray() @ArrayMinSize(1, { message: 'Assign at least one role' }) @ArrayMaxSize(20) @Matches(ROLE_CODE, { each: true }) roleCodes!: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @IsNotEmpty({ message: 'Full name is required' }) @MaxLength(200) fullName?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(nullable) @IsString() @MaxLength(50) phone?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMinSize(1, { message: 'Assign at least one role' }) @ArrayMaxSize(20) @Matches(ROLE_CODE, { each: true }) roleCodes?: string[];
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12, { message: 'Password must be at least 12 characters' }) @MaxLength(256) password!: string;
}

export class UserStatusReasonDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

export const USER_SORT_FIELDS = ['fullName', 'email', 'status', 'lastLoginAt', 'createdAt'] as const;

export class QueryUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name, email or phone' }) @IsOptional() @Transform(trim) @IsString() @MaxLength(200) search?: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsIn(Object.values(UserStatus)) status?: UserStatus;
  @ApiPropertyOptional() @IsOptional() @Matches(ROLE_CODE) roleCode?: string;
  @ApiPropertyOptional({ enum: USER_SORT_FIELDS, default: 'fullName' }) @IsOptional() @IsIn(USER_SORT_FIELDS) sortBy: (typeof USER_SORT_FIELDS)[number] = 'fullName';
}

export class RolePermissionsDto {
  @ApiProperty({ type: [String], example: ['vendor.read', 'vendor.create'] })
  @IsArray() @ArrayMaxSize(500) @Matches(/^[a-z][a-z_]*\.[a-z][a-z_]*$/, { each: true, message: 'Unknown permission code' }) permissionCodes!: string[];
}
