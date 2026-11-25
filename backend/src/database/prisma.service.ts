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

  /**
   * Connects with retries.
   *
   * Neon suspends its compute after a period of inactivity, so the first
   * connection after an idle spell can time out while the instance wakes.
   * Failing the whole bootstrap on that would leave the API dead until a human
   * restarted it, even though the database comes back seconds later.
   *
   * After the retries are exhausted the application still starts, but logs the
   * failure loudly; /health/ready reports the database as unreachable, and
   * Prisma reconnects on the first successful query.
   */
  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        this.logger.log(
          attempt === 1
            ? 'Database connection established'
            : `Database connection established on attempt ${attempt}`,
        );
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt === maxAttempts) {
          this.logger.error(
            `Could not reach the database after ${maxAttempts} attempts. ` +
              'The API will start, but requests needing the database will fail ' +
              'until it is reachable. Check DATABASE_URL and that the Neon ' +
              `instance is awake. Last error: ${message}`,
          );
          return;
        }

        // 1s, 2s, 4s, 8s - enough for a Neon cold start.
        const delayMs = 1000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database unreachable (attempt ${attempt}/${maxAttempts}). ` +
            `Retrying in ${delayMs}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
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
