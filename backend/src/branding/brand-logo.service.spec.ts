import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';
import { BRAND_LOGO_MAX_BYTES, BrandLogoService } from './brand-logo.service';

const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'a@x.test', fullName: 'A', roles: [], permissions: [] } as unknown as AuthenticatedUser;

function makePrisma() {
  let row: { data: Buffer; mimeType: string; sha256: string; width: number; height: number } | null = null;
  const prisma: any = {
    get row() {
      return row;
    },
    brandLogo: {
      findUnique: jest.fn(async () => (row ? { ...row } : null)),
      upsert: jest.fn(async ({ create, update }: any) => {
        row = { ...(row ?? create), ...update, data: Buffer.from(update.data) };
        return row;
      }),
      deleteMany: jest.fn(async () => {
        const count = row ? 1 : 0;
        row = null;
        return { count };
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return prisma;
}

describe('BrandLogoService', () => {
  let prisma: any;
  let audit: { record: jest.Mock };
  let service: BrandLogoService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { record: jest.fn(async () => undefined) };
    service = new BrandLogoService(prisma, audit as any);
  });

  it('stores a PNG logo and keeps its transparency', async () => {
    // A square with a transparent border: transparency must survive the re-encode.
    const buffer = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 150, height: 150, channels: 4, background: { r: 30, g: 120, b: 200, alpha: 1 } } }).png().toBuffer(), gravity: 'centre' }])
      .png()
      .toBuffer();

    await service.upload({ buffer, originalname: 'logo.png' }, ADMIN, {});

    const stored = await service.get();
    expect(stored?.mimeType).toBe('image/png');
    const meta = await sharp(stored!.data).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'branding.logo.added' }), expect.anything());
  });

  it('accepts a JPEG and records a replacement on the second upload', async () => {
    const jpg = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#2c3e50' } }).jpeg().toBuffer();
    await service.upload({ buffer: jpg, originalname: 'a.jpg' }, ADMIN, {});
    await service.upload({ buffer: jpg, originalname: 'a.jpg' }, ADMIN, {});
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'branding.logo.replaced' }), expect.anything());
  });

  it('rejects files that are not PNG, JPEG or WEBP, whatever the filename says', async () => {
    const text = Buffer.from('definitely not a logo, just some text. '.repeat(8));
    await expect(service.upload({ buffer: text, originalname: 'logo.png' }, ADMIN, {})).rejects.toThrow(UnsupportedMediaTypeException);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(service.upload({ buffer: svg, originalname: 'logo.svg' }, ADMIN, {})).rejects.toThrow(UnsupportedMediaTypeException);
    expect(prisma.row).toBeNull();
  });

  it('rejects a corrupted image with a valid header', async () => {
    const good = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer();
    const broken = Buffer.concat([good.subarray(0, 40), Buffer.alloc(300, 0x5a)]);
    await expect(service.upload({ buffer: broken, originalname: 'x.png' }, ADMIN, {})).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('enforces the size and minimum dimensions', async () => {
    const big = Buffer.alloc(BRAND_LOGO_MAX_BYTES + 1, 0);
    await expect(service.upload({ buffer: big, originalname: 'big.png' }, ADMIN, {})).rejects.toThrow(PayloadTooLargeException);
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(service.upload({ buffer: tiny, originalname: 'tiny.png' }, ADMIN, {})).rejects.toThrow(BadRequestException);
  });

  it('restores the default by deleting the row, and does not audit a no-op', async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer();
    await service.upload({ buffer: png, originalname: 'l.png' }, ADMIN, {});
    await service.remove(ADMIN, {});
    expect(await service.get()).toBeNull();
    audit.record.mockClear();
    await service.remove(ADMIN, {});
    expect(audit.record).not.toHaveBeenCalled();
  });
});
