/**
 * Provider-independent OCR contract.
 *
 * Modules depend on this interface, never on a vendor SDK, so the approved
 * provider (Google Vision / AWS Textract / other) can be swapped in by adding
 * one class and changing OCR_PROVIDER - no calling code changes.
 */

/** One extracted value plus how much the provider trusts it. */
export interface ExtractedField {
  value: string | null;
  /** 0..1, or null when the provider does not report per-field confidence. */
  confidence: number | null;
}

/** Vendor fields the review screen can prefill. All optional by nature. */
export interface VendorOcrDraft {
  businessName: ExtractedField;
  legalName: ExtractedField;
  contactPerson: ExtractedField;
  designation: ExtractedField;
  email: ExtractedField;
  alternateEmail: ExtractedField;
  phone: ExtractedField;
  alternatePhone: ExtractedField;
  website: ExtractedField;
  addressLine1: ExtractedField;
  city: ExtractedField;
  state: ExtractedField;
  postalCode: ExtractedField;
  gstin: ExtractedField;
  pan: ExtractedField;
}

export interface OcrExtractionResult {
  /** Normalised, provider-independent draft shown to the reviewer. */
  draft: VendorOcrDraft;
  /** Untouched provider payload, kept for audit and re-mapping. */
  raw: unknown;
  overallConfidence: number | null;
  /** Human-readable note surfaced on the review screen. */
  note?: string;
  /**
   * The plain text the provider read, when it has one. Used to recognise
   * names from the shared brand master; never stored on a business record.
   */
  text?: string;
}

export interface OcrInput {
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}

export interface OcrProvider {
  readonly name: string;
  extractVendor(input: OcrInput): Promise<OcrExtractionResult>;
}

export const OCR_PROVIDER_TOKEN = Symbol('OCR_PROVIDER');

export function emptyField(): ExtractedField {
  return { value: null, confidence: null };
}

export function emptyVendorDraft(): VendorOcrDraft {
  return {
    businessName: emptyField(),
    legalName: emptyField(),
    contactPerson: emptyField(),
    designation: emptyField(),
    email: emptyField(),
    alternateEmail: emptyField(),
    phone: emptyField(),
    alternatePhone: emptyField(),
    website: emptyField(),
    addressLine1: emptyField(),
    city: emptyField(),
    state: emptyField(),
    postalCode: emptyField(),
    gstin: emptyField(),
    pan: emptyField(),
  };
}
