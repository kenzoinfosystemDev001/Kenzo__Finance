import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      // Prisma's defaults (maxWait 2s, timeout 5s) are tuned for a database on
      // the same network. Against Neon - pooled, serverless, and liable to a
      // cold start - a legitimate multi-statement transaction such as vendor
      // creation can exceed 5s and abort with "Transaction not found".
      // These limits still bound a genuinely stuck transaction.
      transactionOptions: {
        maxWait: 10_000,
        timeout: 20_000,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
