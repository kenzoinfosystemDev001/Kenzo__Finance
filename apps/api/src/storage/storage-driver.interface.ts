import type { Readable } from 'node:stream';

export interface StoredFile {
  /** Opaque key used to retrieve the file later. Never a public URL. */
  storageKey: string;
  checksumSha256: string;
  sizeBytes: number;
}

export interface SaveOptions {
  /** Logical folder, e.g. "vendors" or "products". */
  folder: string;
  originalFilename: string;
  mimeType: string;
}

/**
 * Document storage contract.
 *
 * Calling modules depend only on this, so swapping local disk for Cloudinary
 * (or S3 later) changes one provider registration and nothing else.
 *
 * Files are always addressed by an opaque key. Downloads are streamed back
 * through a permission-checked controller rather than exposed as public URLs,
 * because vendor GST certificates and similar documents must not be readable
 * by anyone who happens to guess a link.
 */
export interface StorageDriver {
  readonly name: string;
  save(buffer: Buffer, options: SaveOptions): Promise<StoredFile>;
  createReadStream(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}

export const STORAGE_DRIVER_TOKEN = Symbol('STORAGE_DRIVER');
