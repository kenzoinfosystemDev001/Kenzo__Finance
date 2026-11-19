import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import type { Request } from 'express';
import { VendorContactsService } from './vendor-contacts.service';
import { VendorContactInputDto } from './dto/create-vendor.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

export class UpdateVendorContactDto extends PartialType(VendorContactInputDto) {}

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors/:vendorId/contacts')
export class VendorContactsController {
  constructor(private readonly contactsService: VendorContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'List contacts for a vendor' })
  async list(
    @Param('vendorId', new ParseUUIDPipe({ version: '4' })) vendorId: string,
  ) {
    return this.contactsService.list(vendorId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_UPDATE)
  @ApiOperation({ summary: 'Add a contact person to a vendor' })
  async create(
    @Param('vendorId', new ParseUUIDPipe({ version: '4' })) vendorId: string,
    @Body() dto: VendorContactInputDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contactsService.create(vendorId, dto, user, contextOf(request));
  }

  @Patch(':contactId')
  @RequirePermissions(PERMISSIONS.VENDOR_UPDATE)
  @ApiOperation({ summary: 'Update a vendor contact' })
  async update(
    @Param('vendorId', new ParseUUIDPipe({ version: '4' })) vendorId: string,
    @Param('contactId', new ParseUUIDPipe({ version: '4' })) contactId: string,
    @Body() dto: UpdateVendorContactDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contactsService.update(
      vendorId,
      contactId,
      dto,
      user,
      contextOf(request),
    );
  }

  @Delete(':contactId')
  @RequirePermissions(PERMISSIONS.VENDOR_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a vendor contact' })
  async remove(
    @Param('vendorId', new ParseUUIDPipe({ version: '4' })) vendorId: string,
    @Param('contactId', new ParseUUIDPipe({ version: '4' })) contactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.contactsService.remove(vendorId, contactId, user, contextOf(request));
  }
}

function contextOf(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}
