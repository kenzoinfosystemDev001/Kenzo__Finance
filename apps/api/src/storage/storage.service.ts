import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export interface StoredFile {
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
}

/**
 * Private document storage.
 *
 * Files are addressed by an opaque `storageKey` only. The key is generated
 * here - a client-supplied filename never reaches the filesystem, which closes
 * off path traversal. Downloads go through a permission-checked controller;
 * nothing under the storage root is statically served.
 *
 * The local driver is the only one wired up today. An S3 driver can be added
 * behind this same interface without touching any calling module.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root: string;

  constructor(private readonly configService: ConfigService) {
    const configuredRoot = this.configService.get<string>(
      'STORAGE_LOCAL_ROOT',
      './storage',
    );
    this.root = resolve(configuredRoot);

    this.warnIfStorageIsEphemeral(configuredRoot);
  }

  /**
   * Most PaaS containers (Render, Railway, Heroku) have an ephemeral
   * filesystem: anything written is lost on the next deploy or restart. With
   * the local driver that silently destroys every uploaded vendor document,
   * OCR source file and product image, while the database keeps rows pointing
   * at files that no longer exist.
   *
   * There is no safe automatic fallback, so this says so loudly at startup.
   * Fix it by mounting a persistent disk and pointing STORAGE_LOCAL_ROOT at
   * it, or by adding an S3 driver behind this same interface.
   */
  private warnIfStorageIsEphemeral(configuredRoot: string): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) return;

    const driver = this.configService.get<string>('STORAGE_DRIVER', 'local');
    if (driver !== 'local') return;

    // Tests the CONFIGURED value, not the resolved path: resolve() rewrites a
    // POSIX mount path into a drive-letter path on Windows, which would make
    // a correctly configured deployment look misconfigured.
    const looksLikeMountedDisk = /^\/(var\/data|data|mnt|persistent)(\/|$)/.test(
      configuredRoot,
    );

    if (looksLikeMountedDisk) {
      this.logger.log(`Document storage: ${configuredRoot} (persistent disk)`);
      return;
    }

    this.logger.warn(
      `Document storage is the local filesystem at ${this.root}. On a host ` +
        'with an ephemeral filesystem every uploaded file is lost on redeploy, ' +
        'leaving database records pointing at missing files. Mount a ' +
        'persistent disk and set STORAGE_LOCAL_ROOT to its path.',
    );
  }

  async save(
    buffer: Buffer,
    options: { folder: string; originalFilename: string },
  ): Promise<StoredFile> {
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

  createReadStream(storageKey: string): ReadStream {
    return createReadStream(this.resolveKey(storageKey));
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

  /** Keeps a short alphanumeric extension for readability; drops anything odd. */
  private safeExtension(originalFilename: string): string {
    const match = /\.([a-zA-Z0-9]{1,8})$/.exec(originalFilename);
    return match ? `.${match[1].toLowerCase()}` : '';
  }
}
