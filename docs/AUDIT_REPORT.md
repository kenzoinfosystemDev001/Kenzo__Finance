# Bug and Error Audit

Scope: API (NestJS), web (Next.js), database (Prisma / Neon PostgreSQL), authentication and authorisation, file handling, dependencies. Run against the live API and a production build of the web app, signed in as a SUPER_ADMIN test account.

## 1. Defects found and fixed

| # | Area | Defect | Root cause | Fix | Verified by |
|---|---|---|---|---|---|
| 1 | Users & Roles | The Users list failed for every sort field except `lastLoginAt` (HTTP 400, "did not match the expected data shape"). The page's default sort is `fullName`, so the page could not load. | `users.service.ts` applied `nulls: 'last'` to every sort field. Prisma only accepts `nulls` on nullable columns. | Apply `nulls` only to `lastLoginAt`, the one nullable sort column. | Sort matrix: all 5 fields x 2 directions now 200. Users page renders the row and search runs. |
| 2 | Appearance (my earlier work) | Sidebar and workspace background images were never returned. `GET /branding/appearance` returned 403 to every user. | The route had no permission declaration, so the fail-closed guard refused it. The layout caught the error and silently showed default colours. | Declared `@RequirePermissions()` (signed-in users only; JWT still required). Same for the image read route. | Endpoint returns 200 for a signed-in user. Signed-out returns 401. |
| 3 | Dashboard | Copy said sales, invoicing and delivery "follow in later phases", although those modules exist. | Stale text. | Replaced with accurate copy. | Visual / text check. |
| 4 | Mobile layout | Settings and Users & Roles widened the whole page to 581 px and 960 px on a 375 px phone (horizontal scroll). | A screen-reader-only label inside a table header is absolutely positioned; the table had no positioned ancestor, so it escaped the table's own scroll container. | `.data-table` and the permission matrix table are positioning contexts. | Mobile sweep of 28 pages: no horizontal overflow. |
| 5 | Dependencies | `zod` declared in the web app but never imported. It carries an advisory (memory exhaustion) that was flagged in the audit. | Unused dependency. | Removed from `apps/web/package.json` and the lockfile. | Web build and typecheck pass. |

## 2. Verified without defects

- **API unit tests:** 17 suites, 187 tests, all pass (after fixes 1 and 2).
- **TypeScript:** API and web both pass `tsc --noEmit`.
- **Production builds:** API `nest build` and web `next build` pass.
- **Every GET route** (157): called as the admin. No 5xx. Only expected 4xx/409 responses (missing parameters, a disabled stock feature, empty public background).
- **Every write route** (144): sent a body with an unknown property to reject. None returned 5xx; all were rejected with 400 or 404 before any write. A nil UUID was used so no real record could be touched.
- **Sort options:** every declared sort field on every list endpoint, both directions.
- **Authorisation:** the permission guard is fail-closed. No route returned 403 in the sweep, so every controller route declares its requirement.
- **Browser walk** of 54 authenticated pages: no 5xx, no uncaught page errors, no error screens. (One 404 was my own guessed URL, `/vendor-categories`, which is an API resource with no page.)
- **Empty create forms** (vendors, products, customers, enquiries, quotations, users): validation shown, no write sent.
- **Header vendor search** and the Users search route correctly.
- **Upload validation (negative tests):** a text file named `.png` (415), a 6 MB file (413), a missing file (400) and an unknown appearance kind (400) are all rejected before storage.
- **Database:** schema validates; `prisma migrate status` reports the database is up to date (14 migrations, Neon PostgreSQL).
- **Secrets:** no `.env` file is tracked by git; only `.env.example`.
- **HTTP hardening:** helmet is enabled; CORS is restricted to the configured web origin with credentials.
- **Login:** the authentication path, invalid-credential message, and form behaviour pass the browser suite from the earlier task.

## 3. Not fixed, and why

**Dependency advisories (`npm audit`, production dependencies):**
- `next` 15.5.29: advisory for its bundled PostCSS. The only fix is Next 16, a major upgrade. Needs a planned migration and a full retest.
- `prisma` / `@prisma/config` 6.19.3: advisory covering 6.13 through 7.10. The `npm audit fix` suggestion downgrades to 6.12.0, which I did not apply. The fix path is Prisma 7, a major upgrade with config-file changes.
- `zod` 3.25.76 (API): advisory for oversized inputs. The only API use is startup environment validation on operator-supplied values, so the attack path isn't reachable. Zod 4 is a breaking change; left for a planned upgrade.
- `effect`, `deepmerge-ts`: transitive through Prisma; resolved by the Prisma 7 upgrade.

**Lint:** `next lint` cannot run. The web app has no ESLint configuration, and `next lint` opens an interactive prompt. Setting ESLint up is a tooling decision for you, so I did not add one.

**Not tested, because it would write to the shared production database:**
- **CRUD on real records:** the database has one company and one user, so vendor, product, customer, enquiry, quotation, invoice, payment and delivery detail pages have no records to open. Create, edit and delete flows were not exercised.
- **Appearance upload and restore with a valid image:** the database accepts it, but it would change the live login and workspace appearance. The negative tests and read paths are verified.
- **Business calculations end to end:** covered by the existing unit tests (quotation calculations, payments, invoices, deliveries) but not checked against real records.

To close these gaps, we need a non-production database (or explicit permission to write test records to this one) and a dedicated test account.

## 4. Security notes

- The test account credentials were pasted into the chat. Please rotate that password, and do not store it in project files.
- The first login attempt also used the superadmin account from `.env`, which the database rejects. Its password in `.env` no longer matches; that should be checked.

## 5. Changed files in this audit

- `apps/api/src/users/users.service.ts`: list ordering.
- `apps/api/src/branding/branding.controller.ts`: permission declaration on the appearance read routes.
- `apps/web/src/app/globals.css`: table positioning fix.
- `apps/web/src/app/(dashboard)/users/roles/permission-matrix.tsx`: table positioning fix.
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`: copy.
- `apps/web/package.json`, `package-lock.json`: unused `zod` removed.
- `docs/AUDIT_REPORT.md`: this report.
