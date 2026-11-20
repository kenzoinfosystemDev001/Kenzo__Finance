// Readable rather than fs.ReadStream: a remote storage driver (Cloudinary,
// S3) streams over the network and never opens a file descriptor.
import { pipeline, type Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Streams a stored document with safe headers. Shared by every endpoint that
 * serves files, so the security headers cannot drift between them.
 *
 * - nosniff: the browser must use the verified MIME type, never guess one.
 * - inline only when the service decided the type is safe to render (PDF and
 *   raster images); everything else is forced to download.
 * - inline types never include HTML or SVG (see file-validation), so nothing
 *   served inline can execute script. A CSP `sandbox` is deliberately not
 *   set: Chromium refuses to render PDFs in a sandboxed document.
 */
export function sendStoredFile(
  response: Response,
  file: {
    stream: Readable;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    inline: boolean;
  },
): void {
  const encodedName = encodeURIComponent(file.filename);

  response.setHeader('Content-Type', file.mimeType);
  response.setHeader('Content-Length', file.sizeBytes);
  response.setHeader(
    'Content-Disposition',
    `${file.inline ? 'inline' : 'attachment'}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');

  pipeStoredFile(file.stream, response);
}

const logger = new Logger('StoredFile');

/**
 * `stream.pipe()` attaches no error listener to the source, so a read error
 * (file removed, remote storage dropping the connection) became an unhandled
 * 'error' event and took the whole API process down. `pipeline` routes it
 * here instead, and the half-sent response is aborted.
 */
export function pipeStoredFile(source: Readable, response: Response): void {
  pipeline(source, response, (error) => {
    if (!error) return;
    logger.warn(`Streaming a stored file failed: ${error.message}`);
    response.destroy(error);
  });
}
