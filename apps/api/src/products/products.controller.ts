import {
  BadRequestException,
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
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ProductsService } from './products.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  MapProductVendorDto,
  ProductLookupQueryDto,
  QueryProductsDto,
  StatusDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { UpdateVendorProductDto } from '../vendors/dto/mapping.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import { toCsv } from '../common/utils/csv';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });

const imageBody = {
  schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
};

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // --- Collection routes (declared before :id) ------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({
    summary: 'Search, filter, sort and paginate products',
    description:
      'search matches product name/code/SKU, brand, model name/number/code and mapped vendor names. ' +
      'Filters combine. With stock tracking on, rows also carry on-hand figures.',
  })
  async findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Dashboard figures counted from live records' })
  async summary() {
    return this.productsService.summary();
  }

  @Get('lookup')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({
    summary: 'Active products with active models, for other modules',
    description: 'Selector for enquiry / quotation / PI lines. Filter by vendorId for what a vendor supplies.',
  })
  async lookup(@Query() query: ProductLookupQueryDto) {
    return this.productsService.lookup(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.PRODUCT_EXPORT)
  @ApiOperation({ summary: 'Export the filtered catalogue as CSV' })
  async export(@Query() query: QueryProductsDto, @Res() response: Response): Promise<void> {
    const { products, balances, trackingEnabled } = await this.productsService.findAllForExport(query);

    const csv = toCsv(
      products.map((product) => {
        const row: Record<string, unknown> = {
          'Product ID': product.productCode,
          SKU: product.sku ?? '',
          'Product Name': product.name,
          Brand: product.company.name,
          Category: product.category?.name ?? '',
          Models: product.models.map((m) => `${m.modelName} (${m.modelNumber})`).join('; '),
          'Model Count': product.models.length,
          Vendors: product.vendors.map((v) => v.vendor.businessName).join('; '),
          Description: product.description ?? '',
          Status: product.isActive ? 'Active' : 'Inactive',
          'Created At': product.createdAt.toISOString(),
        };
        // Stock columns only exist when quantities are tracked; zeros would
        // read as "nothing in stock" rather than "not tracked".
        if (trackingEnabled) {
          row['On Hand'] = balances.get(product.id) ?? 0;
          row['Reorder Level'] = product.reorderLevel ?? '';
        }
        return row;
      }),
    );

    const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send('﻿' + csv);
  }

  // --- Categories -----------------------------------------------------------

  @Get('categories')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List product categories' })
  async listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.productsService.listCategories(includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Create a product category' })
  async createCategory(@Body() dto: CreateProductCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.createCategory(dto, user);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Rename or deactivate a product category' })
  async updateCategory(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updateCategory(id, dto, user);
  }

  @Delete('categories/:id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Permanently delete a product category that no product uses' })
  deleteCategory(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.productsService.deleteCategory(id, user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({
    summary: 'Create a product (optionally with its first models)',
    description: 'Brand must exist in the shared brand master. A brand cannot have two products with the same name.',
  })
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.create(dto, user, contextOf(request));
  }

  // --- Single product -------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Product profile: models, vendors (with model mappings), documents, stock' })
  async findOne(@Param('id', uuid()) id: string) {
    return this.productsService.findOne(id);
  }

  @Get(':id/activity')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Activity history of the product, its models, documents and vendor mappings' })
  async activity(@Param('id', uuid()) id: string, @Query() pagination: PaginationQueryDto) {
    return this.productsService.activity(id, pagination);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Update product details (send null to clear a field)' })
  async update(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.productsService.update(id, dto, user, contextOf(request));
  }

  @Patch(':id/status')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Activate or deactivate a product' })
  async setStatus(
    @Param('id', uuid()) id: string,
    @Body() dto: StatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.productsService.setStatus(id, dto, user, contextOf(request));
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.PRODUCT_ARCHIVE)
  @ApiOperation({ summary: 'Archive a product', description: 'Refused while the product still has stock on hand.' })
  async archive(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.archive(id, user, contextOf(request));
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.PRODUCT_ARCHIVE)
  @ApiOperation({ summary: 'Restore an archived product' })
  async restore(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    return this.productsService.restore(id, user, contextOf(request));
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete an unreferenced product',
    description: 'Refused (409) while vendor mappings, stock movements or documents exist.',
  })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.productsService.remove(id, user, contextOf(request));
  }

  // --- Vendor mappings --------------------------------------------------------

  @Get(':id/vendors')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ, PERMISSIONS.VENDOR_READ)
  @ApiOperation({ summary: 'Vendors supplying this product, with model mappings' })
  async listVendors(@Param('id', uuid()) id: string) {
    return this.productsService.listVendors(id);
  }

  @Post(':id/vendors')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_VENDORS)
  @ApiOperation({
    summary: 'Map a vendor to this product (optionally to specific models)',
    description:
      'The vendor must already be mapped to the product brand; otherwise 409 VENDOR_BRAND_NOT_MAPPED ' +
      'unless mapBrand=true and the user may manage vendor brands.',
  })
  async mapVendor(
    @Param('id', uuid()) id: string,
    @Body() dto: MapProductVendorDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.productsService.mapVendor(id, dto, user, contextOf(request));
  }

  @Patch(':id/vendors/:vendorId')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_VENDORS)
  @ApiOperation({ summary: 'Update a vendor mapping: models, SKU, lead time, preferred flag, status' })
  async updateVendorMapping(
    @Param('id', uuid()) id: string,
    @Param('vendorId', uuid()) vendorId: string,
    @Body() dto: UpdateVendorProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.productsService.updateVendorMapping(id, vendorId, dto, user, contextOf(request));
  }

  @Delete(':id/vendors/:vendorId')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_VENDORS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a vendor mapping (the vendor and product are not changed)' })
  async unmapVendor(
    @Param('id', uuid()) id: string,
    @Param('vendorId', uuid()) vendorId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.productsService.unmapVendor(id, vendorId, user, contextOf(request));
  }

  // --- Product image ----------------------------------------------------------

  @Post(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(imageBody)
  @ApiOperation({ summary: 'Set or replace the product image (previous image is archived)' })
  async setImage(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    return this.productsService.setImage(id, { buffer: file.buffer, originalFilename: file.originalname }, user);
  }

  @Delete(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE_DOCUMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the product image' })
  async removeImage(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.productsService.removeImage(id, user);
  }
}
