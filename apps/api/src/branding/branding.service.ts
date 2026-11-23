import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { DocumentKind, type Document } from '@prisma/client';
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

/** The three independently managed background images. */
export const APPEARANCE_KINDS = ['login', 'sidebar', 'workspace'] as const;
export type AppearanceKind = (typeof APPEARANCE_KINDS)[number];

const SETTING_BY_KIND: Record<AppearanceKind, string> = {
  login: BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID,
  sidebar: BRANDING_SETTING_KEYS.SIDEBAR_BACKGROUND_DOCUMENT_ID,
  workspace: BRANDING_SETTING_KEYS.WORKSPACE_BACKGROUND_DOCUMENT_ID,
};

export function isAppearanceKind(value: string): value is AppearanceKind {
  return (APPEARANCE_KINDS as readonly string[]).includes(value);
}

/** What an authenticated user may see about an active background. */
export interface BackgroundSummary {
  documentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

/** Public sign-in branding. Deliberately exposes no file metadata. */
export interface LoginBranding {
  /** Document id of the current background; changes whenever it is replaced. */
  backgroundId: string | null;
  supportEmail: string | null;
}

export type AppearanceConfig = Record<AppearanceKind, BackgroundSummary | null>;

/**
 * Appearance images (login, sidebar, workspace), managed from Admin -> Appearance.
 *
 * Each image is an ordinary private document of kind BRANDING_IMAGE. Its id is
 * held in one settings key per kind, so each kind has at most one active image
 * by construction. Images are only ever read through an id held in those keys:
 * no caller can name a storage path or an arbitrary document.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Public: only the login background id and support email. */
  async getLoginBranding(): Promise<LoginBranding> {
    const [current, supportEmail] = await Promise.all([
      this.currentDocument('login'),
      this.settingsService.get<string | null>(BRANDING_SETTING_KEYS.SUPPORT_EMAIL),
    ]);
    return { backgroundId: current?.id ?? null, supportEmail: supportEmail ?? null };
  }

  /** Authenticated: the active image of every kind, with its file information. */
  async getAppearance(): Promise<AppearanceConfig> {
    const entries = await Promise.all(
      APPEARANCE_KINDS.map(async (kind) => {
        const doc = await this.currentDocument(kind);
        const summary: BackgroundSummary | null = doc
          ? {
              documentId: doc.id,
              originalFilename: doc.originalFilename,
              mimeType: doc.mimeType,
              sizeBytes: doc.sizeBytes,
              uploadedAt: doc.createdAt,
            }
          : null;
        return [kind, summary] as const;
      }),
    );
    return Object.fromEntries(entries) as AppearanceConfig;
  }

  /** Stream for the active image of a kind; 404 when none is set. */
  async openBackground(kind: AppearanceKind) {
    const document = await this.currentDocument(kind);
    if (!document) throw new NotFoundException('No background image is configured.');

    return {
      // Async since the storage driver may be remote (Cloudinary).
      stream: await this.storageService.createReadStream(document.storageKey),
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
    };
  }

  async setBackground(
    kind: AppearanceKind,
    file: { buffer: Buffer; originalname: string } | undefined,
    actor: AuthenticatedUser,
  ): Promise<AppearanceConfig> {
    if (!file || file.buffer.length === 0) throw new BadRequestException('Choose an image to upload.');
    if (file.buffer.length > BACKGROUND_MAX_BYTES) {
      throw new PayloadTooLargeException('The background image must be 5 MB or smaller.');
    }
    // Checked from the bytes before anything is stored.
    const detected = detectFileType(file.buffer, file.originalname);
    if (!detected || !BACKGROUND_TYPES.has(detected.mimeType)) {
      throw new UnsupportedMediaTypeException('The background must be a PNG, JPEG or WEBP image.');
    }

    const settingKey = SETTING_BY_KIND[kind];
    const previous = await this.settingsService.get<string | null>(settingKey);

    // Store the new file first. If anything fails here the old setting still
    // points at the old, working image.
    const document = await this.documentsService.upload(
      { buffer: file.buffer, originalFilename: file.originalname, kind: DocumentKind.BRANDING_IMAGE },
      actor,
    );

    // Switching the setting is the commit point. Only after it succeeds is the
    // previous file archived (kept for audit, never served again).
    await this.settingsService.set(settingKey, document.id, actor);
    await this.archiveQuietly(previous ?? null, actor);

    return this.getAppearance();
  }

  /** Restores the default for a kind by clearing its image. */
  async removeBackground(kind: AppearanceKind, actor: AuthenticatedUser): Promise<AppearanceConfig> {
    const settingKey = SETTING_BY_KIND[kind];
    const previous = await this.settingsService.get<string | null>(settingKey);
    if (previous) {
      await this.settingsService.set(settingKey, null, actor);
      await this.archiveQuietly(previous, actor);
    }
    return this.getAppearance();
  }

  async setSupportEmail(email: string | null | undefined, actor: AuthenticatedUser): Promise<LoginBranding> {
    await this.settingsService.set(BRANDING_SETTING_KEYS.SUPPORT_EMAIL, normalizeEmail(email) ?? null, actor);
    return this.getLoginBranding();
  }

  /**
   * The active document for a kind, or null. A setting pointing at an archived
   * or missing document is treated as "no image", so the default shows instead
   * of a broken reference.
   */
  private async currentDocument(kind: AppearanceKind): Promise<Document | null> {
    const id = await this.settingsService.get<string | null>(SETTING_BY_KIND[kind]);
    if (!id) return null;
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.archivedAt || document.kind !== DocumentKind.BRANDING_IMAGE) return null;
    return document;
  }

  /** The old image is archived, not deleted, so the change stays auditable. */
  private async archiveQuietly(documentId: string | null, actor: AuthenticatedUser): Promise<void> {
    if (!documentId) return;
    await this.documentsService.archive(documentId, actor).catch(() => undefined);
  }
}
