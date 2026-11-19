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
import { ProductsService } from './products.service';
import {
  CreateProductCategoryDto,
  CreateProductDto,
  QueryProductsDto,
  UpdateProductDto,
} from './dto/product.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
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
  })
  async findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'List product categories' })
  async listCategories() {
    return this.productsService.listCategories();
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

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Product detail with the vendors who supply it' })
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
  @ApiOperation({ summary: 'Archive a product' })
  async archive(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productsService.archive(id, user);
  }
}
