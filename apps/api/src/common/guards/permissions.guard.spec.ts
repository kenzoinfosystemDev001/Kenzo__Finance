import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS } from '../authz/permissions';
import type { AuthenticatedUser } from '../authz/authenticated-user';

function contextWith(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  /** Returns [isPublic, requiredPermissions] for the two getAllAndOverride calls. */
  const mockMetadata = (isPublic: unknown, required: unknown): void => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementationOnce(() => isPublic as never)
      .mockImplementationOnce(() => required as never);
  };

  it('allows a public route without any user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true as never);

    expect(guard.canActivate(contextWith(undefined))).toBe(true);
  });

  it('fails closed when a route declares no permission requirement', () => {
    mockMetadata(false, undefined);

    expect(() =>
      guard.canActivate(
        contextWith({ roles: ['VENDOR_MANAGER'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a route that declares an empty requirement for any signed-in user', () => {
    mockMetadata(false, []);

    expect(
      guard.canActivate(contextWith({ roles: [], permissions: [] })),
    ).toBe(true);
  });

  it('rejects a user missing the required permission', () => {
    mockMetadata(false, [PERMISSIONS.VENDOR_CREATE]);

    expect(() =>
      guard.canActivate(
        contextWith({ roles: ['SALES_EXECUTIVE'], permissions: [PERMISSIONS.VENDOR_READ] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a user holding every required permission', () => {
    mockMetadata(false, [PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_CREATE]);

    expect(
      guard.canActivate(
        contextWith({
          roles: ['VENDOR_MANAGER'],
          permissions: [PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_CREATE],
        }),
      ),
    ).toBe(true);
  });

  it('rejects when only some of the required permissions are held', () => {
    mockMetadata(false, [PERMISSIONS.VENDOR_READ, PERMISSIONS.VENDOR_ARCHIVE]);

    expect(() =>
      guard.canActivate(
        contextWith({
          roles: ['VENDOR_MANAGER'],
          permissions: [PERMISSIONS.VENDOR_READ],
        }),
      ),
    ).toThrow(/vendor.archive/);
  });

  it('grants Super Admin any permission, including ones never explicitly assigned', () => {
    mockMetadata(false, [PERMISSIONS.SETTINGS_MANAGE]);

    expect(
      guard.canActivate(contextWith({ roles: ['SUPER_ADMIN'], permissions: [] })),
    ).toBe(true);
  });

  it('rejects when no authenticated principal is attached', () => {
    mockMetadata(false, [PERMISSIONS.VENDOR_READ]);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
