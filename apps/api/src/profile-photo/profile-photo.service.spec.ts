import { ForbiddenException, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException, BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { PROFILE_PHOTO_MAX_BYTES, ProfilePhotoService } from './profile-photo.service';

const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const SUPER_ID = '33333333-3333-4333-8333-333333333333';

function actor(overrides: Partial<AuthenticatedUser> & { id: string }): AuthenticatedUser {
  return { email: `${overrides.id}@x.test`, fullName: 'Test', roles: [], permissions: [], ...overrides } as AuthenticatedUser;
}

/** Minimal in-memory stand-in for the three Prisma calls the service makes. */
function makePrisma(users: Record<string, { roles: string[] }>) {
  const photos = new Map<string, { data: Buffer; mimeType: string; sha256: string; sizeBytes: number }>();
  const prisma: any = {
    photos,
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        const u = users[where.id];
        if (!u) return null;
        return { id: where.id, email: `${where.id}@x.test`, roles: u.roles.map((code) => ({ role: { code } })) };
      }),
    },
    userProfilePhoto: {
      findUnique: jest.fn(async ({ where }: any) => photos.get(where.userId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = photos.has(where.userId) ? update : create;
        photos.set(where.userId, { ...row, data: Buffer.from(row.data) });
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: any) => ({ count: photos.delete(where.userId) ? 1 : 0 })),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

async function png(width = 300, height = 200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
}

describe('ProfilePhotoService', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: ProfilePhotoService;
  const self = actor({ id: TARGET_ID, permissions: [] });

  beforeEach(() => {
    prisma = makePrisma({ [TARGET_ID]: { roles: [] }, [OTHER_ID]: { roles: [] }, [SUPER_ID]: { roles: ['SUPER_ADMIN'] } });
    audit = { record: jest.fn(async () => undefined) };
    service = new ProfilePhotoService(prisma, audit as any);
  });

  describe('upload validation', () => {
    it('accepts PNG, JPEG and WEBP and stores a 512x512 WEBP', async () => {
      const inputs = [
        await png(),
        await sharp({ create: { width: 300, height: 300, channels: 3, background: '#123' } }).jpeg().toBuffer(),
        await sharp({ create: { width: 300, height: 300, channels: 3, background: '#123' } }).webp().toBuffer(),
      ];
      for (const buffer of inputs) {
        const state = await service.upload(TARGET_ID, { buffer, originalname: 'face.bin' }, self, {});
        expect(state.hasPhoto).toBe(true);
        const stored = prisma.photos.get(TARGET_ID);
        expect(stored.mimeType).toBe('image/webp');
        const meta = await sharp(stored.data).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(512);
        expect(meta.height).toBe(512);
      }
    });

    it('strips EXIF/GPS metadata from the stored image', async () => {
      const withExif = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#456' } })
        .withExif({ IFD0: { Copyright: 'private-marker' } })
        .jpeg()
        .toBuffer();
      await service.upload(TARGET_ID, { buffer: withExif, originalname: 'a.jpg' }, self, {});
      const stored = prisma.photos.get(TARGET_ID);
      const meta = await sharp(stored.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(stored.data.includes(Buffer.from('private-marker'))).toBe(false);
    });

    it('rejects a file whose bytes are not an accepted image, even if named .png', async () => {
      const text = Buffer.from('hello, this is not an image at all, just text');
      await expect(service.upload(TARGET_ID, { buffer: text, originalname: 'evil.png' }, self, {})).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('rejects GIF and other formats outside the allowed set', async () => {
      const gif = Buffer.from('GIF89a' + '\x01\x00\x01\x00' + '\x80\x00\x00' + '\x00\x00\x00\xff\xff\xff' + '!,', 'binary');
      await expect(service.upload(TARGET_ID, { buffer: gif, originalname: 'a.gif' }, self, {})).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it('rejects a file with a valid signature but a corrupted body', async () => {
      const good = await png(300, 300);
      const corrupted = Buffer.concat([good.subarray(0, 40), Buffer.alloc(200, 0x5a)]);
      await expect(service.upload(TARGET_ID, { buffer: corrupted, originalname: 'x.png' }, self, {})).rejects.toThrow(UnsupportedMediaTypeException);
      expect(prisma.photos.size).toBe(0);
    });

    it('rejects files over the size limit before decoding', async () => {
      const big = Buffer.alloc(PROFILE_PHOTO_MAX_BYTES + 1, 0);
      await expect(service.upload(TARGET_ID, { buffer: big, originalname: 'big.png' }, self, {})).rejects.toThrow(PayloadTooLargeException);
    });

    it('rejects images smaller than 128 px on either side', async () => {
      const tiny = await png(64, 300);
      await expect(service.upload(TARGET_ID, { buffer: tiny, originalname: 't.png' }, self, {})).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty upload', async () => {
      await expect(service.upload(TARGET_ID, undefined, self, {})).rejects.toThrow(BadRequestException);
      await expect(service.upload(TARGET_ID, { buffer: Buffer.alloc(0), originalname: 'e.png' }, self, {})).rejects.toThrow(BadRequestException);
    });

    it('writes an audit entry without image bytes', async () => {
      await service.upload(TARGET_ID, { buffer: await png(), originalname: 'a.png' }, self, { ipAddress: '1.2.3.4' });
      expect(audit.record).toHaveBeenCalledTimes(1);
      const [entry] = audit.record.mock.calls[0];
      expect(entry.action).toBe('user.photo.added');
      expect(entry.entityId).toBe(TARGET_ID);
      expect(JSON.stringify(entry)).not.toMatch(/base64|\x89PNG/);
    });
  });

  describe('access control', () => {
    it('lets a user upload, read and remove their own photo', async () => {
      await service.upload(TARGET_ID, { buffer: await png(), originalname: 'a.png' }, self, {});
      const read = await service.read(TARGET_ID, self);
      expect(read.mimeType).toBe('image/webp');
      await service.remove(TARGET_ID, self, {});
      await expect(service.read(TARGET_ID, self)).rejects.toThrow(NotFoundException);
    });

    it('blocks a user without user.update from changing another user', async () => {
      const intruder = actor({ id: OTHER_ID, permissions: [] });
      await expect(service.upload(TARGET_ID, { buffer: await png(), originalname: 'a.png' }, intruder, {})).rejects.toThrow(ForbiddenException);
      await expect(service.remove(TARGET_ID, intruder, {})).rejects.toThrow(ForbiddenException);
      expect(prisma.photos.size).toBe(0);
    });

    it('blocks reading another user without user.read', async () => {
      await service.upload(TARGET_ID, { buffer: await png(), originalname: 'a.png' }, self, {});
      const other = actor({ id: OTHER_ID, permissions: [] });
      await expect(service.read(TARGET_ID, other)).rejects.toThrow(ForbiddenException);
    });

    it('allows an administrator with user.read / user.update to view and change another user', async () => {
      const admin = actor({ id: OTHER_ID, permissions: [PERMISSIONS.USER_READ, PERMISSIONS.USER_UPDATE] as any });
      await service.upload(TARGET_ID, { buffer: await png(), originalname: 'a.png' }, admin, {});
      await expect(service.read(TARGET_ID, admin)).resolves.toBeDefined();
      await service.remove(TARGET_ID, admin, {});
      expect(prisma.photos.size).toBe(0);
    });

    it('keeps the Super Admin rule: a non-super admin cannot change a Super Admin photo', async () => {
      const admin = actor({ id: OTHER_ID, permissions: [PERMISSIONS.USER_READ, PERMISSIONS.USER_UPDATE] as any });
      await expect(service.upload(SUPER_ID, { buffer: await png(), originalname: 'a.png' }, admin, {})).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 when no photo is set, and does not audit a no-op removal', async () => {
      await expect(service.read(TARGET_ID, self)).rejects.toThrow(NotFoundException);
      await service.remove(TARGET_ID, self, {});
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
