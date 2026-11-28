import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import {
  STORAGE_DRIVER_TOKEN,
  type SaveOptions,
  type StorageDriver,
  type StoredFile,
} from './storage-driver.interface';
import { DatabaseStorageDriver, isDatabaseKey } from './drivers/database-storage.driver';
import { LocalStorageDriver } from './drivers/local-storage.driver';
import { CloudinaryStorageDriver } from './drivers/cloudinary-storage.driver';

export type { StoredFile } from './storage-driver.interface';

/** Keys written by the Cloudinary driver: "<resource_type>:<public_id>". */
const CLOUDINARY_KEY = /^(image|raw|video):/;

/**
 * Private document storage.
 *
 * New files go to the configured driver - by default the database
 * (stored_files). Reads and deletes are routed by the key itself, so a file
 * saved earlier on disk or in Cloudinary stays readable after the default
 * changes, until `npm run storage:migrate-to-db` copies it into the database.
 *
 * Files are addressed by an opaque key generated here; a client-supplied
 * filename never reaches a storage path. Nothing is publicly served.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_DRIVER_TOKEN) private readonly driver: StorageDriver,
    private readonly configService: ConfigService,
    private readonly database: DatabaseStorageDriver,
    private readonly local: LocalStorageDriver,
    private readonly cloudinary: CloudinaryStorageDriver,
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
    return this.driverFor(storageKey).createReadStream(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    await this.driverFor(storageKey).remove(storageKey);
  }

  /** The driver that holds an existing file, decided by the shape of its key. */
  driverFor(storageKey: string): StorageDriver {
    if (isDatabaseKey(storageKey)) return this.database;
    if (CLOUDINARY_KEY.test(storageKey)) return this.cloudinary;
    return this.local;
  }

  /**
   * With STORAGE_DRIVER=local in production, uploads live on the server's
   * disk: on a host whose disk is replaced on redeploy they are lost while
   * the database keeps rows pointing at them. The database driver (default)
   * has no such risk.
   */
  private warnIfStorageIsEphemeral(): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction || this.driver.name !== 'local') return;

    const configuredRoot = this.configService.get<string>('STORAGE_LOCAL_ROOT', './storage');
    this.logger.warn(
      `Document storage is the local filesystem at ${configuredRoot}. Make sure ` +
        'this is a persistent volume, or use STORAGE_DRIVER=database to keep ' +
        'files in PostgreSQL with the rest of the data.',
    );
  }
}
