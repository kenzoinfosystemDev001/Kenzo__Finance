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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ProductsService } from './products.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  QueryProductsDto,
  UpdateProductCategoryDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import { toCsv } from '../common/utils/csv';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({
    summary: 'Search products by name, model, brand, design number or category',
    description:
      'Multiple filters combine. When stock tracking is on, each row also ' +
      'carries on-hand quantity and low/out-of-stock flags.',
  })
  async findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.PRODUCT_EXPORT)
  @ApiOperation({ summary: 'Export the filtered catalogue as CSV' })
  async export(
    @Query() query: QueryProductsDto,
    @Res() response: Response,
  ): Promise<void> {
    const { products, balances, trackingEnabled } =
      await this.productsService.findAllForExport(query);

    const csv = toCsv(
      products.map((product) => {
        const specs = product.specifications as Record<string, string> | null;

        const row: Record<string, unknown> = {
          'Product Code': product.productCode,
          'Product Name': product.name,
          Brand: product.company.name,
          'Model Number': product.modelNumber,
          'Design Number': product.designNumber ?? '',
          Category: product.category?.name ?? '',
          Description: product.description ?? '',
          Specifications: specs
            ? Object.entries(specs)
                .map(([key, value]) => `${key}: ${value}`)
                .join('; ')
            : '',
          Vendors: product.vendors.map((v) => v.vendor.businessName).join('; '),
          Status: product.isActive ? 'Active' : 'Inactive',
          'Created At': product.createdAt.toISOString(),
        };

        // Only emit stock columns when quantities actually exist; a column of
        // zeros would read as "nothing in stock" rather than "not tracked".
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

  // --- Categories (declared before :id so they are not read as an id) -------

  @Get('categories')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List product categories' })
  async listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.productsService.listCategories(includeInactive === 'true');
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Create a product category' })
  async createCategory(
    @Body() dto: CreateProductCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.createCategory(dto, user);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Rename or deactivate a product category' })
  async updateCategory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.updateCategory(id, dto, user);
  }

  // --- Single product -------------------------------------------------------

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({
    summary: 'Product detail with specifications, vendors and stock position',
  })
  async findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_CREATE)
  @ApiOperation({ summary: 'Create a product' })
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @ApiOperation({ summary: 'Update a product' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.PRODUCT_ARCHIVE)
  @ApiOperation({
    summary: 'Archive a product',
    description: 'Refused while the product still has stock on hand.',
  })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.archive(id, user);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.PRODUCT_ARCHIVE)
  @ApiOperation({ summary: 'Restore an archived product' })
  async restore(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.restore(id, user);
  }

  // --- Catalogue image ------------------------------------------------------

  @Post(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE, PERMISSIONS.DOCUMENT_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Set the catalogue image',
    description:
      'Verified by file signature. Replacing an image archives the previous ' +
      'one rather than deleting it.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async setImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');

    return this.productsService.setImage(
      id,
      { buffer: file.buffer, originalFilename: file.originalname },
      user,
    );
  }

  @Delete(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the catalogue image' })
  async removeImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.productsService.removeImage(id, user);
  }
}
