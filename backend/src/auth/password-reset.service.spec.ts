import { BadRequestException, Logger } from '@nestjs/common';
import {
  FORGOT_PASSWORD_MESSAGE,
  INVALID_RESET_TOKEN_MESSAGE,
  PasswordResetService,
  RESET_TOKEN_TTL_MS,
  hashResetToken,
} from './password-reset.service';

/**
 * Self-service password reset: no account enumeration, tokens stored only as
 * hashes, short-lived and single-use, and a reset ends every session.
 */
describe('PasswordResetService', () => {
  const context = { ipAddress: '203.0.113.7', userAgent: 'jest' };
  const activeUser = { id: 'u1', email: 'a@b.c', fullName: 'Ada', status: 'ACTIVE' };

  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    passwordResetToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailer: { send: jest.Mock; missingSettings: jest.Mock };
  let audit: { record: jest.Mock };
  let passwords: { hash: jest.Mock };
  let service: PasswordResetService;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      passwordResetToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    mailer = { send: jest.fn().mockResolvedValue({}), missingSettings: jest.fn().mockReturnValue([]) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    passwords = { hash: jest.fn().mockResolvedValue('$argon2id$new') };
    const config = { get: (key: string) => (key === 'WEB_URL' ? 'https://erp.example.test/' : undefined) };
    service = new PasswordResetService(
      prisma as never,
      config as never,
      passwords as never,
      mailer as never,
      audit as never,
    );
  });

  describe('requestReset', () => {
    it('returns the generic message and does nothing for an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.requestReset('nobody@x.y', context)).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      await flush();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('returns the same generic message for an inactive account and sends nothing', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...activeUser, status: 'INACTIVE' });
      await expect(service.requestReset('a@b.c', context)).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      await flush();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('stores only the hash of the token, valid 30 minutes, and emails the raw token in the link', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      const before = Date.now();
      await expect(service.requestReset('A@B.C ', context)).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
      await flush();

      expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'a@b.c', archivedAt: null } }));
      const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.requestedIp).toBe('203.0.113.7');
      const ttl = data.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThanOrEqual(RESET_TOKEN_TTL_MS - 1000);
      expect(ttl).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS + 1000);

      const mail = mailer.send.mock.calls[0][0];
      expect(mail.to).toBe('a@b.c');
      const match = /https:\/\/erp\.example\.test\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail.text);
      expect(match).not.toBeNull();
      const raw = decodeURIComponent(match![1]);
      expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
      expect(hashResetToken(raw)).toBe(data.tokenHash);
      // The raw token itself is never persisted.
      expect(JSON.stringify(data)).not.toContain(raw);
    });

    it('invalidates earlier unused tokens before issuing a new one', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      await service.requestReset('a@b.c', context);
      await flush();
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.passwordResetToken.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.passwordResetToken.create.mock.invocationCallOrder[0],
      );
    });

    describe('when email cannot be sent', () => {
      // These failures are expected; capture the warnings instead of printing them.
      let warn: jest.SpyInstance;
      beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      });
      afterEach(() => warn.mockRestore());

      it('still answers generically when email is not configured', async () => {
        prisma.user.findFirst.mockResolvedValue(activeUser);
        mailer.missingSettings.mockReturnValue(['SMTP_HOST']);
        await expect(service.requestReset('a@b.c', context)).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
        await flush();
        expect(mailer.send).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('email sending is not configured'));
      });

      it('still answers generically when the mail server refuses', async () => {
        prisma.user.findFirst.mockResolvedValue(activeUser);
        mailer.send.mockRejectedValue(Object.assign(new Error('refused'), { code: 'AUTH' }));
        await expect(service.requestReset('a@b.c', context)).resolves.toEqual({ message: FORGOT_PASSWORD_MESSAGE });
        await flush();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('was not sent'));
      });
    });
  });

  describe('resetPassword', () => {
    const RAW = 'raw-token-value';
    const stored = (overrides: Record<string, unknown> = {}) => ({
      id: 't1',
      userId: 'u1',
      tokenHash: hashResetToken(RAW),
      usedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      user: { id: 'u1', email: 'a@b.c', status: 'ACTIVE', archivedAt: null },
      ...overrides,
    });

    const expectGenericRejection = async () => {
      const attempt = service.resetPassword(RAW, 'a-brand-new-password', context);
      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toThrow(INVALID_RESET_TOKEN_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    };

    it('looks the token up by its hash only', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(stored());
      await service.resetPassword(RAW, 'a-brand-new-password', context);
      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashResetToken(RAW) } }),
      );
    });

    it('rejects an unknown token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expectGenericRejection();
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(stored({ expiresAt: new Date(Date.now() - 1000) }));
      await expectGenericRejection();
    });

    it('rejects a token that was already used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(stored({ usedAt: new Date() }));
      await expectGenericRejection();
    });

    it('rejects a token of an inactive account', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(
        stored({ user: { id: 'u1', email: 'a@b.c', status: 'INACTIVE', archivedAt: null } }),
      );
      await expectGenericRejection();
    });

    it('rejects when a concurrent request claimed the token first (single use)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(stored());
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      await expectGenericRejection();
    });

    it('sets the new hash, consumes the token, voids others, revokes sessions, clears lockout and audits', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(stored());
      await expect(service.resetPassword(RAW, 'a-brand-new-password', context)).resolves.toEqual({ reset: true });

      expect(passwords.hash).toHaveBeenCalledWith('a-brand-new-password');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { id: 't1', usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: '$argon2id$new', failedLoginAttempts: 0, lockedUntil: null },
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', id: { not: 't1' } } });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth.password.reset', entityId: 'u1', actorUserId: 'u1' }),
        prisma,
      );
    });
  });
});
