# Production Readiness Audit - Axiom Technologies Business Management Software

Living document. The checklist at the top is the resume point: work continues
from the first unchecked item. Every result below was produced by a command
that was actually run; nothing is marked done on the strength of a page
loading.

Last updated: 2026-11-21 (branch `updates`, base `origin/main` 0e23459).

## Progress checklist

- [x] Phase 1 - repository, architecture, schema, API, auth, config inspected
- [x] Phase 2 - critical fixes: authorization coverage, user management,
      production secret guard, web security headers
- [x] Phase 3 - functional gaps closed: delivery web UI, payment-method
      settings UI, payment form customer limit, silent error swallowing
- [x] Phase 3 - users / roles / account web UI (`/users`, `/users/new`,
      `/users/[id]`, `/users/roles`, `/account` with change password)
- [ ] Phase 4 - live end-to-end run (139 steps) - **blocked: needs a working
      login** (`SEED_SUPERADMIN_PASSWORD` in `.env` is rejected by the API;
      owner is updating it)
- [ ] Phase 4 - multi-role authorization test (needs test users; follows E2E)
- [x] Phase 5 - `next build` production build passed; security headers and
      login redirects verified on the running app (signed-in page render
      check still needs a login)
- [ ] Phase 6 - final test pass (API unit, web typecheck, E2E) after all fixes
- [ ] Phase 7 - deployment checklist review with the owner (secrets, storage,
      OCR provider, backups)
- [ ] Phase 8 - regression run of the critical workflows; final status

## A. Executive summary

| | Count |
|---|---|
| Issues identified in this audit | 17 |
| Fixed | 13 |
| Remaining (documented in section I) | 4 |

Overall health: the API is structurally sound. Authorization is deny-by-default,
money is exact decimal, and multi-record operations run in transactions with
row locks. The main defects were missing functionality (no user management, no
delivery or payment-settings screens) rather than broken logic.

**Status: NOT READY FOR PRODUCTION (yet).** The live end-to-end verification
has not run since Modules 8-10 and user management were added (blocked on
credentials). The production build now passes. See section J.

## B. Module-wise results

Unit and type checks are listed in section F. "E2E" refers to the live API
suite (`e2e.mjs`). Its last full run (run 5, before Modules 8-10) passed 129 of
130 steps; the one failure was a test-script assertion, since fixed.

| Module | CRUD / API | DB integration | Search, filter, sort | Security | Integration | Testing |
|---|---|---|---|---|---|---|
| Vendors | complete | Prisma, transactional | yes | permission per route | products, documents, OCR | unit + E2E run 5 |
| Products | complete (catalogue only) | yes | yes | yes | vendors, quotations | unit + E2E run 5 |
| Customers | complete | yes | yes | yes | enquiries to deliveries | E2E run 5 |
| Enquiries | complete | yes | yes | yes | quotations | E2E run 5 |
| Quotations | complete, revisions | yes | yes | yes | PI hand-off | unit + E2E run 5 |
| Proforma invoices | complete | yes | yes | yes | final invoices | unit + E2E run 5 |
| Final invoices | complete, gapless numbering | yes | yes | yes | payments, deliveries | E2E run 5 |
| Payments | complete | verified-only totals | yes | verify / reject / reverse permissions | invoices, analytics | unit; E2E steps written, not yet run |
| Deliveries | complete (API + web) | quantity locks | yes | yes | invoices, customers | unit; E2E steps written, not yet run |
| Reports & analytics | 12 reports + export | read-only SQL | presets + filters | per-report permissions; financial figures gated | all modules | unit; E2E steps written, not yet run |
| Dashboard | live summaries | yes | n/a | yes | all | E2E run 5 |
| Auth & users | login, refresh, logout, change password; **user / role administration added** | yes | users: search, status, role | see D | all | unit; E2E pending |
| Settings | complete; **payment methods UI added** | audited | n/a | `settings.manage` | PI, invoices, payments | E2E run 5 |

## C. Database results

- **Connection:** Neon PostgreSQL reachable. Prisma 6.19.3 client generated.
  `prisma migrate status`: 14 migrations, "Database schema is up to date".
  `prisma migrate diff` (DB vs schema): empty.
- **Migrations:** all additive. This audit added none (user management uses
  the existing tables). The two most recent are
  `20261128090000_delivery_hardening` (columns and indexes; dropped only the
  unique index on proof_of_delivery.deliveryId, with the table at 0 rows) and
  `20261129090000_analytics_permissions` (data only, `ON CONFLICT DO NOTHING`).
