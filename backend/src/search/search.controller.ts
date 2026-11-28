import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { SearchService } from './search.service';

export class GlobalSearchQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q!: string;
}

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /**
   * Global search for the header. Any signed-in user may call it; each module
   * is searched only when the caller holds that module's read permission.
   */
  @Get()
  @RequirePermissions()
  // Search-as-you-type: generous, but bounded.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search records across every module the user can read' })
  async find(@Query() query: GlobalSearchQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.search.search(query.q, user);
  }
}
