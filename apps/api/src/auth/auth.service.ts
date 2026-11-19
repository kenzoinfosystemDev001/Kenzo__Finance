import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import type { AuthTokensDto } from './dto/auth.dto';
import type {
  AuthenticatedUser,
  RefreshTokenPayload,
} from '../common/authz/authenticated-user';
import type { PermissionCode } from '../common/authz/permissions';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async login(
    email: string,
    password: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    const user = await this.prisma.user.findFirst({
      where: { email, archivedAt: null },
    });

    // Same error message and a hash comparison on the miss path, so response
    // content and timing do not reveal whether the email exists.
    if (!user) {
      await this.passwordService.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000',
        password,
      );
      await this.auditService.record({
        action: 'auth.login.failed',
        entityType: 'User',
        summary: `Failed login for unknown email ${email}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is temporarily locked after repeated failed attempts. Try again later.',
      );
    }

    const passwordMatches = await this.passwordService.verify(
      user.passwordHash,
      password,
    );

    if (!passwordMatches) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts, context);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'This account is not active. Contact your administrator.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.auditService.record({
      actorUserId: user.id,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.email} signed in`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.issueTokens(user.id, user.email, context);
  }

  async refresh(
    refreshToken: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.configService.getOrThrow<string>('AUTH_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // A presented token that is not live may be a replay of a rotated token.
      // Revoke the whole family so a stolen token cannot be used further.
      if (stored?.userId) {
        await this.revokeAllForUser(stored.userId);
        await this.auditService.record({
          actorUserId: stored.userId,
          action: 'auth.refresh.reuse_detected',
          entityType: 'User',
          entityId: stored.userId,
          summary: 'Revoked all sessions after refresh-token reuse',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.user.status !== 'ACTIVE' || stored.user.archivedAt) {
      throw new UnauthorizedException('Account is not active');
    }

    // Rotation: the presented token is single-use.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.email, context);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const matches = await this.passwordService.verify(
      user.passwordHash,
      currentPassword,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await this.passwordService.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Changing a password ends every other session.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditService.record(
        {
          actorUserId: userId,
          action: 'auth.password.changed',
          entityType: 'User',
          entityId: userId,
          summary: 'Password changed; all sessions revoked',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
        tx,
      );
    });
  }

  async getProfile(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, archivedAt: null },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    const permissions = new Set<string>();
    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((userRole) => userRole.role.code),
      permissions: [...permissions] as PermissionCode[],
    };
  }

  private async issueTokens(
    userId: string,
    email: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    const accessTtlMs = this.parseTtlMs(
      this.configService.get<string>('AUTH_ACCESS_TTL', '15m'),
    );
    const refreshTtlMs = this.parseTtlMs(
      this.configService.get<string>('AUTH_REFRESH_TTL', '7d'),
    );

    // expiresIn is given in seconds rather than a duration string: the string
    // overload requires a literal template type that a config value cannot be.
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, type: 'access' },
      {
        secret: this.configService.getOrThrow<string>('AUTH_ACCESS_SECRET'),
        expiresIn: Math.floor(accessTtlMs / 1000),
      },
    );

    const jti = randomUUID();
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, jti, type: 'refresh' },
      {
        secret: this.configService.getOrThrow<string>('AUTH_REFRESH_SECRET'),
        expiresIn: Math.floor(refreshTtlMs / 1000),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(accessTtlMs / 1000),
    };
  }

  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
    context: RequestContext,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      },
    });

    await this.auditService.record({
      actorUserId: userId,
      action: shouldLock ? 'auth.login.locked' : 'auth.login.failed',
      entityType: 'User',
      entityId: userId,
      summary: shouldLock
        ? `Account locked after ${attempts} failed attempts`
        : `Failed login attempt ${attempts}`,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Refresh tokens are stored as SHA-256 digests, never in plaintext. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl.trim());
    if (!match) {
      throw new Error(`Unsupported TTL format: ${ttl}. Use 15m, 2h, 7d.`);
    }
    const value = Number(match[1]);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
      match[2] as 's' | 'm' | 'h' | 'd'
    ];
    return value * unitMs;
  }
}
