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

/** Trims and collapses whitespace; returns undefined for blank input. */
export function cleanOptional(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length === 0 ? undefined : trimmed;
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
