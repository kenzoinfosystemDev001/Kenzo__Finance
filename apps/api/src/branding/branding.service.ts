import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DocumentKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentsService } from '../documents/documents.service';
import { BRANDING_SETTING_KEYS, SettingsService } from '../settings/settings.service';
import { detectFileType } from '../common/utils/file-validation';
import { normalizeEmail } from '../common/utils/normalize';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/** Raster formats every browser renders as a CSS background. */
const BACKGROUND_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;

export interface LoginBranding {
  /** Document id of the current background; changes whenever it is replaced. */
  backgroundId: string | null;
  supportEmail: string | null;
}

/**
 * Login-page branding, configured from Settings.
 *
 * The background is an ordinary private document. The public endpoint serves
 * only the single document the setting points at, so it cannot be used to
 * read any other stored file.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  async getLoginBranding(): Promise<LoginBranding> {
    const [backgroundId, supportEmail] = await Promise.all([
      this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID),
      this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.SUPPORT_EMAIL),
    ]);
    return { backgroundId: backgroundId ?? null, supportEmail: supportEmail ?? null };
  }

  /** Stream for the configured background; 404 when none is set. */
  async openLoginBackground() {
    const { backgroundId } = await this.getLoginBranding();
    if (!backgroundId) throw new NotFoundException('No login background is configured.');

    const document = await this.prisma.document.findUnique({ where: { id: backgroundId } });
    if (!document || document.archivedAt || document.kind !== DocumentKind.BRANDING_IMAGE) {
      throw new NotFoundException('No login background is configured.');
    }

    return {
      // Async since the storage driver may be remote (Cloudinary).
      stream: await this.storageService.createReadStream(document.storageKey),
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    };
  }

  async setLoginBackground(
    file: { buffer: Buffer; originalname: string } | undefined,
    actor: AuthenticatedUser,
  ): Promise<LoginBranding> {
    if (!file || file.buffer.length === 0) throw new BadRequestException('Choose an image to upload.');
    if (file.buffer.length > BACKGROUND_MAX_BYTES) {
      throw new PayloadTooLargeException('The background image must be 5 MB or smaller.');
    }
    // Checked from the bytes before anything is stored.
    const detected = detectFileType(file.buffer, file.originalname);
    if (!detected || !BACKGROUND_TYPES.has(detected.mimeType)) {
      throw new UnsupportedMediaTypeException('The background must be a PNG, JPEG or WEBP image.');
    }

    const previous = (await this.getLoginBranding()).backgroundId;
    const document = await this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: DocumentKind.BRANDING_IMAGE },
      actor,
    );

    await this.settingsService.set(BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID, document.id, actor);
    await this.archiveQuietly(previous, actor);

    return this.getLoginBranding();
  }

  async removeLoginBackground(actor: AuthenticatedUser): Promise<LoginBranding> {
    const previous = (await this.getLoginBranding()).backgroundId;
    if (previous) {
      await this.settingsService.set(BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID, null, actor);
      await this.archiveQuietly(previous, actor);
    }
    return this.getLoginBranding();
  }

  async setSupportEmail(email: string | null | undefined, actor: AuthenticatedUser): Promise<LoginBranding> {
    await this.settingsService.set(BRANDING_SETTING_KEYS.SUPPORT_EMAIL, normalizeEmail(email) ?? null, actor);
    return this.getLoginBranding();
  }

  /** The old image is archived, not deleted, so the change stays auditable. */
  private async archiveQuietly(documentId: string | null, actor: AuthenticatedUser): Promise<void> {
    if (!documentId) return;
    await this.documentsService.archive(documentId, actor).catch(() => undefined);
  }
}
