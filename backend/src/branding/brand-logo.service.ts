import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../auth/auth.service';
import { detectFileType } from '../common/utils/file-validation';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/** Upper bound on the uploaded file, checked before any decoding. */
export const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MIN_EDGE = 128;
const MAX_EDGE = 4096;
const MAX_PIXELS = 16_000_000;
/** Stored size: large enough for crisp display at any size the app uses. */
const OUTPUT_EDGE = 512;
const KEY = 'primary';

export interface StoredLogo {
  data: Buffer;
  mimeType: string;
  sha256: string;
}

/**
 * The company logo, stored in the database (brand_logo). Output is always PNG
 * so transparency is kept; the file is decoded fully, resized to fit 512 px,
 * and re-encoded, which also drops any metadata.
 */
@Injectable()
export class BrandLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Null when no logo has been uploaded (the app then shows the bundled default). */
  async get(): Promise<StoredLogo | null> {
    const row = await this.prisma.brandLogo.findUnique({
      where: { key: KEY },
      select: { data: true, mimeType: true, sha256: true },
    });
    if (!row) return null;
    return { data: Buffer.from(row.data), mimeType: row.mimeType, sha256: row.sha256 };
  }

  async upload(
    file: { buffer: Buffer; originalname: string } | undefined,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<{ version: string }> {
    if (!file || file.buffer.length === 0) throw new BadRequestException('Choose an image to upload.');
    if (file.buffer.length > BRAND_LOGO_MAX_BYTES) {
      throw new PayloadTooLargeException('The logo must be 2 MB or smaller.');
    }

    const detected = detectFileType(file.buffer, file.originalname);
    if (!detected || !ACCEPTED_TYPES.has(detected.mimeType)) {
      throw new UnsupportedMediaTypeException('The logo must be a PNG, JPG or WEBP image.');
    }

    const { width, height } = await this.decodeCheck(file.buffer);
    if (width < MIN_EDGE || height < MIN_EDGE) {
      throw new BadRequestException(`The logo must be at least ${MIN_EDGE} x ${MIN_EDGE} pixels.`);
    }
    if (width > MAX_EDGE || height > MAX_EDGE) {
      throw new BadRequestException(`The logo must be no larger than ${MAX_EDGE} x ${MAX_EDGE} pixels.`);
    }

    const output = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });

    const sha256 = createHash('sha256').update(output.data).digest('hex');
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.brandLogo.findUnique({ where: { key: KEY }, select: { key: true } });
      await tx.brandLogo.upsert({
        where: { key: KEY },
        create: {
          key: KEY,
          data: output.data,
          mimeType: 'image/png',
          sizeBytes: output.data.length,
          width: output.info.width,
          height: output.info.height,
          sha256,
        },
        update: {
          data: output.data,
          mimeType: 'image/png',
          sizeBytes: output.data.length,
          width: output.info.width,
          height: output.info.height,
          sha256,
        },
      });
      await this.audit.record(
        {
          actorUserId: actor.id,
          action: before ? 'branding.logo.replaced' : 'branding.logo.added',
          entityType: 'BrandLogo',
          entityId: KEY,
          summary: 'Changed the company logo',
          after: { sizeBytes: output.data.length, width: output.info.width, height: output.info.height },
          ...context,
        },
        tx,
      );
    });

    return { version: sha256.slice(0, 16) };
  }

  /** Restores the bundled default logo. Idempotent. */
  async remove(actor: AuthenticatedUser, context: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.brandLogo.deleteMany({ where: { key: KEY } });
      if (removed.count > 0) {
        await this.audit.record(
          {
            actorUserId: actor.id,
            action: 'branding.logo.restored',
            entityType: 'BrandLogo',
            entityId: KEY,
            summary: 'Restored the default company logo',
            ...context,
          },
          tx,
        );
      }
    });
  }

  /** Reads the whole image to confirm it decodes; a valid header alone is not enough. */
  private async decodeCheck(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate().metadata();
      if (!meta.width || !meta.height) throw new Error('no dimensions');
      await sharp(buffer, { limitInputPixels: MAX_PIXELS }).rotate().raw().toBuffer();
      return { width: meta.width, height: meta.height };
    } catch {
      throw new UnsupportedMediaTypeException('The file is corrupted or is not a readable image.');
    }
  }
}

/** Throws the standard 404 when no logo is stored. */
export function requireLogo(logo: StoredLogo | null): StoredLogo {
  if (!logo) throw new NotFoundException('No company logo is set.');
  return logo;
}
