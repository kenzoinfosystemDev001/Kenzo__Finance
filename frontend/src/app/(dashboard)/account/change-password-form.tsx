'use client';

import { useState, useTransition } from 'react';
import { ResultAlert } from '@/components/client-ui';
import { changeOwnPasswordAction } from '@/lib/user-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import { PasswordField } from '../users/user-form-parts';

/**
 * Self-service password change. On success the API revokes every session,
 * this one included, so the action clears the cookies and redirects to the
 * sign-in page; there is no "success" state to show here.
 */
export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword) {
      setResult({ error: 'Enter your current password and a new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setResult({ error: 'The new passwords do not match.' });
      return;
    }
    setResult({});
    startTransition(async () => {
      const outcome = await changeOwnPasswordAction({ currentPassword, newPassword, confirmPassword });
      if (outcome?.error) {
        setResult(outcome);
        setCurrentPassword('');
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="max-w-md space-y-4">
      <PasswordField
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        showStrength={false}
        autoComplete="current-password"
      />
      <PasswordField label="New password" value={newPassword} onChange={setNewPassword} />
      <PasswordField
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        showStrength={false}
        error={mismatch ? 'The passwords do not match.' : undefined}
      />
      <p className="text-sm text-ink-muted">
        Changing your password signs you out of every session, including this one. You will need to sign in again with
        the new password.
      </p>
      <ResultAlert result={result} />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? 'Changing...' : 'Change password'}
      </button>
    </form>
  );
}
