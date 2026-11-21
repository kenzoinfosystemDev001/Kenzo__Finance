import { ForbiddenException } from '@nestjs/common';
import { ROLE_CODES } from '../common/authz/permissions';
/** The parts of the signed-in user these rules look at. */
export interface Actor {
  id?: string;
  roles: readonly string[];
  permissions: readonly string[];
}

/**
 * Privilege rules for user and role administration (PRD 4.x: "Administrators
 * can create, deactivate and manage users").
 *
 * - Nobody can hand out access they do not hold themselves: a non-super-admin
 *   may only assign roles (or grant permissions) whose every permission they
 *   already have.
 * - The Super Admin role, and users holding it, are managed only by a Super Admin.
 * - Nobody changes their own roles or deactivates themselves (no self-escalation,
 *   no accidental self-lockout).
 */
export const isSuperAdmin = (actor: Pick<Actor, 'roles'>) => actor.roles.includes(ROLE_CODES.SUPER_ADMIN);

export interface RoleWithPermissions {
  code: string;
  name: string;
  permissions: string[];
}

/** Permissions the actor would be granting that they do not hold. */
export function escalation(actor: Actor, permissions: string[]): string[] {
  if (isSuperAdmin(actor)) return [];
  const held = new Set<string>(actor.permissions);
  return [...new Set(permissions)].filter((p) => !held.has(p));
}

export function assertCanAssignRoles(actor: Actor, roles: RoleWithPermissions[]) {
  if (!isSuperAdmin(actor) && roles.some((r) => r.code === ROLE_CODES.SUPER_ADMIN)) {
    throw new ForbiddenException('Only a Super Admin can assign the Super Admin role.');
  }
  const missing = escalation(actor, roles.flatMap((r) => r.permissions));
  if (missing.length) {
    throw new ForbiddenException(`You cannot assign access you do not hold yourself (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}).`);
  }
}

export function assertCanManageUser(actor: Pick<Actor, 'id' | 'roles'>, target: { id: string; roles: string[] }, action: 'roles' | 'status' | 'password' | 'profile') {
  if (target.id === actor.id && (action === 'roles' || action === 'status')) {
    throw new ForbiddenException(action === 'roles' ? 'You cannot change your own roles.' : 'You cannot deactivate or reactivate your own account.');
  }
  if (target.id === actor.id && action === 'password') {
    throw new ForbiddenException('Use "Change password" to change your own password.');
  }
  if (target.roles.includes(ROLE_CODES.SUPER_ADMIN) && !isSuperAdmin(actor) && target.id !== actor.id) {
    throw new ForbiddenException('Only a Super Admin can manage a Super Admin account.');
  }
}
