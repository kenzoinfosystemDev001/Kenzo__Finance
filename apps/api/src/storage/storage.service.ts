import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import {
  STORAGE_DRIVER_TOKEN,
  type SaveOptions,
  type StorageDriver,
  type StoredFile,
} from './storage-driver.interface';

export type { StoredFile } from './storage-driver.interface';

/**
 * Private document storage.
 *
 * A thin facade over the configured driver, so calling modules never know or
 * care whether files live on disk or in Cloudinary. Files are addressed by an
 * opaque key generated here; a client-supplied filename never reaches the
 * storage path, which closes off traversal. Nothing is publicly served.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_DRIVER_TOKEN) private readonly driver: StorageDriver,
    private readonly configService: ConfigService,
  ) {
    this.warnIfStorageIsEphemeral();
  }

  get driverName(): string {
    return this.driver.name;
  }

  async save(
    buffer: Buffer,
    options: { folder: string; originalFilename: string; mimeType?: string },
  ): Promise<StoredFile> {
    const saveOptions: SaveOptions = {
      folder: options.folder,
      originalFilename: options.originalFilename,
      mimeType: options.mimeType ?? 'application/octet-stream',
    };

    return this.driver.save(buffer, saveOptions);
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    return this.driver.createReadStream(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    await this.driver.remove(storageKey);
  }

  /**
   * Most PaaS containers (Render, Railway, Heroku) have an ephemeral
   * filesystem: anything written is lost on the next deploy or restart. With
   * the local driver that silently destroys every uploaded vendor document,
   * OCR source file and product image, while the database keeps rows pointing
   * at files that no longer exist.
   *
   * There is no safe automatic fallback, so this says so loudly at startup.
   * Fix it with STORAGE_DRIVER=cloudinary, or by mounting a persistent disk
   * and pointing STORAGE_LOCAL_ROOT at it.
   */
  private warnIfStorageIsEphemeral(): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) return;
    if (this.driver.name !== 'local') return;

    const configuredRoot = this.configService.get<string>(
      'STORAGE_LOCAL_ROOT',
      './storage',
    );

    // Tests the CONFIGURED value, not a resolved path: resolve() rewrites a
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
      `Document storage is the local filesystem at ${configuredRoot}. On a ` +
        'host with an ephemeral filesystem every uploaded file is lost on ' +
        'redeploy, leaving database records pointing at missing files. Set ' +
        'STORAGE_DRIVER=cloudinary, or mount a persistent disk and point ' +
        'STORAGE_LOCAL_ROOT at it.',
    );
  }
}
