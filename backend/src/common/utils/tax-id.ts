/**
 * GSTIN and PAN validation.
 *
 * A GSTIN is 15 characters. Vendors and customers are entered from documents
 * that are not always clean, so the rule is deliberately loose: exactly 15
 * letters or digits. The official structure and checksum are not enforced
 * because they reject real-looking values (and any typo the user has to
 * correct by hand). The PAN is still validated on its own.
 */

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;
/** The GST official shape: state, PAN, entity, Z, checksum. */
const GSTIN_STRUCTURE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/** Check character for the first 14 characters of a GSTIN (GST checksum). */
export function computeGstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i += 1) {
    const codePoint = GSTIN_CHARSET.indexOf(first14[i]);
    if (codePoint === -1) return '';
    const factor = i % 2 === 0 ? 1 : 2;
    const product = codePoint * factor;
    sum += Math.floor(product / GSTIN_CHARSET.length) + (product % GSTIN_CHARSET.length);
  }
  const remainder = sum % GSTIN_CHARSET.length;
  return GSTIN_CHARSET[(GSTIN_CHARSET.length - remainder) % GSTIN_CHARSET.length];
}

/**
 * Strict check (shape and checksum). Used only where a GSTIN is being picked
 * out of scanned text, so an OCR misread is not taken as a real number.
 */
export function isStructuredGstin(value: string): boolean {
  const gstin = value.replace(/\s/g, '').toUpperCase();
  return GSTIN_STRUCTURE.test(gstin) && computeGstinChecksum(gstin.slice(0, 14)) === gstin[14];
}

/** Accepts any 15 letters or digits, ignoring spaces and case. */
export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.replace(/\s/g, '').toUpperCase());
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(value.replace(/\s/g, '').toUpperCase());
}
