import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { describeMailFailure } from './mail-errors';

/** Sender for quotation emails. SMTP_FROM overrides it; nothing else is hardcoded. */
export const DEFAULT_SENDER_ADDRESS = 'jitender.saini@kenzoinfosystem.com';
export const SENDER_DISPLAY_NAME = 'Kenzo Infosystems';

export interface OutgoingAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface OutgoingMail {
  to: string;
  cc: string[];
  subject: string;
  text: string;
  attachments: OutgoingAttachment[];
}

/** What the mail server answered. "Accepted" is not delivery to the recipient. */
export interface MailReceipt {
  messageId: string;
  serverResponse: string;
  senderAddress: string;
}

/** Configuration errors name the settings; their values are never returned or logged. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService) {}

  get senderAddress(): string {
    return this.value('SMTP_FROM') || DEFAULT_SENDER_ADDRESS;
  }

  /** Names of missing settings. Empty when sending can be attempted. */
  missingSettings(): string[] {
    const missing: string[] = [];
    if (!this.value('SMTP_HOST')) missing.push('SMTP_HOST');
    if (this.value('SMTP_USER') && !this.value('SMTP_PASSWORD')) missing.push('SMTP_PASSWORD');
    return missing;
  }

  /** Refuses before anything is recorded, so a missing configuration never looks like a sent email. */
  assertConfigured(): void {
    const missing = this.missingSettings();
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Email sending is not configured on the server. Set ${missing.join(' and ')} in the API environment, then try again.`,
      );
    }
  }

  /**
   * Hands the message to the SMTP server and resolves only when it accepts it.
   * Every failure becomes an error with a safe message; no raw server text leaks.
   */
  async send(mail: OutgoingMail): Promise<MailReceipt> {
    this.assertConfigured();
    const user = this.value('SMTP_USER');
    const port = Number(this.value('SMTP_PORT') || 587);
    const secure = this.value('SMTP_SECURE') === 'true' || port === 465;
    const transport = nodemailer.createTransport({
      host: this.value('SMTP_HOST'),
      port,
      secure,
      auth: user ? { user, pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
      ...TIMEOUTS,
    });

    try {
      const info = await transport.sendMail({
        from: { name: SENDER_DISPLAY_NAME, address: this.senderAddress },
        to: mail.to,
        cc: mail.cc.length > 0 ? mail.cc : undefined,
        subject: mail.subject,
        text: mail.text,
        attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      if (info.rejected.length > 0 || info.accepted.length === 0) {
        throw Object.assign(new Error('recipient rejected'), { code: 'REJECTED_RECIPIENT' });
      }
      return { messageId: info.messageId, serverResponse: String(info.response ?? '').slice(0, 500), senderAddress: this.senderAddress };
    } catch (error) {
      const failure = describeMailFailure(error);
      this.logger.warn(`Email not accepted by the mail server (${failure.code}).`);
      throw Object.assign(new Error(failure.message), { code: failure.code, safe: true });
    } finally {
      transport.close();
    }
  }

  private value(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }
}
