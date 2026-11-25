'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ConfirmDialog, Modal, ResultAlert, TextField, isPhone } from '@/components/client-ui';
import { IconCheckCircle, IconPause, IconPencil, IconRefresh, IconShield } from '@/components/icons';
import {
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserProfileAction,
  updateUserRolesAction,
} from '@/lib/user-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import type { RoleWithPermissions, UserStatus } from '@/lib/types';
import { MIN_PASSWORD_LENGTH } from '@/lib/user-labels';
import { PasswordField, RolePicker } from '../user-form-parts';

type Dialog = 'profile' | 'roles' | 'deactivate' | 'activate' | 'password' | null;

export interface UserActionFlags {
  canEditProfile: boolean;
  canEditRoles: boolean;
  canChangeStatus: boolean;
  canResetPassword: boolean;
}

/**
 * Administrative actions on one user. Each is offered only when the signed-in
 * user holds the permission and the API's rules allow it for this account;
 * the API enforces the same rules and its message is shown if it refuses.
 */
export function UserActions({
  user,
  flags,
  roles,
}: {
  user: {
    id: string;
    fullName: string;
    phone: string | null;
    status: UserStatus;
    locked: boolean;
    roleCodes: string[];
  };
  flags: UserActionFlags;
  /** Roles that may be offered in the role editor (null when not loadable). */
  roles: RoleWithPermissions[] | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lockedOut = user.status === 'LOCKED' || user.locked;
  const showDeactivate = flags.canChangeStatus && user.status !== 'INACTIVE';
  const showActivate = flags.canChangeStatus && (user.status !== 'ACTIVE' || user.locked);
  const activateLabel = user.status === 'INACTIVE' ? 'Activate' : 'Unlock';

  const finish = (message: string) => {
    setDialog(null);
    setNotice(message);
    router.refresh();
  };

  const nothing =
    !flags.canEditProfile && !(flags.canEditRoles && roles) && !showDeactivate && !showActivate && !flags.canResetPassword;
  if (nothing) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {flags.canEditProfile && (
          <button type="button" className="btn-secondary" onClick={() => setDialog('profile')}>
            <IconPencil size={16} /> Edit details
          </button>
        )}
        {flags.canEditRoles && roles && (
          <button type="button" className="btn-secondary" onClick={() => setDialog('roles')}>
            <IconShield size={16} /> Edit roles
          </button>
        )}
        {flags.canResetPassword && (
          <button type="button" className="btn-secondary" onClick={() => setDialog('password')}>
            <IconRefresh size={16} /> Reset password
          </button>
        )}
        {showActivate && (
          <button type="button" className="btn-primary" onClick={() => setDialog('activate')}>
            <IconCheckCircle size={16} /> {activateLabel}
          </button>
        )}
        {showDeactivate && (
          <button type="button" className="btn-danger" onClick={() => setDialog('deactivate')}>
            <IconPause size={16} /> Deactivate
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-3 py-1.5 text-sm text-success">
          {notice}
        </p>
      )}

      {flags.canEditProfile && (
        <ProfileDialog
          open={dialog === 'profile'}
          onClose={() => setDialog(null)}
          user={user}
          onSaved={() => finish('Details saved.')}
        />
      )}
      {flags.canEditRoles && roles && (
        <RolesDialog
          open={dialog === 'roles'}
          onClose={() => setDialog(null)}
          user={user}
          roles={roles}
          onSaved={() => finish('Roles updated. The new access applies from the user’s next request.')}
        />
      )}
      {flags.canResetPassword && (
        <ResetPasswordDialog
          open={dialog === 'password'}
          onClose={() => setDialog(null)}
          user={user}
          onSaved={() => finish(`Password reset. ${user.fullName} has been signed out everywhere and must sign in with the new password.`)}
        />
      )}

      <ConfirmDialog
        open={dialog === 'deactivate'}
        onClose={() => setDialog(null)}
        title="Deactivate user?"
        message={
          <>
            <strong className="text-ink">{user.fullName}</strong> will no longer be able to sign in. Every active
            session ends immediately. Their records and history are kept, and the account can be reactivated later.
          </>
        }
        confirmLabel="Deactivate"
        withReason
        onConfirm={async (reason) => {
          const outcome = await setUserActiveAction(user.id, false, reason);
          if (outcome.ok) finish('User deactivated and signed out of every session.');
          return outcome;
        }}
      />
      <ConfirmDialog
        open={dialog === 'activate'}
        onClose={() => setDialog(null)}
        title={`${activateLabel} user?`}
        message={
          lockedOut && user.status !== 'INACTIVE' ? (
            <>
              This clears the sign-in lockout on <strong className="text-ink">{user.fullName}</strong> and resets the
              failed-attempt count, so they can sign in again straight away.
            </>
          ) : (
            <>
              <strong className="text-ink">{user.fullName}</strong> will be able to sign in again with their existing
              password. Any sign-in lockout is also cleared.
            </>
          )
        }
        confirmLabel={activateLabel}
        tone="primary"
        withReason
        onConfirm={async (reason) => {
          const outcome = await setUserActiveAction(user.id, true, reason);
          if (outcome.ok) finish(activateLabel === 'Unlock' ? 'User unlocked.' : 'User activated.');
          return outcome;
        }}
      />
    </div>
  );
}

function ProfileDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; fullName: string; phone: string | null };
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');

  useEffect(() => {
    if (open) {
      setResult({});
      setFullName(user.fullName);
      setPhone(user.phone ?? '');
    }
  }, [open, user.fullName, user.phone]);

  const nameError = !fullName.trim() ? 'Full name is required.' : undefined;
  const phoneError = phone.trim() && !isPhone(phone) ? 'Enter a valid phone number.' : undefined;

  const save = () =>
    startTransition(async () => {
      const outcome = await updateUserProfileAction(user.id, { fullName, phone });
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title="Edit details"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending || Boolean(nameError || phoneError)}>
            {pending ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Full name" required value={fullName} onChange={setFullName} maxLength={200} error={nameError} />
        <TextField label="Phone" value={phone} onChange={setPhone} maxLength={50} inputMode="tel" error={phoneError} hint="Leave blank to remove." />
        <p className="text-xs text-ink-subtle">The email address is the sign-in name and cannot be changed here.</p>
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

function RolesDialog({
  open,
  onClose,
  user,
  roles,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; fullName: string; roleCodes: string[] };
  roles: RoleWithPermissions[];
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [selected, setSelected] = useState<string[]>(user.roleCodes);

  useEffect(() => {
    if (open) {
      setResult({});
      setSelected(user.roleCodes);
    }
  }, [open, user.roleCodes]);

  const unchanged = [...selected].sort().join() === [...user.roleCodes].sort().join();

  const save = () =>
    startTransition(async () => {
      const outcome = await updateUserRolesAction(user.id, selected);
      if (outcome.ok) onSaved();
      else setResult(outcome);
    });

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={`Roles for ${user.fullName}`}
      description="You can only add or remove roles whose access you hold yourself."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending || selected.length === 0 || unchanged}>
            {pending ? 'Saving...' : 'Save roles'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <RolePicker roles={roles} selected={selected} onChange={setSelected} disabled={pending} />
        {selected.length === 0 && <p className="field-error">Assign at least one role.</p>}
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({
  open,
  onClose,
  user,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; fullName: string };
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // The typed password is discarded whenever the dialog opens or closes.
  useEffect(() => {
    setResult({});
    setPassword('');
    setConfirm('');
  }, [open]);

  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  const save = () =>
    startTransition(async () => {
      const outcome = await resetUserPasswordAction(user.id, password);
      if (outcome.ok) {
        setPassword('');
        setConfirm('');
        onSaved();
      } else setResult(outcome);
    });

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title="Reset password?"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={save} disabled={pending || !ready}>
            {pending ? 'Resetting...' : 'Reset password'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-base text-ink-muted">
          Set a new password for <strong className="text-ink">{user.fullName}</strong>. All of their sessions are
          revoked immediately and any sign-in lockout is cleared. Share the new password with them securely; it will not
          be shown again.
        </p>
        <PasswordField label="New password" value={password} onChange={setPassword} />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          showStrength={false}
          error={mismatch ? 'The passwords do not match.' : undefined}
        />
        <ResultAlert result={result} />
      </div>
    </Modal>
  );
}
