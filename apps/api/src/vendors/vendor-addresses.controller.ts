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
import type { Request } from 'express';
import { VendorAddressesService } from './vendor-addresses.service';
import { VendorAddressInputDto } from './dto/create-vendor.dto';
import { UpdateVendorAddressDto } from './dto/vendor-children.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { contextOf } from './vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });

@ApiTags('Vendor addresses')
@ApiBearerAuth()
@Controller('vendors/:vendorId/addresses')
export class VendorAddressesController {
  constructor(private readonly addressesService: VendorAddressesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'List addresses for a vendor' })
  async list(@Param('vendorId', uuid()) vendorId: string) {
    return this.addressesService.list(vendorId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_ADDRESSES)
  @ApiOperation({
    summary: 'Add an address',
    description: "A vendor's first address is always its primary address.",
  })
  async create(
    @Param('vendorId', uuid()) vendorId: string,
    @Body() dto: VendorAddressInputDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.addressesService.create(vendorId, dto, user, contextOf(request));
  }

  @Patch(':addressId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_ADDRESSES)
  @ApiOperation({ summary: 'Update an address' })
  async update(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('addressId', uuid()) addressId: string,
    @Body() dto: UpdateVendorAddressDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.addressesService.update(vendorId, addressId, dto, user, contextOf(request));
  }

  @Delete(':addressId')
  @RequirePermissions(PERMISSIONS.VENDOR_MANAGE_ADDRESSES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an address' })
  async remove(
    @Param('vendorId', uuid()) vendorId: string,
    @Param('addressId', uuid()) addressId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.addressesService.remove(vendorId, addressId, user, contextOf(request));
  }
}
