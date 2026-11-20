import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type {
  SaveOptions,
  StorageDriver,
  StoredFile,
} from '../storage-driver.interface';

/**
 * Files on the local filesystem.
 *
 * Suitable for development and for a host with a mounted persistent disk.
 * On an ephemeral container every upload is lost on redeploy, which is why
 * StorageService warns about that configuration at startup.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly root: string;

  constructor(private readonly configService: ConfigService) {
    this.root = resolve(
      this.configService.get<string>('STORAGE_LOCAL_ROOT', './storage'),
    );
  }

  async save(buffer: Buffer, options: SaveOptions): Promise<StoredFile> {
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const extension = this.safeExtension(options.originalFilename);
    const folder = this.safeSegment(options.folder);

    const now = new Date();
    const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const storageKey = `${folder}/${datePath}/${randomUUID()}${extension}`;

    const absolutePath = this.resolveKey(storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: 'wx' });

    return { storageKey, checksumSha256, sizeBytes: buffer.length };
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    const absolutePath = this.resolveKey(storageKey);
    // A record whose file is gone (lost disk, manual cleanup) is a 404, not
    // a stream error after the response has started.
    const info = await stat(absolutePath).catch(() => null);
    if (!info?.isFile()) {
      this.logger.error(`Stored file missing for key ${storageKey}`);
      throw new NotFoundException('The file for this document is no longer available in storage.');
    }
    return createReadStream(absolutePath);
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(storageKey));
    } catch (error) {
      this.logger.warn(
        `Could not remove stored file ${storageKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves a key to an absolute path and refuses anything that escapes the
   * storage root, even if a malformed key reaches this far.
   */
  private resolveKey(storageKey: string): string {
    const absolutePath = resolve(join(this.root, storageKey));

    if (absolutePath !== this.root && !absolutePath.startsWith(this.root + sep)) {
      throw new Error('Resolved storage path escapes the storage root');
    }

    return absolutePath;
  }

  private safeSegment(value: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned.length > 0 ? cleaned : 'misc';
  }

  private safeExtension(originalFilename: string): string {
    const match = /\.([a-zA-Z0-9]{1,8})$/.exec(originalFilename);
    return match ? `.${match[1].toLowerCase()}` : '';
  }
}
