import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { cleanOptional } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { RequestContext } from '../auth/auth.service';
import type { CreateProductModelDto, StatusDto, UpdateProductModelDto } from './dto/product.dto';
import { PRODUCT_ENTITY, ProductsService } from './products.service';
import { normalizeModelNumber, toSpecificationJson } from './product-specs';

const MODEL_ENTITY = 'ProductModel';

/** Models of a product: one product, many models, no duplicate products. */
@Injectable()
export class ProductModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly productsService: ProductsService,
  ) {}

  async list(productId: string) {
    await this.productsService.assertExists(productId);
    return this.prisma.productModel.findMany({
      where: { productId },
      include: {
        _count: { select: { vendors: true } },
        vendors: {
          select: { vendorProduct: { select: { vendor: { select: { id: true, businessName: true, vendorCode: true } } } } },
        },
      },
      orderBy: [{ isActive: 'desc' }, { modelName: 'asc' }],
    });
  }

  async create(productId: string, dto: CreateProductModelDto, actor: AuthenticatedUser) {
    const product = await this.productsService.assertExists(productId);
    if (product.archivedAt) throw new BadRequestException('This product is archived. Restore it first.');
    await this.productsService.assertModelNumberFree(product.companyId, dto.modelNumber, product.company.name);

    return this.prisma.$transaction(async (tx) => {
      const model = await this.productsService.createModelInTx(tx, productId, dto, actor);
      await tx.product.update({ where: { id: productId }, data: { updatedById: actor.id } });
      return model;
    });
  }

  async update(modelId: string, dto: UpdateProductModelDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadModel(modelId);
    if (existing.product.archivedAt) throw new BadRequestException('This product is archived. Restore it first.');

    if (dto.modelName !== undefined && !dto.modelName?.trim()) throw new BadRequestException('Model name is required.');
    if (dto.modelNumber !== undefined && !dto.modelNumber?.trim()) throw new BadRequestException('Model number is required.');
    if (dto.modelNumber && normalizeModelNumber(dto.modelNumber) !== existing.normalizedModelNumber) {
      await this.productsService.assertModelNumberFree(
        existing.product.companyId,
        dto.modelNumber,
        existing.product.company.name,
        undefined,
        modelId,
      );
    }

    const data: Prisma.ProductModelUpdateInput = {};
    if (dto.modelName) data.modelName = dto.modelName;
    if (dto.modelNumber) {
      data.modelNumber = dto.modelNumber;
      data.normalizedModelNumber = normalizeModelNumber(dto.modelNumber);
    }
    if (dto.description !== undefined) data.description = cleanOptional(dto.description) ?? null;
    if (dto.specifications !== undefined) data.specifications = toSpecificationJson(dto.specifications);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productModel.update({ where: { id: modelId }, data });
      await tx.product.update({ where: { id: existing.productId }, data: { updatedById: actor.id } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.model.update',
          entityType: MODEL_ENTITY,
          entityId: modelId,
          parentEntityType: PRODUCT_ENTITY,
          parentEntityId: existing.productId,
          summary: `Updated model ${updated.modelName} (${updated.modelNumber})`,
          before: { modelName: existing.modelName, modelNumber: existing.modelNumber, description: existing.description, specifications: existing.specifications },
          after: { modelName: updated.modelName, modelNumber: updated.modelNumber, description: updated.description, specifications: updated.specifications },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  async setStatus(modelId: string, dto: StatusDto, actor: AuthenticatedUser, context: RequestContext) {
    const existing = await this.loadModel(modelId);
    if (existing.isActive === dto.isActive) {
      throw new BadRequestException(`This model is already ${dto.isActive ? 'active' : 'inactive'}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productModel.update({ where: { id: modelId }, data: { isActive: dto.isActive } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: dto.isActive ? 'product.model.activate' : 'product.model.deactivate',
          entityType: MODEL_ENTITY,
          entityId: modelId,
          parentEntityType: PRODUCT_ENTITY,
          parentEntityId: existing.productId,
          summary: `${dto.isActive ? 'Activated' : 'Deactivated'} model ${existing.modelName}${dto.reason ? `: ${dto.reason}` : ''}`,
          before: { isActive: existing.isActive },
          after: { isActive: dto.isActive, reason: dto.reason ?? null },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Permanent delete, only while nothing refers to the model. Later modules
   * add their references (quotation lines, ...) to this check.
   */
  async remove(modelId: string, actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    const existing = await this.loadModel(modelId);
    const vendorMappings = await this.prisma.vendorProductModel.count({ where: { productModelId: modelId } });
    if (vendorMappings > 0) {
      throw new ConflictException({
        message: `This model is mapped to ${vendorMappings} vendor(s). Remove those mappings or deactivate the model instead.`,
        details: { vendorMappings },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productModel.delete({ where: { id: modelId } });
      if (existing.imageDocumentId) {
        await tx.document.update({ where: { id: existing.imageDocumentId }, data: { archivedAt: new Date() } });
      }
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.model.delete',
          entityType: MODEL_ENTITY,
          entityId: modelId,
          parentEntityType: PRODUCT_ENTITY,
          parentEntityId: existing.productId,
          summary: `Deleted model ${existing.modelName} (${existing.modelNumber}) - ${existing.modelCode}`,
          before: { modelName: existing.modelName, modelNumber: existing.modelNumber, modelCode: existing.modelCode },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  async setImage(modelId: string, file: { buffer: Buffer; originalFilename: string } | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    const model = await this.loadModel(modelId);
    if (model.product.archivedAt) throw new BadRequestException('This product is archived.');

    const document = await this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalFilename, kind: DocumentKind.PRODUCT_IMAGE, productId: model.productId },
      actor,
    );
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(document.mimeType)) {
      await this.documentsService.archive(document.id, actor);
      throw new BadRequestException('The model image must be a PNG, JPEG or WEBP image.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productModel.update({ where: { id: modelId }, data: { imageDocumentId: document.id } });
      if (model.imageDocumentId) {
        await tx.document.update({ where: { id: model.imageDocumentId }, data: { archivedAt: new Date() } });
      }
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: model.imageDocumentId ? 'product.model.image.replace' : 'product.model.image.set',
          entityType: MODEL_ENTITY,
          entityId: modelId,
          parentEntityType: PRODUCT_ENTITY,
          parentEntityId: model.productId,
          summary: `${model.imageDocumentId ? 'Replaced' : 'Set'} image of model ${model.modelName}`,
        },
        tx,
      );
    });
    return document;
  }

  async removeImage(modelId: string, actor: AuthenticatedUser): Promise<void> {
    const model = await this.loadModel(modelId);
    if (!model.imageDocumentId) throw new BadRequestException('This model has no image.');
    const imageId = model.imageDocumentId;

    await this.prisma.$transaction(async (tx) => {
      await tx.productModel.update({ where: { id: modelId }, data: { imageDocumentId: null } });
      await tx.document.update({ where: { id: imageId }, data: { archivedAt: new Date() } });
      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: 'product.model.image.remove',
          entityType: MODEL_ENTITY,
          entityId: modelId,
          parentEntityType: PRODUCT_ENTITY,
          parentEntityId: model.productId,
          summary: `Removed image of model ${model.modelName}`,
        },
        tx,
      );
    });
  }

  private async loadModel(modelId: string) {
    const model = await this.prisma.productModel.findUnique({
      where: { id: modelId },
      include: { product: { select: { id: true, companyId: true, archivedAt: true, company: { select: { name: true } } } } },
    });
    if (!model) throw new NotFoundException(`Model ${modelId} was not found`);
    return model;
  }
}
