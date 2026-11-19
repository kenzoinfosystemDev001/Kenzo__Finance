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
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { Request, Response } from 'express';
import { ProductModelsService } from './product-models.service';
import {
  PRODUCT_DOCUMENT_KINDS,
  ProductDocumentsService,
  type ProductDocumentKind,
} from './product-documents.service';
import { CreateProductModelDto, StatusDto, UpdateProductModelDto } from './dto/product.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { sendStoredFile } from '../documents/send-stored-file';
import { ALLOWED_UPLOAD_DESCRIPTION } from '../common/utils/file-validation';
import { contextOf } from '../vendors/vendor-shared';

const uuid = () => new ParseUUIDPipe({ version: '4' });

export class UploadProductDocumentDto {
  @ApiPropertyOptional({ enum: PRODUCT_DOCUMENT_KINDS })
  @IsOptional()
  @IsIn(PRODUCT_DOCUMENT_KINDS, { message: 'Unknown product document type' })
  kind?: ProductDocumentKind;
}

const fileBody = (withKind: boolean) => ({
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
      ...(withKind ? { kind: { type: 'string', enum: [...PRODUCT_DOCUMENT_KINDS] } } : {}),
    },
  },
});

@ApiTags('Product models')
@ApiBearerAuth()
@Controller()
export class ProductModelsController {
  constructor(private readonly modelsService: ProductModelsService) {}

  @Get('products/:productId/models')
  @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  @ApiOperation({ summary: 'Models of a product, with the vendors mapped to each' })
  async list(@Param('productId', uuid()) productId: string) {
    return this.modelsService.list(productId);
  }

  @Post('products/:productId/models')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS)
  @ApiOperation({ summary: 'Add a model. The model number must be unique within the brand.' })
  async create(
    @Param('productId', uuid()) productId: string,
    @Body() dto: CreateProductModelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.modelsService.create(productId, dto, user);
  }

  @Patch('product-models/:id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS)
  @ApiOperation({ summary: 'Update a model (name, number, description, specifications)' })
  async update(
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateProductModelDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.modelsService.update(id, dto, user, contextOf(request));
  }

  @Patch('product-models/:id/status')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS)
  @ApiOperation({ summary: 'Activate or deactivate a model' })
  async setStatus(
    @Param('id', uuid()) id: string,
    @Body() dto: StatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.modelsService.setStatus(id, dto, user, contextOf(request));
  }

  @Delete('product-models/:id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS, PERMISSIONS.PRODUCT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a model', description: 'Refused (409) while any vendor is mapped to it.' })
  async remove(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser, @Req() request: Request) {
    await this.modelsService.remove(id, user, contextOf(request));
  }

  @Post('product-models/:id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS, PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody(false))
  @ApiOperation({ summary: 'Set or replace the model image (PNG/JPEG/WEBP)' })
  async setImage(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.modelsService.setImage(id, file && { buffer: file.buffer, originalFilename: file.originalname }, user);
  }

  @Delete('product-models/:id/image')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE_MODELS, PERMISSIONS.PRODUCT_DELETE_DOCUMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove the model image' })
  async removeImage(@Param('id', uuid()) id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.modelsService.removeImage(id, user);
  }
}

@ApiTags('Product documents')
@ApiBearerAuth()
@Controller('products/:productId/documents')
export class ProductDocumentsController {
  constructor(private readonly documentsService: ProductDocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_READ, PERMISSIONS.DOCUMENT_READ)
  @ApiOperation({ summary: 'Current documents of a product' })
  async list(@Param('productId', uuid()) productId: string) {
    return this.documentsService.list(productId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody(true))
  @ApiOperation({ summary: `Upload a product document (${ALLOWED_UPLOAD_DESCRIPTION})` })
  async upload(
    @Param('productId', uuid()) productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadProductDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.upload(productId, file, dto.kind, user);
  }

  @Post(':documentId/replace')
  @RequirePermissions(PERMISSIONS.PRODUCT_UPLOAD_DOCUMENTS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody(true))
  @ApiOperation({ summary: 'Replace a document; the old version is archived and linked' })
  async replace(
    @Param('productId', uuid()) productId: string,
    @Param('documentId', uuid()) documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadProductDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.replace(productId, documentId, file, dto.kind, user);
  }

  @Delete(':documentId')
  @RequirePermissions(PERMISSIONS.PRODUCT_DELETE_DOCUMENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a document (soft; kept for audit)' })
  async remove(
    @Param('productId', uuid()) productId: string,
    @Param('documentId', uuid()) documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.documentsService.remove(productId, documentId, user);
  }

  @Get(':documentId/content')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @ApiQuery({ name: 'preview', required: false, type: Boolean })
  @ApiOperation({ summary: 'Download or preview a product document or image' })
  async content(
    @Param('productId', uuid()) productId: string,
    @Param('documentId', uuid()) documentId: string,
    @Query('preview') preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    sendStoredFile(response, await this.documentsService.open(productId, documentId, user, preview === 'true'));
  }
}
