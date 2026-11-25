import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import { AuditService, type AuditEntry } from '../audit/audit.service';
import type { RequestContext } from '../auth/auth.service';
import { detectFileType } from '../common/utils/file-validation';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { assertCanManageUser } from '../users/user-rules';

/** Upper bound on the uploaded file, checked before any decoding. */
export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Accepted input formats. Confirmed from the bytes, never from the filename. */
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIN_SOURCE_EDGE = 128;
const MAX_SOURCE_EDGE = 6000;
/** Caps decoded pixels so a small file cannot expand into a huge bitmap. */
const MAX_SOURCE_PIXELS = 24_000_000;

/** Every stored photo is re-encoded to this square, so the avatar stays small. */
const OUTPUT_EDGE = 512;
const OUTPUT_MIME = 'image/webp';

export interface PhotoState {
  hasPhoto: boolean;
  /** Changes whenever the image changes. Used as the URL version and ETag. */
  version: string | null;
}

export interface StoredPhoto {
  data: Buffer;
  mimeType: string;
  sha256: string;
}

/** Version string derived from the content hash (short, URL-safe). */
export function photoVersion(sha256: string | null | undefined): string | null {
  return sha256 ? sha256.slice(0, 16) : null;
}

@Injectable()
export class ProfilePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Validates and stores a new photo for `targetId`. The file is confirmed as
   * a real JPEG, PNG or WebP by its signature and by a full decode, then
   * re-encoded, so no uploaded bytes (or metadata such as EXIF/GPS) are kept.
   */
  async upload(
    targetId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<PhotoState> {
    if (!file || file.buffer.length === 0) {
      throw new BadRequestException('Choose an image to upload.');
    }
    if (file.buffer.length > PROFILE_PHOTO_MAX_BYTES) {
      throw new PayloadTooLargeException('The profile photo must be 2 MB or smaller.');
    }

    const detected = detectFileType(file.buffer, file.originalname);
    if (!detected || !ACCEPTED_TYPES.has(detected.mimeType)) {
      throw new UnsupportedMediaTypeException('The profile photo must be a JPG, PNG or WEBP image.');
    }

    // Full decode: a file with a valid header but a broken body fails here.
    const meta = await this.readMetadata(file.buffer);
    const { width, height } = meta;
    if (width < MIN_SOURCE_EDGE || height < MIN_SOURCE_EDGE) {
      throw new BadRequestException(`The photo must be at least ${MIN_SOURCE_EDGE} x ${MIN_SOURCE_EDGE} pixels.`);
    }
    if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) {
      throw new BadRequestException(`The photo must be no larger than ${MAX_SOURCE_EDGE} x ${MAX_SOURCE_EDGE} pixels.`);
    }

    const output = await sharp(file.buffer, { limitInputPixels: MAX_SOURCE_PIXELS })
      .rotate() // apply EXIF orientation before the crop
      .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 88 })
      .toBuffer();

    const sha256 = createHash('sha256').update(output).digest('hex');
    const target = await this.requireTarget(targetId);
    this.assertCanWrite(actor, target);

    const isSelf = actor.id === targetId;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.userProfilePhoto.findUnique({ where: { userId: targetId }, select: { sha256: true } });
      await tx.userProfilePhoto.upsert({
        where: { userId: targetId },
        create: {
          userId: targetId,
          data: output,
          mimeType: OUTPUT_MIME,
          sizeBytes: output.length,
          width: OUTPUT_EDGE,
          height: OUTPUT_EDGE,
          sha256,
        },
        update: {
          data: output,
          mimeType: OUTPUT_MIME,
          sizeBytes: output.length,
          width: OUTPUT_EDGE,
          height: OUTPUT_EDGE,
          sha256,
        },
      });
      await this.record(
        {
          actorUserId: actor.id,
          action: before ? 'user.photo.replaced' : 'user.photo.added',
          entityType: 'User',
          entityId: targetId,
          summary: isSelf ? 'Changed own profile photo' : `Changed profile photo for ${target.email}`,
          after: { sizeBytes: output.length, width: OUTPUT_EDGE, height: OUTPUT_EDGE },
          ...context,
        },
        tx,
      );
    });

    return { hasPhoto: true, version: photoVersion(sha256) };
  }

  /** Removes the photo. Idempotent: removing when there is none succeeds. */
  async remove(targetId: string, actor: AuthenticatedUser, context: RequestContext): Promise<PhotoState> {
    const target = await this.requireTarget(targetId);
    this.assertCanWrite(actor, target);

    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.userProfilePhoto.deleteMany({ where: { userId: targetId } });
      if (removed.count > 0) {
        await this.record(
          {
            actorUserId: actor.id,
            action: 'user.photo.removed',
            entityType: 'User',
            entityId: targetId,
            summary: actor.id === targetId ? 'Removed own profile photo' : `Removed profile photo for ${target.email}`,
            ...context,
          },
          tx,
        );
      }
    });

    return { hasPhoto: false, version: null };
  }

  /** The stored image, for an authenticated viewer allowed to see this profile. */
  async read(targetId: string, actor: AuthenticatedUser): Promise<StoredPhoto> {
    if (actor.id !== targetId && !actor.permissions.includes(PERMISSIONS.USER_READ)) {
      throw new ForbiddenException('You do not have permission to view this profile photo.');
    }
    await this.requireTarget(targetId);

    const photo = await this.prisma.userProfilePhoto.findUnique({
      where: { userId: targetId },
      select: { data: true, mimeType: true, sha256: true },
    });
    if (!photo) throw new NotFoundException('No profile photo is set.');

    return { data: Buffer.from(photo.data), mimeType: photo.mimeType, sha256: photo.sha256 };
  }

  private async readMetadata(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const meta = await sharp(buffer, { limitInputPixels: MAX_SOURCE_PIXELS }).rotate().metadata();
      // After rotate(), width/height reflect the displayed orientation.
      if (!meta.width || !meta.height) throw new Error('no dimensions');
      // Full decode check: forces the pixel data to be read.
      await sharp(buffer, { limitInputPixels: MAX_SOURCE_PIXELS }).rotate().raw().toBuffer();
      return { width: meta.width, height: meta.height };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new UnsupportedMediaTypeException('The file is corrupted or is not a readable image.');
    }
  }

  private async requireTarget(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, archivedAt: null },
      select: { id: true, email: true, roles: { select: { role: { select: { code: true } } } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    return { id: user.id, email: user.email, roles: user.roles.map((r) => r.role.code) };
  }

  /** Self always; anyone else needs user update rights, and the existing user rules still apply. */
  private assertCanWrite(actor: AuthenticatedUser, target: { id: string; roles: string[] }): void {
    if (actor.id === target.id) return;
    if (!actor.permissions.includes(PERMISSIONS.USER_UPDATE)) {
      throw new ForbiddenException('You can only change your own profile photo.');
    }
    assertCanManageUser(actor, target, 'profile');
  }

  private record(entry: AuditEntry, tx: Parameters<AuditService['record']>[1]): Promise<void> {
    return this.audit.record(entry, tx);
  }
}
