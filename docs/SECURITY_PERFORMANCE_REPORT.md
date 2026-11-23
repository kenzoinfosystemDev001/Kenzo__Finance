# Security and Performance Report

Status: **partial.** This pass completed the vendor and customer Excel export and verified it. The wider security and performance work below was **not** carried out in this pass; this report records the state of the application as measured, so the next pass starts from facts.

## What was verified in this pass

| Area | Check | Result |
|---|---|---|
| Vendor export | `GET /vendors/export?format=xlsx` returns a real Excel file | Pass (valid `.xlsx`, correct content type and filename) |
| Customer export | `GET /customers/export?format=xlsx` | Pass (same) |
| CSV export | Existing CSV output unchanged | Pass (BOM and columns unchanged) |
| Export data | Excel rows with real records | **Not verified**: the test database has no vendors or customers. The sheet builder is unit-tested (4 tests) with record-shaped data. |
| Export access | Anonymous request | 401 |
| Export validation | `format=bogus` | 400 (allow-list enforced by the global validator) |
| Web download | Export routes through the Next proxy | Pass (200, correct type, filename) |
| API tests | Full unit suite | 225 tests across 22 suites (new export spec included) |

## Security: current state

**Dependency audit (`npm audit --omit=dev`), measured now:**

| Advisory | Severity | Fix | Note |
|---|---|---|---|
| `prisma` / `@prisma/config` 6.19.3 | high | Prisma 7 (major) | Runtime dependency; upgrade needs a planned migration |
| `next` 15.5.29 (bundled PostCSS) | moderate / high | Next 16 (major) | Build-time PostCSS exposure; upgrade needs a full retest |
| `zod` 3.25.76 (API) | high | Zod 4 (major) | Only used for startup environment validation; not attacker-reachable |
| `effect`, `deepmerge-ts` | high | Via Prisma upgrade | Transitive |

The `npm audit fix` suggestion for Prisma downgrades to 6.12.0. It was **not** applied.

**Earlier fixes (documented in `docs/COMPLETE_PROJECT_FAULT_REPORT.md`):** the Users list sort, the appearance permission declaration, the cache directive on API responses, and removal of an unused vulnerable dependency.

**Authorisation:** every route must declare a permission or `@Public()`, and the guard refuses anything undeclared. Confirmed at runtime: every GET route answered, and every write route rejected invalid input with 400 or 404 without a 500. The JWT is required on every non-public route.

**Uploads:** the file type is checked from its bytes, not its name, and size limits are enforced before storage. Confirmed with negative tests (wrong content with an image extension, oversized file, missing file, unknown kind).

**Sessions:** access and refresh tokens are httpOnly cookies set by the Next server; the browser never receives the API token. Authenticated pages send `Cache-Control: private, no-store`.

**Headers:** helmet is enabled on the API. The web app sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a referrer policy, a permissions policy, and HSTS in production. A full Content-Security-Policy needs per-request nonces and is **not** in place.

**Credentials:** no `.env` file is tracked by git. A scan of the repository for the test credential found none.

**Not yet reviewed:** CSRF on state-changing routes (the API uses bearer tokens, so the risk is lower than with cookies, but the cookie-backed Next actions were not reviewed in detail); the throttler's limits under load; a full XSS review of every rendered user field; the SQL in the raw-query modules, reviewed by reading only.

## Performance: current state

**Not measured in this pass.** No before-and-after timings were taken, so no improvement is claimed.

Known characteristics from the code:

- Each authenticated page render makes several API calls: the session check, the appearance settings, the payment alerts (for users who can read invoices), and the page's own data. The layout's calls run on every navigation.
- The customer rankings, sales history, monthly summary and comparison are computed with live aggregate queries over invoice line items. They have no pre-computed tables and no indexes added for them in this pass. They will slow as the invoice history grows.
- Export endpoints build the whole file in memory. The sales history export is capped at 5,000 lines; the vendor and customer exports are not capped.
- The payment-alert sweep runs hourly and reads every open alert.

## Unresolved

1. Major-version upgrades for Next, Prisma and Zod (see the audit table).
2. Index review for the aggregate queries once real data exists.
3. Measured load times for the dashboard, lists and reports, before and after any change.
4. A review of CSRF, XSS and raw SQL, with tests.
5. A test database. Several results above are limited because the shared database holds no transactional records.

## Deployment note

The deploy configuration (`render.yaml`) follows the `main` branch, and its build runs `prisma migrate deploy` and the seed. Two migrations in this branch are **not approved** and must not be merged to `main` until they are:

- `20261130090000_payment_reminders` (payment due alerts)
- `20261201090000_customer_favourites` (favourite customers)
