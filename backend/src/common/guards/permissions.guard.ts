import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators';
import { ROLE_CODES, type PermissionCode } from '../authz/permissions';
import type { AuthenticatedUser } from '../authz/authenticated-user';

/**
 * Backend authorisation. Runs after JwtAuthGuard.
 *
 * Fails closed: a route with no @RequirePermissions() and no @Public() is
 * rejected, so forgetting the decorator cannot silently expose an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication context missing');
    }

    if (required === undefined) {
      throw new ForbiddenException(
        'This endpoint declares no permission requirement and is refused by default.',
      );
    }

    if (required.length === 0) return true;

    // Super Admin holds every permission by definition, including ones added
    // by a future migration that nobody has granted yet.
    if (user.roles.includes(ROLE_CODES.SUPER_ADMIN)) return true;

    const missing = required.filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
