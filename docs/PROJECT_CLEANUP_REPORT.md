# Project Cleanup Report

Scope: the `updates` branch and the local development environment. Production
data was **not** inspected for cleanup and **not** changed. Everything below is
what was checked and what was actually removed.

## Database and production safety

- The root `.env` points the API at a hosted Neon database. Its name and the
  project rules mark it as the shared/production database.
- No record was deleted from any database during this pass.
- No backup was taken, because no database cleanup was performed. A backup and
  a written list of candidate records must come before any cleanup of that
  database, and needs explicit approval.
- The isolated test database (local PostgreSQL 18, `127.0.0.1:15432`) was not
  reset, truncated or cleaned. Its records were created by this project's
  test runs and are kept, because the test report references them.

## Dummy and sample data

- Web source search for sample names, example emails, GSTINs, mock arrays and
  hardcoded statistics found nothing. The only matches were instructional
  placeholders and default filter values read from the URL.
- Seed data: `apps/api/prisma/seed.ts` creates no business records (checked in
  the earlier test pass). Nothing was removed.

## Files

- Tracked files: no dummy files, temporary exports, logs, CSV/XLSX/PDF
  samples, or test screenshots are committed. A search for those types returned
  only the app's own icons and logo (`apps/web/public/logo.png`,
  `apps/web/src/app/icon.png`, `apps/web/src/app/apple-icon.png`). All are kept.
- Ignored local files: `apps/api/storage/` holds uploaded documents for
  whichever API runs locally. It can also hold files referenced by the shared
  database, so it was **not** deleted. Test uploads made during this session
  (sidebar, workspace and sign-in background uploads to the test database) are
  in there and can be removed once you confirm no other environment uses that
  folder.
- Build output (`apps/web/.next/`, `apps/api/dist/`, `tsconfig.tsbuildinfo`) is
  generated and ignored. It was left in place; it is rebuilt by the build
  commands.

## Unused code and dependencies

Removed (confirmed unused by the TypeScript compiler with `--noUnusedLocals`):

- `apps/api/src/enquiries/enquiry-children.service.ts`: unused import
  `cleanOptional`.
- `apps/api/src/quotations/quotations.service.ts`: unused import `normalizeName`.
- `apps/api/src/stock/stock.service.ts`: unused import `normalizeName`.

Checked and kept:

- Web: `npx tsc --noUnusedLocals` reports no unused locals.
- Dependencies: every declared package is imported somewhere. `server-only` is
  imported as a side-effect import in the web session and data modules;
  `dotenv` is used by `apps/api/prisma/seed.ts`.
- Lint: `next lint` has no ESLint configuration in this repository and prompts
  for setup. It was not configured here, because that would add dependencies.

## Tests and checks (actual results)

| Check | Result |
|---|---|
| API typecheck (`tsc --noEmit`) | Pass |
| API typecheck with unused-locals check | Pass (after the three import removals) |
| API unit tests (`jest`) | 22 suites, 220 tests, all pass |
| Web typecheck | Pass |
| Web unused-locals check | Pass (no errors) |
| Web production build | Pass (latest run in this pass) |

Note: `docs/TEST_REPORT.md` recorded 225 API tests. The current suite has 220.
The difference was not investigated in this pass.

## Files intentionally preserved

- Automated tests and their configuration.
- Migrations, including the two unapplied migrations awaiting approval.
- Documentation in `docs/`, including the test, security and migration reports.
- Runtime assets (logo and app icons).
- `apps/api/storage/` (shared runtime storage, see above).

## Remaining items that need your approval

1. A cleanup of the production (Neon) database. Needs a list of candidate
   records reviewed by you, and a verified backup first.
2. Removing the test uploads in `apps/api/storage/` (listed above).
3. Whether to configure ESLint so lint can run as part of this check.
4. The 220 vs 225 test count difference in `docs/TEST_REPORT.md`.
