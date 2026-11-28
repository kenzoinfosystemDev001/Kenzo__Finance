import { PayloadTooLargeException, UnsupportedMediaTypeException, BadRequestException } from '@nestjs/common';
import { DocumentKind } from '@prisma/client';
import { BACKGROUND_MAX_BYTES, BrandingService } from './branding.service';
import { BrandingController } from './branding.controller';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import { BRANDING_SETTING_KEYS } from '../settings/settings.service';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

const ADMIN = { id: 'admin-1', email: 'a@x.test', fullName: 'Admin', roles: [], permissions: [PERMISSIONS.SETTINGS_MANAGE] } as unknown as AuthenticatedUser;

/** Smallest byte sequences the signature check recognises. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

interface DocRow {
  id: string;
  kind: DocumentKind;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  archivedAt: Date | null;
}

function setup() {
  const settings = new Map<string, unknown>();
  const documents = new Map<string, DocRow>();
  let seq = 0;

  const prisma: any = {
    document: {
      findUnique: jest.fn(async ({ where }: any) => documents.get(where.id) ?? null),
      count: jest.fn(async ({ where }: any) =>
        [...documents.values()].filter((d) => d.storageKey === where.storageKey && d.id !== where.id.not).length,
      ),
    },
  };
  const storageService: any = {
    remove: jest.fn(async () => undefined),
    createReadStream: jest.fn(),
  };
  const documentsService: any = {
    upload: jest.fn(async (input: any) => {
      seq += 1;
      const row: DocRow = {
        id: `doc-${seq}`,
        kind: input.kind,
        storageKey: `branding/key-${seq}`,
        originalFilename: input.originalFilename,
        mimeType: 'image/png',
        sizeBytes: input.buffer.length,
        createdAt: new Date(),
        archivedAt: null,
      };
      documents.set(row.id, row);
      return row;
    }),
    archive: jest.fn(async (id: string) => {
      const row = documents.get(id)!;
      row.archivedAt = new Date();
      return row;
    }),
  };
  const settingsService: any = {
    get: jest.fn(async (key: string) => settings.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      settings.set(key, value);
      return { key, value };
    }),
  };

  const service = new BrandingService(prisma, storageService, documentsService, settingsService);
  return { service, settings, documents, storageService, documentsService };
}

describe('BrandingService', () => {
  it('rejects bytes that are not a PNG, JPEG or WEBP image, before storing anything', async () => {
    const { service, documentsService } = setup();
    const fakeImage = { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), originalname: 'evil.png' };
    await expect(service.setBackground('login', fakeImage, ADMIN)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    const pdf = { buffer: Buffer.from('%PDF-1.7\n...'), originalname: 'bg.jpg' };
    await expect(service.setBackground('sidebar', pdf, ADMIN)).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('rejects images over 5 MB', async () => {
    const { service, documentsService } = setup();
    const big = { buffer: Buffer.concat([PNG, Buffer.alloc(BACKGROUND_MAX_BYTES)]), originalname: 'big.png' };
    await expect(service.setBackground('workspace', big, ADMIN)).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('rejects a missing or empty file', async () => {
    const { service } = setup();
    await expect(service.setBackground('login', undefined, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setBackground('login', { buffer: Buffer.alloc(0), originalname: 'x.png' }, ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('stores a valid image as a BRANDING_IMAGE document and points the setting at it', async () => {
    const { service, settings, documentsService } = setup();
    const result = await service.setBackground('sidebar', { buffer: PNG, originalname: 'side.png' }, ADMIN);

    expect(documentsService.upload).toHaveBeenCalledWith(expect.objectContaining({ kind: DocumentKind.BRANDING_IMAGE }), ADMIN);
    expect(settings.get(BRANDING_SETTING_KEYS.SIDEBAR_BACKGROUND_DOCUMENT_ID)).toBe('doc-1');
    expect(result.sidebar?.documentId).toBe('doc-1');
    expect(result.login).toBeNull();
    expect(result.workspace).toBeNull();
  });

  it('replacing an image archives the previous document and deletes its stored file', async () => {
    const { service, settings, documents, storageService, documentsService } = setup();
    await service.setBackground('workspace', { buffer: PNG, originalname: 'one.png' }, ADMIN);
    expect(storageService.remove).not.toHaveBeenCalled();

    await service.setBackground('workspace', { buffer: PNG, originalname: 'two.png' }, ADMIN);

    expect(settings.get(BRANDING_SETTING_KEYS.WORKSPACE_BACKGROUND_DOCUMENT_ID)).toBe('doc-2');
    expect(documentsService.archive).toHaveBeenCalledWith('doc-1', ADMIN);
    expect(documents.get('doc-1')!.archivedAt).not.toBeNull();
    expect(storageService.remove).toHaveBeenCalledTimes(1);
    expect(storageService.remove).toHaveBeenCalledWith('branding/key-1');
  });

  it('removing an image clears the setting and deletes the stored file', async () => {
    const { service, settings, storageService } = setup();
    await service.setBackground('login', { buffer: PNG, originalname: 'login.png' }, ADMIN);

    const result = await service.removeBackground('login', ADMIN);

    expect(settings.get(BRANDING_SETTING_KEYS.LOGIN_BACKGROUND_DOCUMENT_ID)).toBeNull();
    expect(storageService.remove).toHaveBeenCalledWith('branding/key-1');
    expect(result.login).toBeNull();
    expect(await service.getLoginBranding()).toEqual({ backgroundId: null });
  });

  it('keeps the stored file when another document still references it', async () => {
    const { service, documents, storageService } = setup();
    await service.setBackground('login', { buffer: PNG, originalname: 'login.png' }, ADMIN);
    documents.set('other', { ...documents.get('doc-1')!, id: 'other' });

    await service.removeBackground('login', ADMIN);
    expect(storageService.remove).not.toHaveBeenCalled();
  });

  it('a storage failure during cleanup does not fail the change', async () => {
    const { service, storageService } = setup();
    storageService.remove.mockRejectedValueOnce(new Error('cloudinary down'));
    await service.setBackground('sidebar', { buffer: PNG, originalname: 'a.png' }, ADMIN);
    await expect(service.removeBackground('sidebar', ADMIN)).resolves.toMatchObject({ sidebar: null });
  });
});

describe('BrandingController permissions', () => {
  const proto = BrandingController.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const permissionsOf = (method: string) => Reflect.getMetadata(PERMISSIONS_KEY, proto[method]);
  const isPublic = (method: string) => Reflect.getMetadata(IS_PUBLIC_KEY, proto[method]) === true;

  it.each(['uploadBackground', 'removeBackground', 'setAppearance', 'restoreAppearance'])(
    '%s requires settings.manage and is not public',
    (method) => {
      expect(permissionsOf(method)).toEqual([PERMISSIONS.SETTINGS_MANAGE]);
      expect(isPublic(method)).toBe(false);
    },
  );

  it.each(['getLogin', 'background'])('%s is public (sign-in page, no session)', (method) => {
    expect(isPublic(method)).toBe(true);
  });

  it.each(['getAppearance', 'appearanceImage'])('%s is open to any signed-in user but not public', (method) => {
    expect(isPublic(method)).toBe(false);
    expect(permissionsOf(method)).toEqual([]);
  });
});
