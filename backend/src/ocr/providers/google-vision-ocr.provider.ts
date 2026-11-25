import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  OcrExtractionResult,
  OcrInput,
  OcrProvider,
} from '../ocr-provider.interface';
import { parseVendorText } from '../vendor-text-parser';
import { confidenceFor, isReadableAsText, noteFor } from './stub-ocr.provider';

const VISION_BASE = 'https://vision.googleapis.com/v1';
const TIMEOUT_MS = 30_000;
/** files:annotate processes at most 5 pages per synchronous request. */
const MAX_PDF_PAGES = 5;

interface VisionTextAnnotation {
  fullTextAnnotation?: { text?: string };
  error?: { code?: number; message?: string };
}

interface VisionImageResponse {
  responses?: VisionTextAnnotation[];
}

interface VisionFileResponse {
  responses?: Array<{ responses?: VisionTextAnnotation[]; error?: { message?: string } }>;
}

/**
 * Google Cloud Vision provider (OCR_PROVIDER=google-vision, OCR_API_KEY set).
 *
 * Uses the REST API with an API key - no SDK dependency. Images go to
 * images:annotate, PDF/TIFF to files:annotate (first 5 pages). The returned
 * text is parsed by the same rules as every other provider.
 *
 * Failures (bad key, quota, network) are thrown, which OcrService records as
 * a FAILED job with the reason; the uploaded document is kept either way.
 * The API key is sent as a query parameter as Google requires, and is never
 * included in an error message or log line.
 */
@Injectable()
export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = 'google-vision';
  private readonly logger = new Logger(GoogleVisionOcrProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async extractVendor(input: OcrInput): Promise<OcrExtractionResult> {
    let text: string;
    let pages = 1;

    if (isReadableAsText(input.mimeType, input.originalFilename)) {
      text = input.buffer.toString('utf8');
    } else if (input.mimeType === 'application/pdf' || input.mimeType === 'image/tiff') {
      const result = await this.annotateFile(input);
      text = result.text;
      pages = result.pages;
    } else {
      text = await this.annotateImage(input);
    }

    const { draft, found } = parseVendorText(text);

    return {
      draft,
      text,
      raw: { provider: this.name, characters: text.length, pages },
      overallConfidence: confidenceFor(found),
      note:
        text.trim().length === 0
          ? 'The OCR engine found no readable text in this document. Please enter the details manually.'
          : noteFor(found),
    };
  }

  private async annotateImage(input: OcrInput): Promise<string> {
    const body = {
      requests: [
        {
          image: { content: input.buffer.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    };
    const json = await this.post<VisionImageResponse>('images:annotate', body);
    const first = json.responses?.[0];
    if (first?.error?.message) throw new Error(`OCR engine error: ${first.error.message}`);
    return first?.fullTextAnnotation?.text ?? '';
  }

  private async annotateFile(input: OcrInput): Promise<{ text: string; pages: number }> {
    const body = {
      requests: [
        {
          inputConfig: { content: input.buffer.toString('base64'), mimeType: input.mimeType },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: Array.from({ length: MAX_PDF_PAGES }, (_, index) => index + 1),
        },
      ],
    };
    const json = await this.post<VisionFileResponse>('files:annotate', body);
    const file = json.responses?.[0];
    if (file?.error?.message) throw new Error(`OCR engine error: ${file.error.message}`);
    const pageResults = file?.responses ?? [];
    return {
      text: pageResults.map((page) => page.fullTextAnnotation?.text ?? '').join('\n'),
      pages: pageResults.length,
    };
  }

  private async post<T>(method: string, body: unknown): Promise<T> {
    const apiKey = this.configService.get<string>('OCR_API_KEY');
    if (!apiKey) {
      throw new Error('OCR_API_KEY is not configured for the google-vision provider.');
    }

    let response: Response;
    try {
      response = await fetch(`${VISION_BASE}/${method}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'could not be reached';
      throw new Error(`The OCR service ${reason}. The document was saved; enter the details manually or retry.`);
    }

    if (!response.ok) {
      // Google's error body names the problem (invalid key, API disabled,
      // quota) without echoing the key, so its message is safe to surface.
      const detail = await response
        .json()
        .then((payload: { error?: { message?: string } }) => payload.error?.message)
        .catch(() => undefined);
      this.logger.warn(`Vision ${method} returned ${response.status}`);
      throw new Error(`OCR service rejected the request (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    return (await response.json()) as T;
  }
}
