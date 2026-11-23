import { ForbiddenException } from '@nestjs/common';
import { assertCanAssignRoles, assertCanManageUser, escalation } from './user-rules';

const admin = { id: 'a', roles: ['ADMIN'], permissions: ['user.read', 'user.create', 'vendor.read', 'vendor.create'] };
const superAdmin = { id: 's', roles: ['SUPER_ADMIN'], permissions: [] };

describe('user administration rules', () => {
  it('a super admin can grant anything', () => {
    expect(escalation(superAdmin, ['payment.verify'])).toEqual([]);
    expect(() => assertCanAssignRoles(superAdmin, [{ code: 'SUPER_ADMIN', name: 'Super Admin', permissions: [] }])).not.toThrow();
  });

  it('nobody else can assign the Super Admin role', () => {
    expect(() => assertCanAssignRoles(admin, [{ code: 'SUPER_ADMIN', name: 'Super Admin', permissions: [] }])).toThrow(ForbiddenException);
  });

  it('cannot assign a role carrying permissions the actor lacks', () => {
    expect(() => assertCanAssignRoles(admin, [{ code: 'ACCOUNTS_MANAGER', name: 'Accounts', permissions: ['vendor.read', 'payment.verify'] }])).toThrow(/payment\.verify/);
    expect(() => assertCanAssignRoles(admin, [{ code: 'VENDOR_MANAGER', name: 'Vendors', permissions: ['vendor.read', 'vendor.create'] }])).not.toThrow();
  });

  it('no self role changes, self deactivation or self password reset', () => {
    expect(() => assertCanManageUser(admin, { id: 'a', roles: ['ADMIN'] }, 'roles')).toThrow(ForbiddenException);
    expect(() => assertCanManageUser(admin, { id: 'a', roles: ['ADMIN'] }, 'status')).toThrow(ForbiddenException);
    expect(() => assertCanManageUser(admin, { id: 'a', roles: ['ADMIN'] }, 'password')).toThrow(ForbiddenException);
    expect(() => assertCanManageUser(admin, { id: 'a', roles: ['ADMIN'] }, 'profile')).not.toThrow();
  });

  it('only a super admin manages super admin accounts', () => {
    expect(() => assertCanManageUser(admin, { id: 'x', roles: ['SUPER_ADMIN'] }, 'status')).toThrow(/Super Admin/);
    expect(() => assertCanManageUser(superAdmin, { id: 'x', roles: ['SUPER_ADMIN'] }, 'status')).not.toThrow();
    expect(() => assertCanManageUser(admin, { id: 'x', roles: ['SALES_MANAGER'] }, 'password')).not.toThrow();
  });
});
