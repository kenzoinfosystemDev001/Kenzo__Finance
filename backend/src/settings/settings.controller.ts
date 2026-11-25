import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString } from 'class-validator';
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SettingsService,
} from './settings.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

// Only the boolean business switches. Branding values go through /branding.
const WRITABLE_KEYS: string[] = Object.values(SETTING_KEYS);

export class UpdateSettingDto {
  @ApiProperty({ enum: WRITABLE_KEYS })
  @IsString()
  @IsIn(WRITABLE_KEYS, { message: 'Unknown or read-only setting key' })
  key!: string;

  @ApiProperty({ description: 'Both known settings are booleans today.' })
  @IsBoolean()
  value!: boolean;
}

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  // Readable by anyone signed in: the UI needs to know whether stock tracking
  // is on before it decides which screens to render.
  @RequirePermissions()
  @ApiOperation({ summary: 'Effective values of all known settings' })
  async getAll() {
    return { settings: await this.settingsService.getAll() };
  }

  @Patch()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Change a setting' })
  async update(
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(dto.key in SETTING_DEFAULTS) || !WRITABLE_KEYS.includes(dto.key)) {
      throw new BadRequestException('Unknown setting key.');
    }
    return this.settingsService.set(dto.key, dto.value, user);
  }
}
