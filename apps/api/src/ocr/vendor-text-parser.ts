import {
  emptyVendorDraft,
  type VendorOcrDraft,
} from './ocr-provider.interface';
import { isStructuredGstin, isValidPan } from '../common/utils/tax-id';

/**
 * Turns plain text (from a text file, or from an OCR provider's text layer)
 * into a vendor draft.
 *
 * Every provider funnels through here, so field rules and confidence scores
 * are identical whichever engine read the document. It only extracts what it
 * can point to in the text - nothing is inferred or invented. Confidence
 * reflects how the value was found:
 *   0.9+  checksum/format verified (GSTIN, PAN, email)
 *   0.7+  explicitly labelled ("Company Name: ...")
 *   <0.65 layout heuristics on an unlabelled visiting card - always verify
 */
export interface ParsedVendorText {
  draft: VendorOcrDraft;
  found: number;
}

const COMPANY_HINT =
  /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|technolog(?:y|ies)|solutions?|systems|enterprises?|traders?|trading|infotech|infosystems?|computers?|corporation|corp\.?|industries|distributors?|services|electronics|networks?|impex|associates|agencies|co\.)(?=\s|$|[,.])/i;

const DESIGNATION_HINT =
  /\b(manager|director|executive|head|ceo|cto|cfo|coo|founder|co-founder|proprietor|partner|owner|engineer|consultant|officer|president|vp|vice president|sales|marketing|accounts|business development|key account|representative|associate|lead|specialist)\b/i;

/** "Rahul Sharma", "R. K. Gupta", "Neha GUPTA" - 2 to 4 alphabetic words. */
const PERSON_NAME = /^(?:[A-Z][a-zA-Z]*\.?\s?){2,4}$/;

export function parseVendorText(text: string): ParsedVendorText {
  const draft = emptyVendorDraft();
  let found = 0;

  const setField = (key: keyof VendorOcrDraft, value: string | null | undefined, confidence: number) => {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length > 200 || draft[key].value) return;
    draft[key] = { value: cleaned, confidence };
    found += 1;
  };

  // --- Identifiers: verified by checksum / format ----------------------------
  const gstinMatch = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i.exec(text);
  if (gstinMatch && isStructuredGstin(gstinMatch[0])) {
    setField('gstin', gstinMatch[0].toUpperCase(), 0.95);
  }

  const panMatch = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i.exec(text);
  if (panMatch && isValidPan(panMatch[0])) {
    setField('pan', panMatch[0].toUpperCase(), 0.9);
  }

  const emails = [...new Set([...text.matchAll(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g)].map((m) => m[0].toLowerCase()))];
  if (emails[0]) setField('email', emails[0], 0.9);
  if (emails[1]) setField('alternateEmail', emails[1], 0.85);

  const websiteMatch =
    /\b(?:https?:\/\/)?www\.[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/i.exec(text) ??
    /\bhttps?:\/\/[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/i.exec(text);
  if (websiteMatch) setField('website', websiteMatch[0].replace(/[.,;]+$/, ''), 0.75);

  // Indian mobiles and landlines, optionally with +91 / 0 prefix and spacing.
  const phoneMatches = [
    ...text.matchAll(/(?:\+91[\s-]?|\b0)?(?:\b[6-9]\d{4}[\s-]?\d{5}\b|\b\d{2,4}[\s-]\d{6,8}\b)/g),
  ]
    .map((m) => m[0].trim())
    .filter((value) => {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 13;
    });
  const uniquePhones = [...new Set(phoneMatches)];
  if (uniquePhones[0]) setField('phone', uniquePhones[0], 0.75);
  if (uniquePhones[1]) setField('alternatePhone', uniquePhones[1], 0.65);

  // --- Labelled fields ("Company Name: Shree Computers") ---------------------
  const labelled: Array<[keyof VendorOcrDraft, RegExp, number]> = [
    ['businessName', /(?:company|business|firm|vendor|supplier)\s*name\s*[:\-]\s*(.+)/i, 0.85],
    ['legalName', /legal\s*name\s*[:\-]\s*(.+)/i, 0.8],
    ['contactPerson', /(?:contact\s*person|proprietor|contact\s*name)\s*[:\-]\s*(.+)/i, 0.75],
    ['designation', /designation\s*[:\-]\s*(.+)/i, 0.75],
    ['addressLine1', /address\s*[:\-]\s*(.+)/i, 0.7],
    ['city', /city\s*[:\-]\s*(.+)/i, 0.75],
    ['state', /state\s*[:\-]\s*(.+)/i, 0.75],
  ];

  for (const [key, pattern, confidence] of labelled) {
    const captured = pattern.exec(text)?.[1]?.split(/[\r\n]/)[0];
    setField(key, captured, confidence);
  }

  // --- Unlabelled layout (typical visiting card) -----------------------------
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1);

  const isContactLine = (line: string) =>
    /@|www\.|https?:|\d{5,}/i.test(line) || /^(?:ph|tel|mob|mobile|phone|fax|e-?mail|gst)/i.test(line);

  const companyLine = lines.find((line) => COMPANY_HINT.test(line) && !isContactLine(line) && line.length <= 80);
  if (companyLine) setField('businessName', companyLine, 0.6);

  const designationIndex = lines.findIndex(
    (line) => DESIGNATION_HINT.test(line) && !isContactLine(line) && line.length <= 60 && line !== companyLine,
  );
  if (designationIndex >= 0) {
    setField('designation', lines[designationIndex], 0.55);
    const candidate = lines[designationIndex - 1];
    if (candidate && PERSON_NAME.test(candidate) && candidate !== companyLine) {
      setField('contactPerson', candidate, 0.55);
    }
  }

  const pinLineIndex = lines.findIndex((line) => /\b[1-9][0-9]{2}\s?[0-9]{3}\b/.test(line) && !/@/.test(line));
  if (pinLineIndex >= 0) {
    const pin = /\b([1-9][0-9]{2})\s?([0-9]{3})\b/.exec(lines[pinLineIndex]);
    if (pin) setField('postalCode', `${pin[1]}${pin[2]}`, 0.6);
    // The address is usually the line(s) ending at the PIN code.
    const addressLine = lines[pinLineIndex].replace(/(?:ph|tel|mob)[^,]*$/i, '').trim();
    if (addressLine.length > 8 && !isContactLine(addressLine.replace(/\b[1-9][0-9]{2}\s?[0-9]{3}\b/, ''))) {
      setField('addressLine1', addressLine, 0.45);
    }
  }

  return { draft, found };
}

/**
 * Finds known brand names in the text. Matching is against the shared brand
 * master only - a word that merely looks like a brand is never turned into a
 * new brand record.
 */
export function findBrandMentions<T extends { id: string; name: string }>(
  text: string,
  brands: T[],
): T[] {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return brands.filter((brand) => {
    const needle = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // Very short names ("HP" is fine, "A" is not) would match noise.
    if (needle.length < 2) return false;
    return haystack.includes(` ${needle} `);
  });
}
