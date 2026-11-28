/**
 * Copies every document file that still lives on local disk or in Cloudinary
 * into PostgreSQL (stored_files) and repoints Document.storageKey to it.
 *
 *   npm run storage:migrate-to-db             (dry run: reports only)
 *   npm run storage:migrate-to-db -- --apply  (copies and repoints)
 *
 * Safe to re-run: documents already in the database are skipped. Each file is
 * verified against the checksum recorded at upload before its key is switched,
 * and the switch is a compare-and-set on the old key, so a concurrent change
 * is never overwritten. The original file is NOT deleted; remove the old
 * storage folder/assets yourself once you have checked the result.
 */
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { validateEnv } from '../config/env.validation';
import { PrismaModule } from '../database/prisma.module';
import { PrismaService } from '../database/prisma.service';
import { DatabaseStorageDriver, isDatabaseKey } from './drivers/database-storage.driver';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../.env')],
      validate: validateEnv,
    }),
    PrismaModule,
    StorageModule,
  ],
  providers: [DatabaseStorageDriver],
})
class MigrateFilesModule {}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const logger = new Logger('MigrateFilesToDatabase');
  const app = await NestFactory.createApplicationContext(MigrateFilesModule, { logger: ['error', 'warn', 'log'] });

  try {
    const prisma = app.get(PrismaService);
    const storage = app.get(StorageService);
    const database = app.get(DatabaseStorageDriver);

    const documents = await prisma.document.findMany({
      where: { NOT: { storageKey: { startsWith: 'db:' } } },
      select: { id: true, storageKey: true, kind: true, originalFilename: true, mimeType: true, checksumSha256: true },
      orderBy: { createdAt: 'asc' },
    });

    logger.log(`${documents.length} document file(s) outside the database. ${apply ? 'Copying.' : 'Dry run - pass --apply to copy.'}`);
    let copied = 0;
    const failures: string[] = [];

    for (const doc of documents) {
      if (isDatabaseKey(doc.storageKey)) continue;
      const source = storage.driverFor(doc.storageKey).name;
      if (!apply) {
        logger.log(`  would copy ${doc.id} (${doc.kind}, ${doc.originalFilename}) from ${source}`);
        continue;
      }
      try {
        const bytes = await readAll(await storage.createReadStream(doc.storageKey));
        const checksum = createHash('sha256').update(bytes).digest('hex');
        if (checksum !== doc.checksumSha256) {
          throw new Error(`checksum mismatch (stored ${doc.checksumSha256.slice(0, 12)}..., read ${checksum.slice(0, 12)}...)`);
        }
        const saved = await database.save(bytes, { folder: doc.kind.toLowerCase(), originalFilename: doc.originalFilename, mimeType: doc.mimeType });
        const switched = await prisma.document.updateMany({ where: { id: doc.id, storageKey: doc.storageKey }, data: { storageKey: saved.storageKey } });
        if (switched.count === 0) {
          await database.remove(saved.storageKey);
          throw new Error('document changed during migration; left as it was');
        }
        copied += 1;
        logger.log(`  copied ${doc.id} from ${source} (${bytes.length} bytes)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${doc.id} (${doc.originalFilename}): ${message}`);
        logger.error(`  FAILED ${doc.id}: ${message}`);
      }
    }

    if (apply) logger.log(`Done: ${copied} copied, ${failures.length} failed.`);
    if (failures.length > 0) {
      logger.warn('Failed documents still point at their original storage and remain readable there:');
      for (const line of failures) logger.warn(`  ${line}`);
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main();
