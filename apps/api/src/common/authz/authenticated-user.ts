import type { PermissionCode } from './permissions';

/** The principal attached to `request.user` after JwtAuthGuard runs. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: PermissionCode[];
}

/** JWT access-token payload. Kept small: it travels on every request. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}
