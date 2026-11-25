import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

/**
 * Refresh-token rotation. The web app can legitimately present the same
 * refresh token twice at once (parallel page loads); that must not be
 * treated as theft. A genuinely replayed token still revokes every session.
 */
describe('AuthService.refresh', () => {
  const TOKEN = 'refresh.jwt.token';
  const hash = createHash('sha256').update(TOKEN).digest('hex');
  const user = { id: 'u1', email: 'a@b.c', status: 'ACTIVE', archivedAt: null };
  const context = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  let prisma: {
    refreshToken: { findUnique: jest.Mock; updateMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };
  let service: AuthService;

  const stored = (overrides: Record<string, unknown> = {}) => ({
    id: 't1',
    userId: 'u1',
    tokenHash: hash,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    user,
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { record: jest.fn() };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', type: 'refresh' }),
      signAsync: jest.fn().mockResolvedValue('signed'),
    };
    const config = { getOrThrow: () => 'secret', get: (_k: string, d: string) => d };
    service = new AuthService(prisma as never, jwt as never, config as never, {} as never, audit as never);
  });

  it('rotates a live token atomically and issues a new pair', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(stored());
    const tokens = await service.refresh(TOKEN, context);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1', revokedAt: null } }),
    );
    expect(tokens.accessToken).toBe('signed');
  });

  it('answers a concurrent duplicate refresh (rotated seconds ago, live successor) without revoking sessions', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date(Date.now() - 2000) }));
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'successor' });
    const tokens = await service.refresh(TOKEN, context);
    expect(tokens.refreshToken).toBe('signed');
    // updateMany here would be the revoke-all path
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('treats an old replayed token as theft and revokes every session', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date(Date.now() - 5 * 60_000) }));
    await expect(service.refresh(TOKEN, context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.refresh.reuse_detected' }));
  });

  it('does not grant a grace refresh after logout (no live successor)', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(stored({ revokedAt: new Date(Date.now() - 1000) }));
    prisma.refreshToken.findFirst.mockResolvedValue(null);
    await expect(service.refresh(TOKEN, context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('loser of a simultaneous rotation still gets a pair when the winner issued a successor', async () => {
    prisma.refreshToken.findUnique
      .mockResolvedValueOnce(stored())
      .mockResolvedValueOnce(stored({ revokedAt: new Date() }));
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.refreshToken.findFirst.mockResolvedValue({ id: 'successor' });
    await expect(service.refresh(TOKEN, context)).resolves.toEqual(expect.objectContaining({ accessToken: 'signed' }));
  });
});
