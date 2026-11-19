import type { ReadStream } from 'node:fs';
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
    stream: ReadStream;
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

  file.stream.pipe(response);
}
