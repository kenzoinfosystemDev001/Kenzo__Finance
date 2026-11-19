import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, ReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface SaveOptions {
  /** Logical sub-folder inside the storage root, e.g. "vendors". */
  folder: string;
  /** Used only to derive the file extension; never used as the on-disk name. */
  originalFilename: string;
}

export interface StoredFile {
  /** Opaque, POSIX-style key relative to the storage root. */
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Private, disk-backed document storage (STORAGE_DRIVER=local).
 *
 * Files are written under STORAGE_LOCAL_ROOT with random names, so user input
 * never decides an on-disk path. Nothing here is statically served; files
 * leave storage only through permission-checked streams.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root = path.resolve(configService.get<string>('STORAGE_LOCAL_ROOT', './storage'));
  }

  async save(buffer: Buffer, options: SaveOptions): Promise<StoredFile> {
    const folder = this.sanitizeSegment(options.folder);
    const extension = this.extractExtension(options.originalFilename);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

    const storageKey = [folder, yyyy, mm, `${randomUUID()}${extension}`].join('/');
    const absolutePath = this.resolveKey(storageKey);

    try {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      // "wx" fails if the file already exists, so a key is never overwritten.
      await writeFile(absolutePath, buffer, { flag: 'wx' });
    } catch (error) {
      this.logger.error(`Failed to write ${storageKey}`, error as Error);
      throw new InternalServerErrorException('Could not store the uploaded file.');
    }

    return {
      storageKey,
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  createReadStream(storageKey: string): ReadStream {
    const absolutePath = this.resolveKey(storageKey);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('The stored file could not be found.');
    }
    return createReadStream(absolutePath);
  }

  /** Maps a storage key to an absolute path, refusing anything outside the root. */
  private resolveKey(storageKey: string): string {
    const absolutePath = path.resolve(this.root, storageKey);
    if (absolutePath !== this.root && !absolutePath.startsWith(this.root + path.sep)) {
      throw new NotFoundException('The stored file could not be found.');
    }
    return absolutePath;
  }

  private sanitizeSegment(segment: string): string {
    const cleaned = segment.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || 'misc';
  }

  private extractExtension(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
  }
}