- **Money:** every amount is `Decimal(14,2)`. The only float is OCR
  confidence. Totals are computed with `Prisma.Decimal`.
- **Integrity:** invoice numbers are allocated inside the issuing transaction.
  One live document per source is enforced by unique slots. Payment
  allocations and delivery quantities are checked under a row lock on the
  invoice. Restrict / cascade rules were reviewed: financial records are never
  hard-deleted.
- **Indexes:** every hot foreign key is indexed. Not indexed, and intentionally
  left alone (cold paths, rarely filtered): audit columns `*ById`; contact
  links; `QuotationItem.enquiryItemId`; `ProformaInvoiceItem.quotationItemId`;
  `FinalInvoiceItem.proformaInvoiceItemId`; `FinalInvoice.quotationRevisionId`;
  `StockMovement.locationId`.
- **Backup / recovery:** not verified from here. Neon point-in-time restore
  must be confirmed on the project's plan (section G).

## D. Security results

- **Authentication:** passwords are hashed (`PasswordService`, argon2). Access
  tokens last 15 minutes; refresh tokens rotate atomically with replay
  detection. After 5 failed logins the account locks for 15 minutes. Tokens
  live in httpOnly, SameSite=Lax cookies, secure in production, and are never
  in browser storage. Changing a password revokes all sessions.
- **Authorization:** every route was audited by script. All routes declare a
  permission except the public login, refresh and logout routes, the login
  branding and health. The guard refuses a route with no declared permission.
  Roles and permissions are reloaded from the database on every request, and
  inactive users are rejected at once.
- **User administration (new):** a non-super-admin cannot assign a role, or
  grant or revoke a permission, they don't hold. The Super Admin role and
  Super Admin accounts are managed only by a Super Admin. Nobody can change
  their own roles or deactivate themselves. The last active Super Admin cannot
  be removed. Deactivation and administrator password resets revoke the user's
  sessions immediately. Everything is audit-logged; password hashes are never
  selected.
- **API:** Helmet; CORS limited to `WEB_URL`; DTO whitelisting with
  `forbidNonWhitelisted` (stops mass assignment); Prisma parameterised queries,
  with raw SQL only through tagged templates; rate limit of 120/min per token
  and 10/min per login email; Swagger disabled in production; an error filter
  that hides internals.
