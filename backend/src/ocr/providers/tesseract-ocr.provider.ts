import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';
import {
  emptyVendorDraft,
  type OcrExtractionResult,
  type OcrInput,
  type OcrProvider,
} from '../ocr-provider.interface';
import { parseVendorText } from '../vendor-text-parser';
import { confidenceFor, isReadableAsText, noteFor } from './stub-ocr.provider';

/** Images Tesseract reads directly. PDFs are not rasterised by this provider. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Tesseract provider (OCR_PROVIDER=tesseract). Free and open source: it runs
 * inside the API process, needs no account or API key, and sends documents to
 * no third party.
 *
 * Reads PNG, JPEG and WEBP images. For a PDF it does not guess: it returns an
 * empty draft and a note asking for an image of the page, or manual entry.
 *
 * The first recognition downloads the English language data once; the worker
 * is then reused for later documents.
 */
@Injectable()
export class TesseractOcrProvider implements OcrProvider, OnModuleDestroy {
  readonly name = 'tesseract';
  private readonly logger = new Logger(TesseractOcrProvider.name);
  private worker: Promise<Worker> | null = null;

  async extractVendor(input: OcrInput): Promise<OcrExtractionResult> {
    if (!isReadableAsText(input.mimeType, input.originalFilename) && !IMAGE_TYPES.has(input.mimeType)) {
      return {
        draft: emptyVendorDraft(),
        raw: { provider: this.name, mimeType: input.mimeType },
        overallConfidence: 0,
        note: 'This OCR engine reads PNG, JPEG or WEBP images. Upload an image of the page, or enter the details manually.',
      };
    }

    const text = isReadableAsText(input.mimeType, input.originalFilename)
      ? input.buffer.toString('utf8')
      : await this.recognise(input.buffer);

    const { draft, found } = parseVendorText(text);

    return {
      draft,
      text,
      raw: { provider: this.name, characters: text.length },
      overallConfidence: confidenceFor(found),
      note:
        text.trim().length === 0
          ? 'The OCR engine found no readable text in this document. Please enter the details manually.'
          : noteFor(found),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.worker) return;
    const worker = await this.worker.catch(() => null);
    this.worker = null;
    await worker?.terminate();
  }

  private async recognise(buffer: Buffer): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(buffer);
    return data.text ?? '';
  }

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.logger.log('Starting the Tesseract OCR engine (English).');
      this.worker = createWorker('eng').catch((error: unknown) => {
        // Allow a retry on the next document if start-up failed.
        this.worker = null;
        throw new Error(`The OCR engine could not start: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
    return this.worker;
  }
}
