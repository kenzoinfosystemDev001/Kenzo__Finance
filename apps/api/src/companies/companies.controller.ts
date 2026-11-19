import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import {
  CreateCompanyDto,
  QueryCompaniesDto,
  UpdateCompanyDto,
} from './dto/company.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('Brands / Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: 'Search brands/companies' })
  async findAll(@Query() query: QueryCompaniesDto) {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: 'Brand detail' })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANY_CREATE)
  @ApiOperation({ summary: 'Create a brand/company' })
  async create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_UPDATE)
  @ApiOperation({ summary: 'Update a brand/company' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.COMPANY_ARCHIVE)
  @ApiOperation({ summary: 'Archive a brand/company' })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.archive(id, user);
  }
}
