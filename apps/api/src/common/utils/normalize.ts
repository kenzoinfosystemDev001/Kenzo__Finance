/**
 * Shared normalisation helpers.
 *
 * `normalizeName` produces the value stored in `normalizedName` columns. It
 * powers two things at once:
 *   1. duplicate detection ("Dell India Pvt. Ltd." vs "DELL INDIA PVT LTD")
 *   2. case/punctuation-insensitive search without a trigram extension
 *
 * It must stay deterministic: changing it requires a data backfill.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    // Strip common company suffixes punctuation but keep the words, so
    // "pvt ltd" still differentiates from a genuinely different name.
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `normalizedName` search filter. A term made only of punctuation ("/", "&")
 * normalises to "", and `contains: ""` would match every row, so that case
 * matches nothing instead (the other OR branches still apply).
 */
export function normalizedNameFilter(term: string): { contains: string } | { in: string[] } {
  const normalized = normalizeName(term);
  return normalized ? { contains: normalized } : { in: [] };
}

/** Trims and collapses whitespace; returns undefined for blank input. */
export function cleanOptional(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * cleanOptional for long free text: keeps line breaks.
 *
 * cleanOptional collapses every whitespace run, newlines included, so numbered
 * terms & conditions were stored - and printed on the quotation PDF - as one
 * paragraph. This tidies spaces within each line, drops trailing blank lines
 * and keeps at most one empty line between paragraphs.
 */
export function cleanMultiline(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const cleaned = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length === 0 ? undefined : cleaned;
}

/** Normalises a GSTIN/PAN style identifier to uppercase without spaces. */
export function normalizeTaxId(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const cleaned = value.replace(/\s/g, '').toUpperCase();
  return cleaned.length === 0 ? undefined : cleaned;
}

export function normalizeEmail(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const cleaned = value.trim().toLowerCase();
  return cleaned.length === 0 ? undefined : cleaned;
}

/** Keeps digits and a single leading +, so stored phones compare predictably. */
export function normalizePhone(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  return hasPlus ? `+${digits}` : digits;
}
