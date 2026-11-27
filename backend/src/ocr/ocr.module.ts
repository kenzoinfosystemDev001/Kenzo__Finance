import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { StubOcrProvider } from './providers/stub-ocr.provider';
import { GoogleVisionOcrProvider } from './providers/google-vision-ocr.provider';
import { TesseractOcrProvider } from './providers/tesseract-ocr.provider';
import { OCR_PROVIDER_TOKEN, type OcrProvider } from './ocr-provider.interface';
import { StorageModule } from '../storage/storage.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [StorageModule, DocumentsModule],
  controllers: [OcrController],
  providers: [
    OcrService,
    StubOcrProvider,
    GoogleVisionOcrProvider,
    TesseractOcrProvider,
    {
      // The active provider is chosen by configuration, so approving a paid
      // provider later means adding a class and a case - no edits to callers.
      provide: OCR_PROVIDER_TOKEN,
      inject: [ConfigService, StubOcrProvider, GoogleVisionOcrProvider, TesseractOcrProvider],
      useFactory: (
        configService: ConfigService,
        stub: StubOcrProvider,
        googleVision: GoogleVisionOcrProvider,
        tesseract: TesseractOcrProvider,
      ): OcrProvider => {
        const configured = configService.get<string>('OCR_PROVIDER', 'stub');
        switch (configured) {
          case 'stub':
            return stub;
          case 'tesseract':
            return tesseract;
          case 'google-vision':
            return googleVision;
          default:
            throw new Error(
              `OCR_PROVIDER="${configured}" is not implemented. ` +
                'Add a provider class implementing OcrProvider and register it here.',
            );
        }
      },
    },
  ],
  exports: [OcrService],
})
export class OcrModule {}
