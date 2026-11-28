'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import { IconCheck } from '@/components/icons';
import { setRolePermissionsAction } from '@/lib/user-actions';
import type { PermissionInfo, RoleWithPermissions } from '@/lib/types';
import { actionLabel, groupByModule, moduleLabel, SUPER_ADMIN_ROLE } from '@/lib/user-labels';

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Permission x role matrix. With role.manage it is editable: changes are
 * collected per role and saved together; each role is a separate API call and
 * its outcome (or the API's message, verbatim) is reported per role. The
 * Super Admin role is fixed and always read-only.
 */
export function PermissionMatrix({
  roles,
  catalogue,
  editable,
}: {
  roles: RoleWithPermissions[];
  catalogue: PermissionInfo[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** Unsaved edits, by role id. */
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  /** What the API returned after a save, until the page data catches up. */
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  const [outcome, setOutcome] = useState<{ saved: string[]; failed: Array<{ role: string; message: string }> } | null>(null);

  const groups = useMemo(() => groupByModule(catalogue), [catalogue]);
  const baseline = (role: RoleWithPermissions) => saved[role.id] ?? role.permissions;
  const current = (role: RoleWithPermissions) => drafts[role.id] ?? baseline(role);
  const isFixed = (role: RoleWithPermissions) => role.code === SUPER_ADMIN_ROLE;
  const dirtyRoles = roles.filter((role) => drafts[role.id] && !sameSet(drafts[role.id], baseline(role)));

  const setCodes = (role: RoleWithPermissions, codes: string[]) => {
    setOutcome(null);
    setDrafts((all) => ({ ...all, [role.id]: codes }));
  };

  const toggle = (role: RoleWithPermissions, code: string, on: boolean) => {
    const codes = current(role);
    setCodes(role, on ? [...new Set([...codes, code])] : codes.filter((c) => c !== code));
  };

  const toggleModule = (role: RoleWithPermissions, moduleCodes: string[], on: boolean) => {
    const codes = current(role);
    setCodes(role, on ? [...new Set([...codes, ...moduleCodes])] : codes.filter((c) => !moduleCodes.includes(c)));
  };

  const save = () =>
    startTransition(async () => {
      const okRoles: string[] = [];
      const failed: Array<{ role: string; message: string }> = [];
      const nextSaved: Record<string, string[]> = {};
      const savedIds: string[] = [];
      for (const role of dirtyRoles) {
        const result = await setRolePermissionsAction(role.id, drafts[role.id]);
        if (result.ok) {
          okRoles.push(role.name);
          savedIds.push(role.id);
          nextSaved[role.id] = result.role?.permissions ?? drafts[role.id];
        } else {
          failed.push({ role: role.name, message: [result.error, ...(result.errors ?? [])].filter(Boolean).join(' ') });
        }
      }
      setSaved((all) => ({ ...all, ...nextSaved }));
      setDrafts((all) => {
        const next = { ...all };
        for (const id of savedIds) delete next[id];
        return next;
      });
      setOutcome({ saved: okRoles, failed });
      if (okRoles.length) router.refresh();
    });

  const discard = () => {
    setDrafts({});
    setOutcome(null);
  };

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">Permission matrix</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {editable
              ? 'Tick the permissions each role should hold, then save. You cannot grant or revoke access you do not hold yourself, or edit a role you hold.'
              : 'Read-only. Changing role permissions requires the role.manage permission.'}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={discard} disabled={pending || dirtyRoles.length === 0}>
              Discard changes
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={pending || dirtyRoles.length === 0}>
              {pending ? 'Saving...' : dirtyRoles.length ? `Save (${dirtyRoles.length} role${dirtyRoles.length > 1 ? 's' : ''})` : 'Save'}
            </button>
          </div>
        )}
      </div>

      {outcome && (
        <div className="space-y-2 border-b border-border px-5 py-3">
          {outcome.saved.length > 0 && (
            <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2 text-sm text-success">
              Saved: {outcome.saved.join(', ')}. Users with these roles get the new access on their next request.
            </p>
          )}
          {outcome.failed.length > 0 && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
              <p className="font-medium">Not saved (your changes are still shown):</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {outcome.failed.map((failure) => (
                  <li key={failure.role}>
                    <span className="font-medium">{failure.role}:</span> {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto">
        <table className="relative w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 min-w-[220px] border-b border-border bg-surface-muted px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Permission
              </th>
              {roles.map((role) => {
                const dirty = dirtyRoles.includes(role);
                return (
                  <th
                    key={role.id}
                    scope="col"
                    className={clsx(
                      'sticky top-0 z-10 min-w-[110px] border-b border-border bg-surface-muted px-2 py-2.5 text-center align-bottom text-xs font-semibold text-ink',
                      dirty && 'bg-warning-subtle',
                    )}
                  >
                    <span className="block">{role.name}</span>
                    <span className="block font-normal text-ink-subtle">
                      {isFixed(role) ? 'Fixed' : dirty ? 'Unsaved' : `${current(role).length} perms`}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const moduleCodes = group.items.map((item) => item.code);
              return [
                <tr key={`m-${group.module}`}>
                  <th
                    scope="rowgroup"
                    className="sticky left-0 z-[5] border-b border-border bg-surface px-4 pb-1.5 pt-4 text-left text-xs font-bold uppercase tracking-wide text-accent"
                  >
                    {moduleLabel(group.module)}
                  </th>
                  {roles.map((role) => {
                    const codes = current(role);
                    const all = moduleCodes.every((code) => codes.includes(code));
                    return (
                      <td key={role.id} className="border-b border-border bg-surface px-2 pb-1.5 pt-4 text-center">
                        {editable && !isFixed(role) && (
                          <button
                            type="button"
                            className="link-pill text-xs font-medium disabled:opacity-50"
                            disabled={pending}
                            onClick={() => toggleModule(role, moduleCodes, !all)}
                            aria-label={`${all ? 'Clear' : 'Select'} all ${moduleLabel(group.module)} permissions for ${role.name}`}
                          >
                            {all ? 'Clear' : 'All'}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>,
                ...group.items.map((permission) => (
                  <tr key={permission.code} className="hover:bg-surface-muted/60">
                    <th scope="row" className="sticky left-0 z-[5] border-b border-border bg-surface px-4 py-2 text-left font-normal">
                      <span className="block text-ink">{actionLabel(permission.action)}</span>
                      <span className="block font-mono text-xs text-ink-subtle" title={permission.description ?? undefined}>
                        {permission.code}
                      </span>
                    </th>
                    {roles.map((role) => {
                      const has = current(role).includes(permission.code);
                      const readOnly = !editable || isFixed(role);
                      return (
                        <td key={role.id} className="border-b border-border px-2 py-2 text-center">
                          {readOnly ? (
                            has ? (
                              <>
                                <IconCheck size={16} className="inline text-success" />
                                <span className="sr-only">Granted</span>
                              </>
                            ) : (
                              <>
                                <span aria-hidden className="text-ink-subtle">&middot;</span>
                                <span className="sr-only">Not granted</span>
                              </>
                            )
                          ) : (
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={pending}
                              onChange={(event) => toggle(role, permission.code, event.target.checked)}
                              aria-label={`${role.name}: ${permission.code}`}
                              className="h-4 w-4 rounded border-border-strong accent-[rgb(var(--accent))]"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
