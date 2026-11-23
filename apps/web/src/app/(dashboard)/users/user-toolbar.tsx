'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { IconRefresh, IconSearch } from '@/components/icons';

/**
 * Filter bar for the user list. Filters live in the URL and are applied by
 * the API, so pagination stays correct and a filtered view can be shared.
 */
export function UserToolbar({ roles }: { roles: Array<{ code: string; name: string }> | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');

  useEffect(() => setSearch(searchParams.get('search') ?? ''), [searchParams]);

  const apply = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page');
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  const hasFilters = ['search', 'status', 'roleCode'].some((key) => searchParams.get(key));

  return (
    <div className="card p-3" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
        <form
          role="search"
          className="relative md:col-span-2 xl:col-span-1"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ search: search.trim() || null });
          }}
        >
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            id="user-search"
            type="search"
            value={search}
            placeholder="Search by name, email or phone"
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if ((searchParams.get('search') ?? '') !== search.trim()) apply({ search: search.trim() || null });
            }}
            className="field-input h-10 pl-10"
          />
        </form>

        <div>
          <label htmlFor="user-status-filter" className="sr-only">
            Status
          </label>
          <select
            id="user-status-filter"
            value={searchParams.get('status') ?? ''}
            onChange={(event) => apply({ status: event.target.value || null })}
            className="field-input h-10"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="LOCKED">Locked</option>
          </select>
        </div>

        {roles ? (
          <div>
            <label htmlFor="user-role-filter" className="sr-only">
              Role
            </label>
            <select
              id="user-role-filter"
              value={searchParams.get('roleCode') ?? ''}
              onChange={(event) => apply({ roleCode: event.target.value || null })}
              className="field-input h-10"
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div aria-hidden />
        )}

        <button
          type="button"
          className="btn-secondary h-10"
          disabled={!hasFilters || pending}
          onClick={() => {
            setSearch('');
            startTransition(() => router.push(pathname));
          }}
        >
          <IconRefresh size={16} />
          Clear Filters
        </button>
      </div>
    </div>
  );
}
