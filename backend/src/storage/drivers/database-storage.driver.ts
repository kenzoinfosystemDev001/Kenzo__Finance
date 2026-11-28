import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaService } from '../../database/prisma.service';
import type { SaveOptions, StorageDriver, StoredFile } from '../storage-driver.interface';

/** Keys written by this driver. Nothing else produces a key with this prefix. */
export const DATABASE_KEY_PREFIX = 'db:';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDatabaseKey(storageKey: string): boolean {
  return storageKey.startsWith(DATABASE_KEY_PREFIX);
}

/**
 * Files stored inside PostgreSQL (table stored_files, BYTEA).
 *
 * Every file lives in the same database as the records that reference it, so
 * a database backup or restore always includes the files, and nothing depends
 * on a server's disk or a third-party file service. Uploads are capped by
 * UPLOAD_MAX_BYTES (10 MB by default), well within PostgreSQL's 1 GB limit
 * for a single value.
 */
@Injectable()
export class DatabaseStorageDriver implements StorageDriver {
  readonly name = 'database';
  private readonly logger = new Logger(DatabaseStorageDriver.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(buffer: Buffer, options: SaveOptions): Promise<StoredFile> {
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const row = await this.prisma.storedFile.create({
      data: {
        folder: this.safeSegment(options.folder),
        originalFilename: options.originalFilename.slice(0, 255),
        mimeType: options.mimeType.slice(0, 120),
        sizeBytes: buffer.length,
        checksumSha256,
        // A copy backed by a plain ArrayBuffer, as Prisma's Bytes type requires.
        content: new Uint8Array(buffer),
      },
      select: { id: true },
    });
    return { storageKey: `${DATABASE_KEY_PREFIX}${row.id}`, checksumSha256, sizeBytes: buffer.length };
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    const id = this.idFromKey(storageKey);
    const row = id ? await this.prisma.storedFile.findUnique({ where: { id }, select: { content: true } }) : null;
    if (!row) {
      this.logger.error(`Stored file missing for key ${storageKey}`);
      throw new NotFoundException('The file for this document is no longer available in storage.');
    }
    return Readable.from(Buffer.from(row.content));
  }

  async remove(storageKey: string): Promise<void> {
    const id = this.idFromKey(storageKey);
    if (!id) return;
    // deleteMany: removing an already-removed file is not an error.
    await this.prisma.storedFile.deleteMany({ where: { id } });
  }

  private idFromKey(storageKey: string): string | null {
    if (!isDatabaseKey(storageKey)) return null;
    const id = storageKey.slice(DATABASE_KEY_PREFIX.length);
    return UUID.test(id) ? id : null;
  }

  private safeSegment(value: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
    return cleaned.length > 0 ? cleaned : 'misc';
  }
}
