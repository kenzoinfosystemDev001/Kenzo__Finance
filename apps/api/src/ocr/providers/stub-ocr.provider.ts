import { Injectable, Logger } from '@nestjs/common';
import {
  emptyVendorDraft,
  type OcrExtractionResult,
  type OcrInput,
  type OcrProvider,
  type VendorOcrDraft,
} from '../ocr-provider.interface';
import { isValidGstin, isValidPan } from '../../common/utils/tax-id';

/**
 * Default OCR provider, active until the client approves a paid one.
 *
 * It performs genuine pattern extraction on text the server can actually read
 * (text/*, CSV, JSON - e.g. a pasted letterhead or an exported record). For a
 * scanned PDF or photo it does NOT guess: it returns an empty draft plus a
 * note telling the user to type the details in. Inventing values that look
 * extracted would be worse than extracting nothing, because the reviewer would
 * be checking fiction against a document.
 *
 * Swapping in a real provider means implementing OcrProvider and registering
 * it in OcrModule - nothing else changes.
 */
@Injectable()
export class StubOcrProvider implements OcrProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(StubOcrProvider.name);

  async extractVendor(input: OcrInput): Promise<OcrExtractionResult> {
    const draft = emptyVendorDraft();

    if (!this.isReadableAsText(input.mimeType, input.originalFilename)) {
      this.logger.debug(
        `No text layer available for ${input.originalFilename} (${input.mimeType})`,
      );
      return {
        draft,
        raw: { provider: 'stub', extracted: false, mimeType: input.mimeType },
        overallConfidence: 0,
        note:
          'No OCR provider is configured, so this file could not be read ' +
          'automatically. The original document has been stored and attached - ' +
          'please enter the vendor details manually.',
      };
    }

    const text = input.buffer.toString('utf8');
    const found = this.extractFromText(text, draft);

    return {
      draft,
      raw: { provider: 'stub', extracted: true, characters: text.length },
      overallConfidence: found === 0 ? 0 : Math.min(1, 0.5 + found * 0.08),
      note:
        found === 0
          ? 'The document was read but no recognisable vendor fields were found. Please enter the details manually.'
          : `Read ${found} field(s) from the document text. Check every value against the original before saving.`,
    };
  }

  private isReadableAsText(mimeType: string, filename: string): boolean {
    if (mimeType.startsWith('text/')) return true;
    if (mimeType === 'application/json') return true;
    return /\.(txt|csv|json|md)$/i.test(filename);
  }

  /** Mutates `draft`; returns how many fields were populated. */
  private extractFromText(text: string, draft: VendorOcrDraft): number {
    let found = 0;

    const setField = (
      key: keyof VendorOcrDraft,
      value: string | null,
      confidence: number,
    ): void => {
      if (!value || draft[key].value) return;
      draft[key] = { value, confidence };
      found += 1;
    };

    // Identifiers are checksum/format verified, so confidence is high.
    const gstinMatch = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i.exec(text);
    if (gstinMatch && isValidGstin(gstinMatch[0])) {
      setField('gstin', gstinMatch[0].toUpperCase(), 0.95);
    }

    const panMatch = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i.exec(text);
    if (panMatch && isValidPan(panMatch[0])) {
      setField('pan', panMatch[0].toUpperCase(), 0.9);
    }

    const emailMatch = /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/.exec(text);
    if (emailMatch) setField('email', emailMatch[0].toLowerCase(), 0.9);

    const websiteMatch = /\b(?:https?:\/\/)?(?:www\.)[\w-]+\.[\w.-]{2,}\b/i.exec(text);
    if (websiteMatch) setField('website', websiteMatch[0], 0.7);

    // Indian phone numbers, optionally with +91 / 0 prefix.
    const phoneMatches = [
      ...text.matchAll(/(?:\+91[\s-]?|\b0)?\b[6-9]\d{9}\b/g),
    ].map((m) => m[0].trim());
    const uniquePhones = [...new Set(phoneMatches)];
    if (uniquePhones[0]) setField('phone', uniquePhones[0], 0.75);
    if (uniquePhones[1]) setField('alternatePhone', uniquePhones[1], 0.6);

    const pinMatch = /\b[1-9][0-9]{5}\b/.exec(text);
    if (pinMatch) setField('postalCode', pinMatch[0], 0.6);

    // Labelled fields, e.g. "Company Name: Shree Computers".
    const labelled: Array<[keyof VendorOcrDraft, RegExp, number]> = [
      ['businessName', /(?:company|business|firm|vendor|supplier)\s*name\s*[:\-]\s*(.+)/i, 0.85],
      ['legalName', /legal\s*name\s*[:\-]\s*(.+)/i, 0.8],
      ['contactPerson', /(?:contact\s*person|proprietor|contact)\s*[:\-]\s*(.+)/i, 0.75],
      ['addressLine1', /address\s*[:\-]\s*(.+)/i, 0.7],
      ['city', /city\s*[:\-]\s*(.+)/i, 0.75],
      ['state', /state\s*[:\-]\s*(.+)/i, 0.75],
    ];

    for (const [key, pattern, confidence] of labelled) {
      const match = pattern.exec(text);
      const captured = match?.[1]?.split(/[\r\n]/)[0]?.trim();
      if (captured && captured.length <= 200) {
        setField(key, captured, confidence);
      }
    }

    return found;
  }
}
