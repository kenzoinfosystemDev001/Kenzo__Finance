// Readable rather than fs.ReadStream: a remote storage driver (Cloudinary,
// S3) streams over the network and never opens a file descriptor.
import type { Readable } from 'node:stream';
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

  // Without an 'error' listener a read failure (file removed, remote storage
  // dropping the connection) was an uncaught exception that terminated the
  // whole API process.
  file.stream.once('error', (error) => {
    logger.error(`Streaming ${file.filename} failed: ${error.message}`);
    if (!response.headersSent) {
      response.removeHeader('Content-Disposition');
      response.removeHeader('Content-Length');
      response.removeHeader('Content-Type');
      response.status(502).json({
        statusCode: 502,
        error: 'STORAGE_READ_FAILED',
        message: 'The file could not be read from storage. Try again later.',
      });
    } else {
      response.destroy(error);
    }
  });
  // A client that disconnects mid-download must not leave the source open.
  response.once('close', () => file.stream.destroy());
  file.stream.pipe(response);
}

const logger = new Logger('sendStoredFile');
