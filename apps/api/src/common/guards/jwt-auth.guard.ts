import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../authz/authenticated-user';
import type { PermissionCode } from '../authz/permissions';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('AUTH_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Refresh tokens must never be accepted as access tokens.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Roles and permissions are read per request rather than trusted from the
    // token, so revoking a role takes effect immediately instead of when the
    // access token happens to expire.
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, archivedAt: null },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const permissions = new Set<string>();
    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    const principal: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((userRole) => userRole.role.code),
      permissions: [...permissions] as PermissionCode[],
    };

    (request as Request & { user?: AuthenticatedUser }).user = principal;
    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim();
  }
}
