import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { PaymentAlertsController } from './payment-alerts.controller';
import { PaymentAlertScheduler } from './payment-alerts.scheduler';
import { PaymentAlertsService } from './payment-alerts.service';
import { PaymentReminderOutboxService } from './payment-reminder-outbox.service';

/** Customer payment due alerts: live list, reminder history + customer emails, and the background sweep. */
@Module({
  imports: [EmailModule],
  controllers: [PaymentAlertsController],
  providers: [PaymentAlertsService, PaymentReminderOutboxService, PaymentAlertScheduler],
  exports: [PaymentAlertsService],
})
export class PaymentAlertsModule {}
