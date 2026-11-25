import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/** Outgoing mail. Configured through SMTP_* environment variables only. */
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class EmailModule {}
