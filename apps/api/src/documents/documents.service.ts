import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentKind } from '@prisma/client';
import type { ReadStream } from 'node:fs';
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
  vendorId?: string;
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

    const stored = await this.storageService.save(input.buffer, {
      folder: 'vendors',
      originalFilename: `file.${detected.extension}`,
    });

    const document = await this.prisma.document.create({
      data: {
        kind: input.kind ?? DocumentKind.VENDOR_OTHER,
        originalFilename: this.sanitizeFilename(input.originalFilename),
        storageKey: stored.storageKey,
        mimeType: detected.mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        vendorId: input.vendorId ?? null,
        uploadedById: actor.id,
      },
      select: {
        id: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        vendorId: true,
        createdAt: true,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'document.upload',
      entityType: 'Document',
      entityId: document.id,
      summary: `Uploaded ${document.originalFilename} (${document.mimeType})`,
      after: {
        kind: document.kind,
        sizeBytes: document.sizeBytes,
        vendorId: document.vendorId,
      },
    });

    return document;
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
      select: {
        id: true,
        kind: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a stream for a permission-checked download. Nothing in the storage
   * root is statically served, so this is the only way out of storage.
   */
  async openForDownload(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{
    stream: ReadStream;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.archivedAt) {
      throw new NotFoundException(`Document ${id} was not found`);
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'document.download',
      entityType: 'Document',
      entityId: id,
      summary: `Downloaded ${document.originalFilename}`,
    });

    return {
      stream: this.storageService.createReadStream(document.storageKey),
      filename: document.originalFilename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
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
      summary: `Archived ${archived.originalFilename}`,
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
