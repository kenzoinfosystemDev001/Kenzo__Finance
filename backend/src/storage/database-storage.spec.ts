import { Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { DatabaseStorageDriver, isDatabaseKey } from './drivers/database-storage.driver';
import { StorageService } from './storage.service';

const ID = '3f2b8c1e-9a4d-4c7e-8b1a-2d3e4f5a6b7c';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function prismaMock(row: { content: Uint8Array } | null = null) {
  return {
    storedFile: {
      create: jest.fn().mockResolvedValue({ id: ID }),
      findUnique: jest.fn().mockResolvedValue(row),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('DatabaseStorageDriver', () => {
  it('stores the bytes and returns a db: key with the checksum and size', async () => {
    const prisma = prismaMock();
    const driver = new DatabaseStorageDriver(prisma as never);
    const bytes = Buffer.from('%PDF-1.7 invoice');

    const saved = await driver.save(bytes, { folder: 'final-invoices/../x', originalFilename: 'inv.pdf', mimeType: 'application/pdf' });

    expect(saved).toEqual({ storageKey: `db:${ID}`, checksumSha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length });
    const data = prisma.storedFile.create.mock.calls[0][0].data;
    expect(Buffer.from(data.content).equals(bytes)).toBe(true);
    expect(data.folder).toBe('final-invoicesx'); // path characters stripped
  });

  it('streams back exactly the stored bytes', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
    const driver = new DatabaseStorageDriver(prismaMock({ content: new Uint8Array(bytes) }) as never);
    expect((await readAll(await driver.createReadStream(`db:${ID}`))).equals(bytes)).toBe(true);
  });

  it('reports a missing or malformed key as not found, without querying for garbage', async () => {
    // These failures are expected here; capture the log instead of printing it.
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const prisma = prismaMock(null);
      const driver = new DatabaseStorageDriver(prisma as never);
      await expect(driver.createReadStream(`db:${ID}`)).rejects.toBeInstanceOf(NotFoundException);
      await expect(driver.createReadStream('db:not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.storedFile.findUnique).toHaveBeenCalledTimes(1);
      // A missing file is an error worth alerting on; a malformed key is only a warning.
      expect(error).toHaveBeenCalledWith(`Stored file missing for key db:${ID}`);
      expect(warn).toHaveBeenCalledWith('Rejected malformed database storage key db:not-a-uuid');
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it('removes idempotently and ignores keys it does not own', async () => {
    const prisma = prismaMock();
    const driver = new DatabaseStorageDriver(prisma as never);
    await driver.remove(`db:${ID}`);
    await driver.remove('vendors/2026/11/file.pdf');
    expect(prisma.storedFile.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.storedFile.deleteMany).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it('recognises database keys', () => {
    expect(isDatabaseKey(`db:${ID}`)).toBe(true);
    expect(isDatabaseKey('raw:kenzo-erp/x')).toBe(false);
  });
});

describe('StorageService routing', () => {
  const driver = (name: string) => ({ name, save: jest.fn(), createReadStream: jest.fn(), remove: jest.fn() });
  const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };

  function build(active: 'database' | 'local' | 'cloudinary') {
    const drivers = { database: driver('database'), local: driver('local'), cloudinary: driver('cloudinary') };
    const service = new StorageService(drivers[active] as never, config as never, drivers.database as never, drivers.local as never, drivers.cloudinary as never);
    return { service, drivers };
  }

  it('writes new files to the active driver', async () => {
    const { service, drivers } = build('database');
    await service.save(Buffer.from('x'), { folder: 'vendors', originalFilename: 'a.pdf' });
    expect(drivers.database.save).toHaveBeenCalled();
    expect(drivers.local.save).not.toHaveBeenCalled();
  });

  it('reads and removes each file from where its key says it lives', async () => {
    const { service, drivers } = build('database');
    await service.createReadStream(`db:${ID}`);
    await service.createReadStream('image:kenzo-erp/products/p1');
    await service.createReadStream('vendors/2026/11/abc.pdf');
    await service.remove('raw:kenzo-erp/docs/d1');
    expect(drivers.database.createReadStream).toHaveBeenCalledWith(`db:${ID}`);
    expect(drivers.cloudinary.createReadStream).toHaveBeenCalledWith('image:kenzo-erp/products/p1');
    expect(drivers.local.createReadStream).toHaveBeenCalledWith('vendors/2026/11/abc.pdf');
    expect(drivers.cloudinary.remove).toHaveBeenCalledWith('raw:kenzo-erp/docs/d1');
  });
});
