import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentAlertsService } from './payment-alerts.service';

/**
 * Runs the payment-alert sweep in the background. The sweep is idempotent, so
 * running it more often than needed is harmless, and a missed run is made up
 * by the next one (a stage is recorded the first time it applies).
 *
 * This timer only runs while the API process is awake. A host that sleeps
 * (for example a free instance) pauses it, so an external scheduler should
 * also call POST /payment-alerts/cron with the configured token. Set
 * PAYMENT_ALERTS_ENABLED=false to turn the timer off.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 30 * 1000;

@Injectable()
export class PaymentAlertScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentAlertScheduler.name);
  private interval?: NodeJS.Timeout;
  private firstRun?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly alerts: PaymentAlertsService) {}

  onModuleInit(): void {
    if (process.env.PAYMENT_ALERTS_ENABLED === 'false') {
      this.logger.log('Payment alert scheduler is disabled (PAYMENT_ALERTS_ENABLED=false).');
      return;
    }
    this.firstRun = setTimeout(() => void this.tick(), FIRST_SWEEP_DELAY_MS);
    this.interval = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
    // Never keep the process alive just for this timer.
    this.firstRun.unref();
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.interval) clearInterval(this.interval);
  }

  /** One sweep. Overlapping calls are skipped, and a failure is logged without stopping the timer. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.alerts.sweep(new Date());
    } catch (error) {
      this.logger.error('Payment alert sweep failed; it will retry on the next run.', error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
