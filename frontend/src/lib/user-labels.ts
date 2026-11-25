/** Display helpers for Users & Roles. Pure functions, safe on server and client. */

export const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';
export const MIN_PASSWORD_LENGTH = 12;

/** "SALES_MANAGER" -> "Sales Manager" (used only where the role name is unknown). */
export function humanizeCode(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

/** "proforma" -> "Proforma", "final_invoice" -> "Final Invoice". */
export const moduleLabel = humanizeCode;

/** "manage_contacts" -> "Manage contacts". */
export function actionLabel(action: string): string {
  const text = action.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface PermissionLike {
  code: string;
  module: string;
  action: string;
  description?: string | null;
}

/** Groups permissions by module, modules and actions in a stable order. */
export function groupByModule<T extends PermissionLike>(permissions: T[]): Array<{ module: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.module) ?? [];
    list.push(permission);
    groups.set(permission.module, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, items]) => ({ module, items: [...items].sort((a, b) => a.action.localeCompare(b.action)) }));
}

/** Splits bare permission codes ("vendor.read") into module/action pairs. */
export function parsePermissionCodes(codes: string[]): PermissionLike[] {
  return codes.map((code) => {
    const [module, ...rest] = code.split('.');
    return { code, module, action: rest.join('.') || code };
  });
}

/**
 * A rough strength hint for a password typed by an administrator. The API
 * only enforces the minimum length; this just nudges towards better choices.
 */
export function passwordStrength(password: string): { label: string; tone: 'danger' | 'warning' | 'success'; message: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      label: 'Too short',
      tone: 'danger',
      message: `${MIN_PASSWORD_LENGTH - password.length} more character(s) needed (minimum ${MIN_PASSWORD_LENGTH}).`,
    };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 16 && classes >= 3) {
    return { label: 'Strong', tone: 'success', message: 'Long and varied.' };
  }
  if (classes >= 3 || password.length >= 20) {
    return { label: 'Good', tone: 'success', message: 'Meets the minimum. Longer is stronger.' };
  }
  return { label: 'Fair', tone: 'warning', message: 'Meets the minimum. Mix upper/lower case, digits and symbols, or make it longer.' };
}

const ACTIVITY_LABELS: Record<string, string> = {
  'user.create': 'User created',
  'user.update': 'Profile updated',
  'user.roles.update': 'Roles changed',
  'user.activate': 'Activated',
  'user.deactivate': 'Deactivated',
  'user.password.reset': 'Password reset by administrator',
  'auth.login.success': 'Signed in',
  'auth.login.failed': 'Failed sign-in',
  'auth.login.locked': 'Locked after failed sign-ins',
  'auth.password.changed': 'Changed own password',
};

export function userActivityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? actionLabel(action.replace(/\./g, ' '));
}
