'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import { clearSessionCookies } from './session';
import type { ActionResult } from './vendor-actions';
import type { RoleWithPermissions, UserListItem } from './types';

/**
 * Server actions for Users & Roles and the self-service account page.
 *
 * They call the NestJS API with the signed-in user's session. The API owns
 * every privilege rule (Super Admin protection, no self-escalation, no
 * granting access you do not hold), so its messages are passed through as-is.
 * Passwords are forwarded to the API and never logged, stored or returned.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_CODE = /^[A-Z][A-Z0-9_]{1,49}$/;
const MIN_PASSWORD = 12;

/** IDs are interpolated into API paths, so they must be exactly a UUID. */
function assertId(value: string | null | undefined, label = 'id'): string {
  if (!value || !UUID.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function toResult(error: unknown, fallback: string): ActionResult {
  if (error instanceof ApiError) {
    const messages = error.messages;
    return {
      error: messages.length > 1 ? 'Please correct the highlighted problems.' : messages[0],
      errors: messages.length > 1 ? messages : undefined,
    };
  }
  return { error: fallback };
}

function refreshUser(userId?: string): void {
  revalidatePath('/users');
  if (userId) revalidatePath(`/users/${userId}`);
}

function cleanRoleCodes(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim()).filter((code) => ROLE_CODE.test(code)))];
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface CreateUserPayload {
  email: string;
  fullName: string;
  phone: string;
  password: string;
  roleCodes: string[];
}

export async function createUserAction(payload: CreateUserPayload): Promise<ActionResult> {
  if (!payload.fullName.trim()) return { error: 'Full name is required.' };
  if (!payload.email.trim()) return { error: 'Email address is required.' };
  if (payload.password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  const roleCodes = cleanRoleCodes(payload.roleCodes);
  if (roleCodes.length === 0) return { error: 'Assign at least one role.' };

  let user: UserListItem;
  try {
    user = await apiFetch<UserListItem>('/users', {
      method: 'POST',
      body: {
        email: payload.email.trim(),
        fullName: payload.fullName.trim(),
        ...(payload.phone.trim() ? { phone: payload.phone.trim() } : {}),
        password: payload.password,
        roleCodes,
      },
    });
  } catch (error) {
    return toResult(error, 'The user could not be created.');
  }

  refreshUser();
  redirect(`/users/${user.id}?created=1`);
}

export async function updateUserProfileAction(
  userId: string,
  input: { fullName: string; phone: string },
): Promise<ActionResult> {
  const id = assertId(userId, 'user');
  if (!input.fullName.trim()) return { error: 'Full name is required.' };
  try {
    await apiFetch(`/users/${id}`, {
      method: 'PATCH',
      body: { fullName: input.fullName.trim(), phone: input.phone.trim() || null },
    });
  } catch (error) {
    return toResult(error, 'The changes could not be saved.');
  }
  refreshUser(id);
  return { ok: true };
}

export async function updateUserRolesAction(userId: string, roleCodes: string[]): Promise<ActionResult> {
  const id = assertId(userId, 'user');
  const codes = cleanRoleCodes(roleCodes);
  if (codes.length === 0) return { error: 'Assign at least one role.' };
  try {
    await apiFetch(`/users/${id}`, { method: 'PATCH', body: { roleCodes: codes } });
  } catch (error) {
    return toResult(error, 'The roles could not be changed.');
  }
  refreshUser(id);
  revalidatePath('/users/roles');
  return { ok: true };
}

export async function setUserActiveAction(userId: string, active: boolean, reason?: string): Promise<ActionResult> {
  const id = assertId(userId, 'user');
  try {
    await apiFetch(`/users/${id}/${active ? 'activate' : 'deactivate'}`, {
      method: 'POST',
      body: reason?.trim() ? { reason: reason.trim() } : {},
    });
  } catch (error) {
    return toResult(error, active ? 'The user could not be activated.' : 'The user could not be deactivated.');
  }
  refreshUser(id);
  return { ok: true };
}

export async function resetUserPasswordAction(userId: string, password: string): Promise<ActionResult> {
  const id = assertId(userId, 'user');
  if (password.length < MIN_PASSWORD) return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  try {
    await apiFetch(`/users/${id}/reset-password`, { method: 'POST', body: { password } });
  } catch (error) {
    return toResult(error, 'The password could not be reset.');
  }
  refreshUser(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function setRolePermissionsAction(
  roleId: string,
  permissionCodes: string[],
): Promise<ActionResult & { role?: RoleWithPermissions }> {
  const id = assertId(roleId, 'role');
  try {
    const role = await apiFetch<RoleWithPermissions>(`/roles/${id}/permissions`, {
      method: 'PUT',
      body: { permissionCodes: [...new Set(permissionCodes)] },
    });
    revalidatePath('/users/roles');
    revalidatePath('/users');
    return { ok: true, role };
  } catch (error) {
    return toResult(error, 'The permissions could not be saved.');
  }
}

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

/**
 * Changes the signed-in user's password. The API revokes every session,
 * including this one, so on success the local session is cleared and the
 * user is sent to sign in again with the new password.
 */
export async function changeOwnPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  if (!input.currentPassword) return { error: 'Enter your current password.' };
  if (input.newPassword !== input.confirmPassword) return { error: 'The new passwords do not match.' };

  try {
    await apiFetch('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword },
    });
  } catch (error) {
    return toResult(error, 'The password could not be changed.');
  }

  // Every refresh token was revoked by the API; the cookies are now useless.
  await clearSessionCookies();
  redirect('/login?reason=password-changed');
}
