/**
 * GSTIN and PAN validation.
 *
 * GSTIN is 15 characters: <2 state code><10 PAN><1 entity code><1 'Z'><1 checksum>
 * The final character is a checksum, so a typo is detectable rather than being
 * stored and only discovered when an invoice is rejected.
 */

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/** Valid GST state codes: 01-38 plus 97 (other territory) and 99 (centre). */
function isValidStateCode(code: string): boolean {
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

export function computeGstinChecksum(first14: string): string {
  let sum = 0;

  for (let i = 0; i < first14.length; i += 1) {
    const codePoint = GSTIN_CHARSET.indexOf(first14[i]);
    if (codePoint === -1) return '';
    // Alternating weights of 1 and 2 across the 14 characters.
    const factor = i % 2 === 0 ? 1 : 2;
    const product = codePoint * factor;
    sum += Math.floor(product / GSTIN_CHARSET.length) + (product % GSTIN_CHARSET.length);
  }

  const remainder = sum % GSTIN_CHARSET.length;
  const checkIndex = (GSTIN_CHARSET.length - remainder) % GSTIN_CHARSET.length;
  return GSTIN_CHARSET[checkIndex];
}

export function isValidGstin(value: string): boolean {
  const gstin = value.replace(/\s/g, '').toUpperCase();

  if (gstin.length !== 15) return false;
  if (!GSTIN_PATTERN.test(gstin)) return false;
  if (!isValidStateCode(gstin.slice(0, 2))) return false;

  return computeGstinChecksum(gstin.slice(0, 14)) === gstin[14];
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(value.replace(/\s/g, '').toUpperCase());
}

/** The PAN embedded in a GSTIN, used to cross-check a separately entered PAN. */
export function panFromGstin(gstin: string): string | null {
  const cleaned = gstin.replace(/\s/g, '').toUpperCase();
  if (cleaned.length !== 15) return null;
  return cleaned.slice(2, 12);
}
