import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@kenzoinfosystems.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @ApiProperty({ example: 'your-password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(256)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'New password must be at least 12 characters' })
  @MaxLength(256)
  newPassword!: string;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expiresIn!: number;
}
