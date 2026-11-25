/**
 * Upload validation by file signature, not by the client's claims.
 *
 * A browser-supplied MIME type and filename extension are both attacker
 * controlled. Every accepted type is confirmed against the actual leading
 * bytes, and the detected type - not the declared one - is what gets stored.
 */

export interface DetectedFileType {
  mimeType: string;
  extension: string;
}

type Signature = {
  mimeType: string;
  extension: string;
  test: (buffer: Buffer) => boolean;
};

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
};

const SIGNATURES: Signature[] = [
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    test: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    test: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) && // RIFF
      startsWith(b, [0x57, 0x45, 0x42, 0x50], 8), // WEBP
  },
  {
    mimeType: 'image/tiff',
    extension: 'tiff',
    test: (b) =>
      startsWith(b, [0x49, 0x49, 0x2a, 0x00]) ||
      startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]),
  },
];

/** Text formats have no signature, so they are accepted only by extension. */
const TEXT_EXTENSIONS: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
};

/** Rejects UTF-8 that contains NUL or an excess of control characters. */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (sample.includes(0x00)) return false;

  let controlCount = 0;
  for (const byte of sample) {
    const isAllowedWhitespace = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (byte < 0x20 && !isAllowedWhitespace) controlCount += 1;
  }

  return controlCount / Math.max(sample.length, 1) < 0.05;
}

export function detectFileType(
  buffer: Buffer,
  originalFilename: string,
): DetectedFileType | null {
  for (const signature of SIGNATURES) {
    if (signature.test(buffer)) {
      return { mimeType: signature.mimeType, extension: signature.extension };
    }
  }

  const extension = /\.([a-zA-Z0-9]+)$/.exec(originalFilename)?.[1]?.toLowerCase();
  if (extension && extension in TEXT_EXTENSIONS && looksLikeText(buffer)) {
    return { mimeType: TEXT_EXTENSIONS[extension], extension };
  }

  return null;
}

export const ALLOWED_UPLOAD_DESCRIPTION =
  'PDF, PNG, JPEG, WEBP, TIFF, TXT, CSV, JSON or Markdown';
