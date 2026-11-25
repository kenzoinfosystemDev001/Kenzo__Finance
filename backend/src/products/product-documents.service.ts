import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/** Document kinds a product can hold (images are managed separately). */
export const PRODUCT_DOCUMENT_KINDS = [
  DocumentKind.PRODUCT_BROCHURE,
  DocumentKind.PRODUCT_TECH_SPEC,
  DocumentKind.PRODUCT_DATASHEET,
  DocumentKind.PRODUCT_MANUAL,
  DocumentKind.PRODUCT_WARRANTY,
  DocumentKind.PRODUCT_OTHER,
] as const;

export type ProductDocumentKind = (typeof PRODUCT_DOCUMENT_KINDS)[number];

/**
 * Product-scoped view of the shared document store. Every operation checks
 * the document belongs to the product in the URL, so a document id from
 * another product or a vendor can never be reached through these routes.
 */
@Injectable()
export class ProductDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {}

  async list(productId: string) {
    await this.assertProduct(productId, true);
    return this.prisma.document.findMany({
      where: { productId, archivedAt: null, kind: { in: [...PRODUCT_DOCUMENT_KINDS] } },
      select: {
        id: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        replacesDocumentId: true,
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    productId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    kind: ProductDocumentKind | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertProduct(productId);
    return this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: kind ?? DocumentKind.PRODUCT_OTHER, productId },
      actor,
    );
  }

  async replace(
    productId: string,
    documentId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    kind: ProductDocumentKind | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertProduct(productId);
    const current = await this.assertOwned(productId, documentId);
    return this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        kind: kind ?? current.kind,
        productId,
        replacesDocumentId: current.id,
      },
      actor,
    );
  }

  async remove(productId: string, documentId: string, actor: AuthenticatedUser) {
    await this.assertOwned(productId, documentId);
    return this.documentsService.archive(documentId, actor);
  }

  /** Download / preview. Also serves product and model images of this product. */
  async open(productId: string, documentId: string, actor: AuthenticatedUser, preview: boolean) {
    const document = await this.documentsService.findActive(documentId);
    if (document.productId !== productId) throw new NotFoundException(`Document ${documentId} was not found`);
    return this.documentsService.openForDownload(documentId, actor, { preview });
  }

  /**
   * A product or model image of this product, for display. Images are part of
   * viewing the catalogue, so this needs only product.read, not the
   * document.download permission that guards datasheets and other files.
   */
  async openImage(productId: string, documentId: string, actor: AuthenticatedUser) {
    const document = await this.documentsService.findActive(documentId);
    if (document.productId !== productId || document.kind !== DocumentKind.PRODUCT_IMAGE) {
      throw new NotFoundException(`Image ${documentId} was not found`);
    }
    return this.documentsService.openForDownload(documentId, actor, { preview: true });
  }

  private async assertOwned(productId: string, documentId: string) {
    const document = await this.documentsService.findActive(documentId);
    if (document.productId !== productId || !(PRODUCT_DOCUMENT_KINDS as readonly string[]).includes(document.kind)) {
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document as typeof document & { kind: ProductDocumentKind };
  }

  private async assertProduct(productId: string, allowArchived = false) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, archivedAt: true } });
    if (!product) throw new NotFoundException(`Product ${productId} was not found`);
    if (product.archivedAt && !allowArchived) {
      throw new BadRequestException('This product is archived. Restore it before changing documents.');
    }
  }
}
