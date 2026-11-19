import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentKind, Prisma } from '@prisma/client';
// Readable, not fs.ReadStream: a remote storage driver (Cloudinary, S3)
// streams over the network and never opens a file descriptor.
import type { Readable } from 'node:stream';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  ALLOWED_UPLOAD_DESCRIPTION,
  detectFileType,
} from '../common/utils/file-validation';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

export interface UploadInput {
  buffer: Buffer;
  originalFilename: string;
  kind?: DocumentKind;
  /** At most one owner is set; the column keeps referential integrity. */
  vendorId?: string;
  productId?: string;
  /** The current document this upload supersedes (replacement flow). */
  replacesDocumentId?: string;
}

/** Types a browser can render safely inline. Everything else downloads. */
const INLINE_PREVIEW_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function canPreviewInline(mimeType: string): boolean {
  return INLINE_PREVIEW_TYPES.has(mimeType);
}

const documentSummarySelect = {
  id: true,
  kind: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  vendorId: true,
  productId: true,
  replacesDocumentId: true,
  createdAt: true,
  uploadedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DocumentSelect;

/** Audit parent for a document: the record it is attached to, if any. */
function parentOf(document: { vendorId: string | null; productId: string | null }) {
  if (document.vendorId) return { parentEntityType: 'Vendor', parentEntityId: document.vendorId };
  if (document.productId) return { parentEntityType: 'Product', parentEntityId: document.productId };
  return {};
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async upload(input: UploadInput, actor: AuthenticatedUser) {
    const maxBytes = this.configService.get<number>('UPLOAD_MAX_BYTES', 10485760);

    if (input.buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    if (input.buffer.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the maximum size of ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    // Trust the bytes, not the declared MIME type or extension.
    const detected = detectFileType(input.buffer, input.originalFilename);
    if (!detected) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type. Allowed: ${ALLOWED_UPLOAD_DESCRIPTION}.`,
      );
    }

    if (input.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: input.vendorId },
        select: { id: true },
      });
      if (!vendor) throw new BadRequestException('The referenced vendor does not exist.');
    }

    if (input.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: input.productId },
        select: { id: true },
      });
      if (!product) throw new BadRequestException('The referenced product does not exist.');
    }

    const stored = await this.storageService.save(input.buffer, {
      folder: input.productId
        ? 'products'
        : input.kind === DocumentKind.BRANDING_IMAGE
          ? 'branding'
          : 'vendors',
      originalFilename: `file.${detected.extension}`,
      mimeType: detected.mimeType,
    });

    // The new row, the archiving of a replaced file and the audit entry
    // commit together, so a replacement can never leave two current files.
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          kind: input.kind ?? DocumentKind.VENDOR_OTHER,
          originalFilename: this.sanitizeFilename(input.originalFilename),
          storageKey: stored.storageKey,
          mimeType: detected.mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          vendorId: input.vendorId ?? null,
          productId: input.productId ?? null,
          replacesDocumentId: input.replacesDocumentId ?? null,
          uploadedById: actor.id,
        },
        select: documentSummarySelect,
      });

      let replacedName: string | null = null;
      if (input.replacesDocumentId) {
        const replaced = await tx.document.update({
          where: { id: input.replacesDocumentId },
          data: { archivedAt: new Date() },
          select: { originalFilename: true },
        });
        replacedName = replaced.originalFilename;
      }

      await this.auditService.record(
        {
          actorUserId: actor.id,
          action: input.replacesDocumentId ? 'document.replace' : 'document.upload',
          entityType: 'Document',
          entityId: document.id,
          ...parentOf(document),
          summary: replacedName
            ? `Replaced ${replacedName} with ${document.originalFilename}`
            : `Uploaded ${document.originalFilename} (${document.kind.replace(/_/g, ' ').toLowerCase()})`,
          after: {
            kind: document.kind,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            vendorId: document.vendorId,
            productId: document.productId,
            replacesDocumentId: document.replacesDocumentId,
          },
        },
        tx,
      );

      return document;
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        checksumSha256: true,
        vendorId: true,
        archivedAt: true,
        createdAt: true,
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });

    if (!document) throw new NotFoundException(`Document ${id} was not found`);
    return document;
  }

  async listForVendor(vendorId: string) {
    return this.prisma.document.findMany({
      where: { vendorId, archivedAt: null },
      select: documentSummarySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Current (non-archived) document metadata, used for ownership checks. */
  async findActive(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { ...documentSummarySelect, archivedAt: true },
    });
    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${id} was not found`);
    }
    return document;
  }

  /**
   * Returns a stream for a permission-checked download. Nothing in the storage
   * root is statically served, so this is the only way out of storage.
   */
  async openForDownload(
    id: string,
    actor: AuthenticatedUser,
    options: { preview?: boolean } = {},
  ): Promise<{
    stream: Readable;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    /** True only when a preview was asked for and the type is safe inline. */
    inline: boolean;
  }> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${id} was not found`);
    }

    const inline = Boolean(options.preview) && canPreviewInline(document.mimeType);

    await this.auditService.record({
      actorUserId: actor.id,
      action: inline ? 'document.preview' : 'document.download',
      entityType: 'Document',
      entityId: id,
      ...parentOf(document),
      summary: `${inline ? 'Previewed' : 'Downloaded'} ${document.originalFilename}`,
    });

    return {
      stream: await this.storageService.createReadStream(document.storageKey),
      filename: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      inline,
    };
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document) throw new NotFoundException(`Document ${id} was not found`);
    if (document.archivedAt) {
      throw new BadRequestException('This document is already archived.');
    }

    // Metadata is retained and the stored file is kept: a document referenced
    // by an OCR job or a vendor record must stay auditable.
    const archived = await this.prisma.document.update({
      where: { id },
      data: { archivedAt: new Date() },
      select: { id: true, originalFilename: true, archivedAt: true },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'document.archive',
      entityType: 'Document',
      entityId: id,
      ...parentOf(document),
      summary: `Removed ${archived.originalFilename}`,
    });

    return archived;
  }

  /** Strips path separators; the stored name is display-only metadata. */
  private sanitizeFilename(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').trim();
    const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '');
    return cleaned.slice(0, 255) || 'document';
  }
}
