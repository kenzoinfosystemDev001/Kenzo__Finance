import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../email/mailer.service';
import { PasswordService } from './password.service';
import type { RequestContext } from './auth.service';

/** How long an emailed reset link stays valid. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Same answer whether or not the address belongs to an account. */
export const FORGOT_PASSWORD_MESSAGE =
  'If an active account exists for that email address, a password reset link has been sent. The link expires in 30 minutes.';

/** One message for every unusable token: unknown, expired, used or inactive account. */
export const INVALID_RESET_TOKEN_MESSAGE =
  'This password reset link is invalid or has expired. Request a new one.';

/**
 * Self-service password reset.
 *
 * Tokens are 32 random bytes sent to the user's mailbox; only their SHA-256
 * is stored, so a database leak yields no usable links. A token is
 * single-use, expires after 30 minutes, and a new request invalidates every
 * earlier one. A successful reset ends every session of the account.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly mailer: MailerService,
    private readonly auditService: AuditService,
  ) {}

  async requestReset(email: string, context: RequestContext): Promise<{ message: string }> {
    const normalised = email.trim().toLowerCase();
    // Generated and hashed on every path so the work done does not depend on
    // whether the account exists.
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(rawToken);

    const user = await this.prisma.user.findFirst({
      where: { email: normalised, archivedAt: null },
      select: { id: true, email: true, fullName: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      return { message: FORGOT_PASSWORD_MESSAGE };
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // A new request supersedes every earlier unused link.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
          requestedIp: context.ipAddress ?? null,
        },
      });
      await this.auditService.record(
        {
          actorUserId: user.id,
          action: 'auth.password.reset_requested',
          entityType: 'User',
          entityId: user.id,
          summary: `Password reset link requested for ${user.email}`,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });

    // Sent in the background: waiting for the mail server would make the
    // response for a real account measurably slower than for an unknown one.
    void this.sendResetEmail(user, rawToken);

    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(rawToken: string, newPassword: string, context: RequestContext): Promise<{ reset: true }> {
    const tokenHash = hashResetToken(rawToken);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true, archivedAt: true } } },
    });

    const now = new Date();
    if (
      !stored ||
      stored.usedAt ||
      stored.expiresAt <= now ||
      stored.user.status !== 'ACTIVE' ||
      stored.user.archivedAt
    ) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    const userId = stored.userId;

    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: of two simultaneous submissions only one wins.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
      }
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      });
      // Every other outstanding link for the account is void.
      await tx.passwordResetToken.deleteMany({
        where: { userId, id: { not: stored.id } },
      });
      // Same revocation as an administrator reset: every session ends.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.auditService.record(
        {
          actorUserId: userId,
          action: 'auth.password.reset',
          entityType: 'User',
          entityId: userId,
          summary: `Password reset via emailed link for ${stored.user.email}; all sessions revoked`,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });

    return { reset: true };
  }

  private async sendResetEmail(
    user: { id: string; email: string; fullName: string },
    rawToken: string,
  ): Promise<void> {
    if (this.mailer.missingSettings().length > 0) {
      // Settings are not named: the caller learns nothing about server config.
      this.logger.warn(`Password reset requested for user ${user.id}, but email sending is not configured; no link was sent.`);
      return;
    }
    const webUrl = (this.configService.get<string>('WEB_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
    const link = `${webUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await this.mailer.send({
        to: user.email,
        cc: [],
        subject: 'Reset your Kenzo password',
        text: [
          `Hello ${user.fullName},`,
          '',
          'We received a request to reset the password for your Kenzo account.',
          'Open the link below to choose a new password. It expires in 30 minutes and can be used once.',
          '',
          link,
          '',
          'If you did not request this, you can ignore this email; your password will not change.',
        ].join('\n'),
        attachments: [],
      });
    } catch (error) {
      const code = (error as { code?: string })?.code ?? 'UNKNOWN';
      this.logger.warn(`Password reset email for user ${user.id} was not sent (${code}).`);
    }
  }
}

export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
