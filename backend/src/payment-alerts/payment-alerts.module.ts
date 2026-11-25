import { Module } from '@nestjs/common';
import { PaymentAlertsController } from './payment-alerts.controller';
import { PaymentAlertScheduler } from './payment-alerts.scheduler';
import { PaymentAlertsService } from './payment-alerts.service';

/** Customer payment due alerts: live list, reminder history, and the background sweep. */
@Module({
  controllers: [PaymentAlertsController],
  providers: [PaymentAlertsService, PaymentAlertScheduler],
  exports: [PaymentAlertsService],
})
export class PaymentAlertsModule {}
