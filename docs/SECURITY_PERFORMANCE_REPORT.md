# Security and Performance Report

Scope: the `updates` branch. Tests ran against an isolated test database (see `docs/TEST_REPORT.md`). Nothing here was run against production.

## Security

### Checks run (test API and test web app)

| Check | Result |
|---|---|
| Restricted user (SALES_EXECUTIVE) refused on admin-only endpoints: users, roles, settings writes, branding writes, appearance upload, admin-only favourite toggle, alert sweep | 403 on all |
| Anonymous access to protected data (vendors, customers, final invoices, sales history, vendor export) | 401 on all |
| SQL-like input in search fields | Handled as text; table intact afterwards |
| NUL character in a search | **Was a 500. Now a 400.** Fixed in this pass. |
| Script-like text in a vendor name | Stored as text, returned unchanged; rendered as text |
| Frame and content-type headers on the web app | `X-Frame-Options: DENY`, `nosniff` |
| Authorisation declaration on every route | Every route declares a permission or is public; the guard refuses undeclared routes |
| Upload validation | Type checked from bytes; size limits enforced before storage (tested in an earlier pass) |
| Credentials in the repository | None (scanned) |

Result: **22 of 22** security checks pass after the fixes.

### Dependency audit (production dependencies, measured now)

| Advisory | Severity | Fix | Status |
|---|---|---|---|
| `prisma` / `@prisma/config` 6.19.3 | high | Prisma 7 (major) | Open. Needs a planned upgrade. `npm audit fix` would downgrade Prisma and was not applied. |
| `next` 15.5.29 (bundled PostCSS) | moderate, high | Next 16 (major) | Open. Needs a full retest. |
| `zod` 3.25.76 (API) | high | Zod 4 (major) | Open. Used only for startup environment validation; not reachable from user input. |
| `effect`, `deepmerge-ts` | high | Via Prisma upgrade | Open (transitive). |

The unused `zod` dependency in the web app was removed in an earlier pass.

### Reviewed, intentional, to confirm

- `GET /settings` is readable by any signed-in user. It returns business switches and company profile values; bank details are excluded. If the business wants these hidden from staff, this endpoint should require `settings.manage` or a narrower permission.

### Not yet reviewed

- CSRF on cookie-backed server actions (the API itself uses bearer tokens).
- A full review of every rendered user field for XSS (React escapes text by default; no `dangerouslySetInnerHTML` was found in the web app).
- A Content-Security-Policy. The web app sends only the framing directive; a full policy needs per-request nonces.
- Rate limits under load. The throttler exists; its limits were not tested.

## Performance

### Measured baseline (test stack, small dataset)

These numbers describe the test database only. They are not a production benchmark.

| Measure | Result (p50) |
|---|---|
| Server render of the main pages (dashboard, vendors, customers, final invoices, sales history, admin) | 50 to 85 ms |
| API: vendors list, customer rankings (top), sales history, top sellers, final invoices, payment alerts | 13 to 17 ms |
| Browser time to network idle on the same pages | About 0.8 to 1.1 s |

The browser figure is mostly the fixed quiet period that the measurement waits for (about half a second), plus client work. The server is not the bottleneck at this data size.

### Change made, and its measured effect

- The session check and the payment-alert lookup were running twice per page render (once in the layout, once in the page). They are now cached per request, and the layout runs its two independent lookups together.
- **Measured effect: none that could be distinguished from noise** on this dataset (before and after were within about 50 ms). The change removes duplicate work and should matter more as pages make more calls, but this pass does not claim a speed-up.

### Known characteristics (not measured at scale)

- Customer rankings, sales history, the monthly summary and the comparison are computed live from invoice line items. No pre-computed tables and no additional indexes were added. They will slow as history grows; the index plan should be checked against real volume.
- Export endpoints build the whole file in memory. The sales-history export is capped at 5,000 lines; the vendor and customer exports are not capped.
- The payment-alert sweep reads every open alert, once an hour.
- The dashboard and layout make several API calls per navigation. Each call is short, so this matters less than the client-side wait.

### Not done

- Load testing at production volume.
- Index review against production query plans.
- Image and asset optimisation review.
- Lazy loading of heavy report components.

## Unresolved

1. Major-version upgrades: Next, Prisma, Zod (see the audit table).
2. Index review and load testing at real data volume.
3. The two migrations need approval before they can be applied; until then the payment-alert sweep fails when an open alert exists (see `docs/MIGRATION_REVIEW.md`).
4. Reviews listed under "Not yet reviewed".
5. The `GET /settings` scope decision.

## Deployment note

`render.yaml` deploys the `main` branch and runs `prisma migrate deploy` at build time. Nothing on `updates` has been merged, pushed to `main`, or deployed.
