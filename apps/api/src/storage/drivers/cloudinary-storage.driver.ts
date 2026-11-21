import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  SaveOptions,
  StorageDriver,
  StoredFile,
} from '../storage-driver.interface';

/**
 * Cloudinary-backed document storage.
 *
 * Chosen for hosts with an ephemeral filesystem (Render, Railway, Heroku),
 * where local storage silently loses every upload on redeploy.
 *
 * Two deliberate choices:
 *
 * 1. Assets are uploaded as `type: 'authenticated'`. A default Cloudinary
 *    upload is world-readable to anyone with the URL, which is unacceptable
 *    for vendor GST certificates and PAN documents. Authenticated assets
 *    require a signature, so the URL alone is not enough.
 *
 * 2. Downloads are still streamed through our permission-checked controller
 *    rather than handing the browser a signed URL. That keeps one enforcement
 *    point, preserves the download audit entry, and means a URL cannot leak
 *    and outlive the user's access.
 */
@Injectable()
export class CloudinaryStorageDriver implements StorageDriver {
  readonly name = 'cloudinary';
  private readonly logger = new Logger(CloudinaryStorageDriver.name);
  private readonly baseFolder: string;
  private configured = false;

  constructor(private readonly configService: ConfigService) {
    this.baseFolder = this.configService.get<string>(
      'CLOUDINARY_FOLDER',
      'kenzo-erp',
    );
  }

  /**
   * Configures the SDK on first use rather than in a lifecycle hook.
   *
   * Nest instantiates every provider and runs its OnModuleInit, including
   * drivers that were not selected. Validating credentials there made the
   * whole application refuse to start with STORAGE_DRIVER=local and no
   * Cloudinary configuration, which is a perfectly valid setup.
   *
   * Selecting this driver without credentials is still rejected, by the
   * startup check in env.validation.ts - so a genuine misconfiguration is
   * caught before any request, not on the first upload.
   */
  private ensureConfigured(): void {
    if (this.configured) return;

    const url = this.configService.get<string>('CLOUDINARY_URL');
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else if (url) {
      // The SDK parses process.env.CLOUDINARY_URL itself. ConfigService
      // holds the repaired value (quotes / `KEY=` prefix stripped), but
      // @nestjs/config never overwrites an existing process.env entry, so
      // the SDK would otherwise read the raw, still-broken string.
      process.env.CLOUDINARY_URL = url;
      cloudinary.config(true);
      cloudinary.config({ secure: true });
    } else {
      throw new Error(
        'STORAGE_DRIVER=cloudinary requires either CLOUDINARY_URL, or all of ' +
          'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      );
    }

    // Read back what the SDK actually resolved, which also covers the
    // CLOUDINARY_URL path where the values were never passed in explicitly.
    const resolvedCloudName = cloudinary.config().cloud_name;
    if (!resolvedCloudName) {
      throw new Error(
        'Cloudinary credentials are present but incomplete; no cloud name resolved.',
      );
    }

    this.configured = true;
    this.logger.log(`Document storage: Cloudinary cloud "${resolvedCloudName}"`);
  }

  async save(buffer: Buffer, options: SaveOptions): Promise<StoredFile> {
    this.ensureConfigured();
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const folder = `${this.baseFolder}/${this.safeSegment(options.folder)}`;
    const publicId = randomUUID();

    const result = await new Promise<{ public_id: string; resource_type: string }>(
      (resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            // 'raw' keeps PDFs and text files byte-identical; Cloudinary would
            // otherwise try to treat them as media and may transform them.
            resource_type: this.resourceTypeFor(options.mimeType),
            type: 'authenticated',
            overwrite: false,
            // The original filename is display metadata only; it never becomes
            // part of the storage path.
            context: { original_filename: options.originalFilename },
          },
          (error, uploaded) => {
            if (error || !uploaded) {
              reject(
                error instanceof Error
                  ? error
                  : new Error(String(error ?? 'Cloudinary upload failed')),
              );
              return;
            }
            resolve({
              public_id: uploaded.public_id,
              resource_type: uploaded.resource_type,
            });
          },
        );

        Readable.from(buffer).pipe(upload);
      },
    );

    // The resource type is part of the key because retrieval needs it and it
    // cannot be re-derived reliably from the id alone.
    return {
      storageKey: `${result.resource_type}:${result.public_id}`,
      checksumSha256,
      sizeBytes: buffer.length,
    };
  }

  async createReadStream(storageKey: string): Promise<Readable> {
    this.ensureConfigured();
    const { resourceType, publicId } = this.parseKey(storageKey);

    // Short-lived signed URL, used server-side only and never sent to a client.
    const signedUrl = cloudinary.url(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await fetch(signedUrl);

    if (!response.ok || !response.body) {
      throw new Error(
        `Could not retrieve ${storageKey} from Cloudinary (HTTP ${response.status}).`,
      );
    }

    return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  }

  async remove(storageKey: string): Promise<void> {
    this.ensureConfigured();
    const { resourceType, publicId } = this.parseKey(storageKey);

    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
      });
    } catch (error) {
      this.logger.warn(
        `Could not remove ${storageKey} from Cloudinary: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private parseKey(storageKey: string): {
    resourceType: string;
    publicId: string;
  } {
    const separator = storageKey.indexOf(':');

    // Keys written by the local driver have no resource-type prefix.
    if (separator === -1) {
      return { resourceType: 'raw', publicId: storageKey };
    }

    return {
      resourceType: storageKey.slice(0, separator),
      publicId: storageKey.slice(separator + 1),
    };
  }

  private resourceTypeFor(mimeType: string): 'image' | 'raw' {
    return mimeType.startsWith('image/') ? 'image' : 'raw';
  }

  private safeSegment(value: string): string {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned.length > 0 ? cleaned : 'misc';
  }
}
