import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import type { VendorDocumentKind } from './dto/vendor-children.dto';

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
}

/**
 * Vendor-scoped view of the shared document store.
 *
 * Every operation checks that the document actually belongs to the vendor in
 * the URL, so a valid document id from another vendor (or a product) can
 * never be read, replaced or removed through this vendor's routes.
 */
@Injectable()
export class VendorDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {}

  async list(vendorId: string) {
    await this.assertVendor(vendorId, { allowArchived: true });
    return this.documentsService.listForVendor(vendorId);
  }

  async upload(
    vendorId: string,
    file: IncomingFile | undefined,
    kind: VendorDocumentKind | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertVendor(vendorId);

    return this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        kind: kind ?? DocumentKind.VENDOR_OTHER,
        vendorId,
      },
      actor,
    );
  }

  /**
   * Uploads a new version and archives the old one in one transaction. The
   * old file is kept in storage and linked from the new row for audit.
   */
  async replace(
    vendorId: string,
    documentId: string,
    file: IncomingFile | undefined,
    kind: VendorDocumentKind | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded.');
    await this.assertVendor(vendorId);
    const current = await this.assertOwned(vendorId, documentId);

    return this.documentsService.upload(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        kind: kind ?? current.kind,
        vendorId,
        replacesDocumentId: current.id,
      },
      actor,
    );
  }

  async remove(vendorId: string, documentId: string, actor: AuthenticatedUser) {
    await this.assertVendor(vendorId);
    await this.assertOwned(vendorId, documentId);
    return this.documentsService.archive(documentId, actor);
  }

  async open(
    vendorId: string,
    documentId: string,
    actor: AuthenticatedUser,
    preview: boolean,
  ) {
    await this.assertOwned(vendorId, documentId);
    return this.documentsService.openForDownload(documentId, actor, { preview });
  }

  private async assertOwned(vendorId: string, documentId: string) {
    const document = await this.documentsService.findActive(documentId);
    if (document.vendorId !== vendorId) {
      // Same response as a missing document: do not confirm it exists.
      throw new NotFoundException(`Document ${documentId} was not found`);
    }
    return document;
  }

  private async assertVendor(
    vendorId: string,
    options: { allowArchived?: boolean } = {},
  ): Promise<void> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, archivedAt: true },
    });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} was not found`);
    if (vendor.archivedAt && !options.allowArchived) {
      throw new BadRequestException('This vendor is archived. Restore it before changing documents.');
    }
  }
}