- **Files:** 10 MB cap; type and signature validation; storage keys never come
  from user input; downloads are scoped to the owning record (generic routes
  can't reach PI / invoice / payment / delivery files).
- **Fixed in this audit:**
  - The web app sent no security headers. Added `X-Frame-Options: DENY`,
    CSP `frame-ancestors 'none'`, `nosniff`, Referrer-Policy,
    Permissions-Policy, and HSTS in production.
  - Production booted with the `.env.example` placeholder JWT secrets. It now
    refuses to start.
- **Dependencies:** `npm audit --omit=dev` reports 7 findings (1 moderate, 6
  high). None is fixed without a breaking change, so none was applied:
  - **postcss** (inside Next 15): build-time CSS processing of our own
    stylesheets only. The fix is Next 16.
  - **zod 3:** used only to validate environment variables at boot. The fix is
    zod 4.
  - **effect, deepmerge-ts:** dependencies of the Prisma CLI tooling.
    `npm audit fix` would downgrade Prisma.
  - Residual risk is low. Plan the Next 16 and zod 4 upgrades as a separate,
    tested change.
- **Remaining risks:**
  - No full Content-Security-Policy (it needs per-request nonces).
  - An access token stays valid for up to 15 minutes after an administrator
    password reset. Deactivation, by contrast, is immediate.
  - Separation of duties (for example, who records versus who verifies a
    payment) is a business decision.

## E. Performance results

- Lists are paginated server-side (max 100 per page). Search runs in the
  database.
- Reports are aggregate SQL over indexed date and status columns. There is no
  N+1 in the list endpoints reviewed.
- PDFs are rendered once at issue or dispatch and stored, not regenerated on
  every download.
- Web production build passes. Shared first-load JS is 103 kB; the largest
  page (vendor detail) is 134 kB.

## F. Testing results (commands actually run)

| Command | Result |
|---|---|
| `apps/api: npx jest` | 17 suites, **187 / 187 passed** |
| `apps/api: npx tsc --noEmit` | exit 0 |
| `apps/web: npx tsc --noEmit` | exit 0 |
| `apps/api: npx jest src/config` (incl. new placeholder-secret test) | 13 / 13 passed |
| `apps/api: npx jest src/users` (new privilege rules) | 5 / 5 passed |
| `npx prisma migrate status` | up to date (14) |
| `npm audit --omit=dev` | 7 findings, see D |
| `next lint` (web) | **not configured** (no ESLint config; `next build` ignores lint) |
| API ESLint | **not configured** |
| Live E2E (`e2e.mjs`, 139 steps) | **not run**: blocked on credentials (Phase 4) |
| `apps/web: npx next build` | **passed**; all routes compiled; first-load JS 103-134 kB |
| `curl -I /login` on the running app | security headers present |

No frontend component tests exist. The web app is verified by type checking
and through the live E2E suite, which exercises the same API the pages call.

## G. Deployment readiness

- `render.yaml` and `docs/06_DEPLOYMENT.md` describe the build and start
  commands. Health checks are `/api/health`, `/api/health/ready` and the web
  `/api/health`.
- Configuration is validated at boot (zod): secrets must be 32+ characters
  and differ from each other, and are rejected in production if they are still
  the template placeholders. Cloudinary and OCR settings are cross-checked.
- Secrets: `.env` is git-ignored; only `.env.example` (placeholders) is
  tracked.
- **Before go-live (owner):**
  1. Use `STORAGE_DRIVER=cloudinary`, or a persistent disk. Local storage is
     lost on redeploy.
  2. Choose an OCR provider. With `stub` there is no automatic text extraction;
     it never fabricates values.
  3. Confirm Neon backups / PITR and do a restore drill.
  4. Use a production database role with only the privileges it needs.
  5. Set `WEB_URL` to the deployed origin.
  6. Generate fresh JWT secrets.
- Rollback: migrations are additive, so rolling the app back to the previous
  build is safe without a database rollback.

## H. Modified files (this audit)

- `apps/api/src/users/*` (new): user and role administration API, privilege
  rules, unit spec.
- `apps/api/src/app.module.ts`: registers `UsersModule`.
- `apps/api/src/config/env.validation.ts` and `.spec.ts`: refuse placeholder
  secrets in production.
- `apps/web/next.config.ts`: security headers.
- `apps/web/src/app/(dashboard)/settings/payment-settings.tsx` (new) and
  `settings/page.tsx`: payment methods and auto-verify configuration.
- `apps/web/src/app/(dashboard)/payments/new/page.tsx`: customer search
  (previously only the first 100 customers could be selected); a settings
  failure now shows an error instead of an empty method list.
- `apps/web/src/app/(dashboard)/deliveries/**`,
  `components/delivery-*.tsx`, `lib/delivery-*.ts`: complete delivery UI
  (list, create, edit, profile with every lifecycle action, reports) replacing
  the stubs.
- `final-invoices/[id]/page.tsx` and `customers/[id]/page.tsx`: delivery
  panels.
- `apps/web/src/app/(dashboard)/reports/[report]/sections.tsx`: report bodies.
- `apps/web/src/app/(dashboard)/users/**`, `account/**`,
  `lib/user-actions.ts`, `lib/user-labels.ts`, `components/user-badges.tsx`
  (new): user, role and account administration UI. `components/sidebar.tsx`
  and `components/app-header.tsx`: navigation. `app/(auth)/login/page.tsx`:
  message after a password change.

## I. Remaining issues

1. **Live E2E not run** (credentials). Action: owner updates `.env`, then run
   the suite and the cleanup script.
2. **User list "Locked" filter** counts only accounts with status LOCKED.
   A temporary lockout after failed sign-ins keeps status ACTIVE (it shows
   the Locked badge, but not under that filter). Minor; documented.
3. **No ESLint configuration** for the web or the API. TypeScript strict mode
   is the current gate. Action: add an ESLint config as a separate change;
   expect clean-up work.
4. **Dependency upgrades** (Next 16, zod 4): separate change with full
   regression testing.
5. **Owner decisions** listed in `docs/07`, `docs/09` and the Modules 6-8
   reports: numbering formats, approval policies, payment auto-verify,
   delivery-before-payment, challan wording, separation of duties.

## J. Final status

**NOT READY FOR PRODUCTION.** No critical defect is known to remain in the
code reviewed, but readiness cannot be claimed until:
- the live end-to-end suite has run green against the current code,
- the storage, OCR and backup decisions in section G are made.
