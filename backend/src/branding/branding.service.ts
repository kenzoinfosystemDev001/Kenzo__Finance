import {
  BadRequestException,
  Injectable,
  Logger,
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
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

/** Raster formats every browser renders as a CSS background. */
export const BACKGROUND_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;

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
}

export type AppearanceConfig = Record<AppearanceKind, BackgroundSummary | null>;

/**
 * Appearance images (login, sidebar, workspace), managed from Admin -> Appearance.
 *
 * Each image is an ordinary private document of kind BRANDING_IMAGE, saved
 * through StorageService (Cloudinary in production), so it survives restarts
 * and redeploys. Its id is held in one settings key per kind, so each kind has
 * at most one active image by construction. Images are only ever read through
 * an id held in those keys: no caller can name a storage path or an arbitrary
 * document.
 */
@Injectable()
export class BrandingService {
  private readonly logger = new Logger(BrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentsService: DocumentsService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Public: only the login background id. */
  async getLoginBranding(): Promise<LoginBranding> {
    const current = await this.currentDocument('login');
    return { backgroundId: current?.id ?? null };
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
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Choose an image to upload.');
    }
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
    // previous image retired (row archived for audit, stored file deleted).
    await this.settingsService.set(settingKey, document.id, actor);
    await this.retire(previous ?? null, actor);

    return this.getAppearance();
  }

  /** Restores the default for a kind by clearing its image and deleting the stored file. */
  async removeBackground(kind: AppearanceKind, actor: AuthenticatedUser): Promise<AppearanceConfig> {
    const settingKey = SETTING_BY_KIND[kind];
    const previous = await this.settingsService.get<string | null>(settingKey);
    if (previous) {
      await this.settingsService.set(settingKey, null, actor);
      await this.retire(previous, actor);
    }
    return this.getAppearance();
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

  /**
   * Retires an image that is no longer referenced by its setting. The document
   * row is archived (kept for the audit trail, never served again) and the
   * stored file is deleted, so replaced images do not accumulate in storage.
   * The file is kept if anything else still points at the same storage key
   * (another document row or another appearance setting).
   *
   * Never throws: the setting has already switched, so a cleanup failure must
   * not turn a successful change into an error. Failures are logged.
   */
  private async retire(documentId: string | null, actor: AuthenticatedUser): Promise<void> {
    if (!documentId) return;
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.kind !== DocumentKind.BRANDING_IMAGE) return;

    // Still active for another kind? Then it is in use: leave it alone.
    const activeIds = await Promise.all(
      APPEARANCE_KINDS.map((kind) => this.settingsService.get<string | null>(SETTING_BY_KIND[kind])),
    );
    if (activeIds.includes(documentId)) return;

    if (!document.archivedAt) {
      await this.documentsService.archive(documentId, actor).catch((error: unknown) => {
        this.logger.warn(`Could not archive replaced background ${documentId}: ${String(error)}`);
      });
    }

    try {
      const otherReferences = await this.prisma.document.count({
        where: { storageKey: document.storageKey, id: { not: document.id } },
      });
      if (otherReferences > 0) return;
      await this.storageService.remove(document.storageKey);
    } catch (error) {
      this.logger.warn(`Could not delete the stored file of background ${documentId}: ${String(error)}`);
    }
  }
}
