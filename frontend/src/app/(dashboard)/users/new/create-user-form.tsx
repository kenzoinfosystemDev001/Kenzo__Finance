'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ResultAlert, TextField, isEmail, isPhone } from '@/components/client-ui';
import { createUserAction } from '@/lib/user-actions';
import type { ActionResult } from '@/lib/vendor-actions';
import type { RoleWithPermissions } from '@/lib/types';
import { MIN_PASSWORD_LENGTH } from '@/lib/user-labels';
import { PasswordField, RolePicker } from '../user-form-parts';

export function CreateUserForm({ roles }: { roles: RoleWithPermissions[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [roleCodes, setRoleCodes] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  const errors = {
    fullName: !fullName.trim() ? 'Full name is required.' : undefined,
    email: !email.trim() ? 'Email address is required.' : !isEmail(email) ? 'Enter a valid email address.' : undefined,
    phone: phone.trim() && !isPhone(phone) ? 'Enter a valid phone number.' : undefined,
    password: password.length < MIN_PASSWORD_LENGTH ? `At least ${MIN_PASSWORD_LENGTH} characters are required.` : undefined,
    roles: roleCodes.length === 0 ? 'Assign at least one role.' : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    setResult({});
    startTransition(async () => {
      // On success the action redirects to the new user's page.
      const outcome = await createUserAction({ fullName, email, phone, password, roleCodes });
      if (outcome?.error) setResult(outcome);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <section className="card p-5">
        <h2 className="mb-4 text-lg font-semibold text-ink">Account details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField label="Full name" required value={fullName} onChange={setFullName} maxLength={200} error={touched ? errors.fullName : undefined} />
          <TextField
            label="Email address"
            required
            type="email"
            value={email}
            onChange={setEmail}
            maxLength={254}
            hint="Used to sign in."
            error={touched ? errors.email : undefined}
          />
          <TextField label="Phone" value={phone} onChange={setPhone} maxLength={50} inputMode="tel" error={touched ? errors.phone : undefined} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-ink">Initial password</h2>
        <p className="mb-4 mt-0.5 text-sm text-ink-muted">
          Share it with the user through a secure channel. It is not shown again after saving; they can change it from
          My account after signing in.
        </p>
        <div className="max-w-md">
          <PasswordField label="Password" value={password} onChange={setPassword} error={touched && password.length === 0 ? errors.password : undefined} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-semibold text-ink">
          Roles <span className="text-danger">*</span>
        </h2>
        <p className="mb-4 mt-0.5 text-sm text-ink-muted">
          You can only assign roles whose access you hold yourself; the server will refuse anything else.
        </p>
        <RolePicker roles={roles} selected={roleCodes} onChange={setRoleCodes} disabled={pending} />
        {touched && errors.roles && <p className="field-error mt-2">{errors.roles}</p>}
      </section>

      <ResultAlert result={result} />
      {touched && !valid && !result.error && (
        <p role="alert" className="text-sm text-danger">
          Please correct the highlighted fields.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/users" className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Creating...' : 'Create user'}
        </button>
      </div>
    </form>
  );
}
