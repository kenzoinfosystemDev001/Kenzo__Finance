import {
  ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { PermissionCode } from '../authz/permissions';
import type { AuthenticatedUser } from '../authz/authenticated-user';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';

/** Marks a route as reachable without authentication (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declares the permissions a route requires. The user must hold ALL of them.
 * Enforced by PermissionsGuard on the server - never by the UI alone.
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injects the authenticated principal resolved by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
