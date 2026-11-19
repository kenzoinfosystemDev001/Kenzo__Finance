import { Injectable, Logger } from '@nestjs/common';
import {
  emptyVendorDraft,
  type OcrExtractionResult,
  type OcrInput,
  type OcrProvider,
} from '../ocr-provider.interface';
import { parseVendorText } from '../vendor-text-parser';

/**
 * Default provider (OCR_PROVIDER=stub), active until a real OCR engine is
 * configured.
 *
 * It performs genuine pattern extraction on text the server can actually read
 * (text/*, CSV, JSON - e.g. a pasted letterhead or an exported record). For a
 * scanned PDF or photo it does NOT guess: it returns an empty draft plus a
 * note telling the user to type the details in. Inventing values that look
 * extracted would be worse than extracting nothing, because the reviewer would
 * be checking fiction against a document.
 */
@Injectable()
export class StubOcrProvider implements OcrProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(StubOcrProvider.name);

  async extractVendor(input: OcrInput): Promise<OcrExtractionResult> {
    if (!isReadableAsText(input.mimeType, input.originalFilename)) {
      this.logger.debug(
        `No text layer available for ${input.originalFilename} (${input.mimeType})`,
      );
      return {
        draft: emptyVendorDraft(),
        raw: { provider: 'stub', extracted: false, mimeType: input.mimeType },
        overallConfidence: 0,
        note:
          'No OCR provider is configured, so this scanned file could not be read ' +
          'automatically. The original document has been stored and will be ' +
          'attached to the vendor - please enter the details manually.',
      };
    }

    const text = input.buffer.toString('utf8');
    const { draft, found } = parseVendorText(text);

    return {
      draft,
      text,
      raw: { provider: 'stub', extracted: true, characters: text.length },
      overallConfidence: confidenceFor(found),
      note: noteFor(found),
    };
  }
}

export function isReadableAsText(mimeType: string, filename: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  if (mimeType === 'application/json') return true;
  return /\.(txt|csv|json|md)$/i.test(filename);
}

export function confidenceFor(found: number): number {
  return found === 0 ? 0 : Math.min(1, 0.5 + found * 0.08);
}

export function noteFor(found: number): string {
  return found === 0
    ? 'The document was read but no recognisable vendor fields were found. Please enter the details manually.'
    : `Read ${found} field(s) from the document. Check every value against the original before saving.`;
}
