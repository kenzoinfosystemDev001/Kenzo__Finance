# Complete Project Fault Report

Scope: Kenzo Infosystems ERP (NestJS API, Next.js web app, Prisma / Neon PostgreSQL, auth, file storage, deployment config). Built from a repository inspection and runtime testing against the live API and a production web build, signed in as a SUPER_ADMIN test account.

**Important limit:** the database is a shared Neon instance holding real business data. It contains one brand, one user, and no vendors, products, customers, enquiries, quotations, invoices, payments or deliveries. Create/edit/delete on those modules, and the full business workflow, could not be exercised without writing to that database. They are listed as *Not verified* below rather than claimed to work.

Status values: Pending, Fixed, Verified, Blocked. "Fixed" means implemented; "Verified" means tested after the change.

## Summary

| Severity | Found | Fixed | Verified | Pending / Blocked |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 3 | 3 | 3 | 0 |
| Medium | 6 | 5 | 5 | 1 |
| Low | 4 | 3 | 3 | 1 |
| Blocked by missing test DB / decision | 5 | 0 | 0 | 5 |

No Critical issues were found. Two High issues concern correctness of the Users page and the appearance feature. No critical vulnerability was found in the authentication, authorisation, or upload paths (see section 5).

---

## 1. Issues fixed and verified

### FLT-001 — Users & Roles list fails to load
| Field | Detail |
|---|---|
| Module | User Management |
| Category | Backend (Prisma query) |
| Problem | `GET /users` returned HTTP 400 ("The request did not match the expected data shape") for every sort field except `lastLoginAt`. The page defaults to sorting by `fullName`, so the list never loaded. |
| Root cause | `apps/api/src/users/users.service.ts` built `orderBy` with `{ sort, nulls: 'last' }` for every column. Prisma accepts `nulls` only on nullable columns. The exception filter maps Prisma validation errors to the generic 400 message, which hid the cause. |
| Affected files | `apps/api/src/users/users.service.ts` |
| Severity | High |
| Business impact | Administrators could not view or manage user accounts. |
| Resolution | Apply `nulls: 'last'` only to `lastLoginAt`; all other fields sort directly. |
| Verification | Sort matrix over every list endpoint: all 11 modules, every declared sort field, both directions, returns 200 (previously only Users failed). Users page renders the record and search works. Unit tests 190/190 pass. |
| Status | **Verified** |

### FLT-002 — Sidebar and workspace background images never shown
| Field | Detail |
|---|---|
| Module | Appearance Management |
| Category | Backend (authorisation declaration) |
| Problem | `GET /branding/appearance` and `GET /branding/appearance/:kind/image` returned 403 to every user. The sidebar and workspace backgrounds configured in Admin → Appearance never appeared. |
| Root cause | The routes had no permission declaration. `PermissionsGuard` fails closed on undeclared routes. `getAppearanceConfig()` caught the error and silently fell back to defaults, so nothing visibly failed. |
| Affected files | `apps/api/src/branding/branding.controller.ts`, `apps/web/src/lib/branding.ts` |
| Severity | High |
| Business impact | Configured appearance silently ignored for all users. |
| Resolution | Declared `@RequirePermissions()` (empty list = any signed-in user). The JWT guard still applies. |
| Verification | Endpoint returns 200 for the admin; signed-out request returns 401. Page crawl of the appearance page renders all three cards. |
| Status | **Verified** |

### FLT-003 — Table layout overflows the page on phones
| Field | Detail |
|---|---|
| Module | Settings, Users & Roles (and every table) |
| Category | Frontend (responsive layout) |
| Problem | At 375px width, Settings grew to 581px and the Roles permission matrix to 960px, forcing horizontal page scrolling. |
| Root cause | A screen-reader-only label (`sr-only`, absolutely positioned) inside a table header had no positioned ancestor, so it escaped the table's own `overflow-x-auto` container and widened the document. |
| Affected files | `apps/web/src/app/globals.css` (`.data-table`), `apps/web/src/app/(dashboard)/users/roles/permission-matrix.tsx` |
| Severity | Medium |
| Business impact | Pages unusable on phones without sideways scrolling. |
| Resolution | Tables are positioning contexts (`relative`), keeping absolutely positioned helpers inside the scroll container. |
| Verification | Mobile sweep: 28 of 28 signed-in pages at 375px with no horizontal overflow (run twice). |
| Status | **Verified** |

### FLT-004 — Dashboard describes existing modules as future
| Field | Detail |
|---|---|
| Module | Dashboard |
| Category | Frontend (content) |
| Problem | Text said sales, invoicing and delivery "follow in later phases" although those modules are live. |
| Root cause | Stale copy. |
| Affected files | `apps/web/src/app/(dashboard)/dashboard/page.tsx` |
| Severity | Low |
| Business impact | Misleading to users. |
| Resolution | Replaced with accurate copy. |
| Verification | Text check on the rendered dashboard. |
| Status | **Verified** |

### FLT-005 — Unused, vulnerable dependency
| Field | Detail |
|---|---|
| Module | Build / dependencies |
| Category | Security (dependency) |
| Problem | `zod` declared in the web app but never imported; carries an advisory. |
| Root cause | Leftover dependency. |
| Affected files | `apps/web/package.json`, `package-lock.json` |
| Severity | Low |
| Business impact | Unneeded attack surface. |
| Resolution | Removed the dependency. |
| Verification | Web typecheck and build pass; lockfile diff limited to this package. |
| Status | **Verified** |

### FLT-006 — API responses had no cache directive
| Field | Detail |
|---|---|
| Module | API (all modules) |
| Category | Security / caching |
| Problem | JSON responses carried no `Cache-Control`, so any intermediary or browser could cache business data. |
| Root cause | No global default; only file and export routes set headers. |
| Affected files | `apps/api/src/main.ts` |
| Severity | Medium |
| Business impact | Risk of stale or shared-cache exposure of business data. |
| Resolution | Global `Cache-Control: no-store` default; routes that legitimately cache (the public sign-in background) still set their own header, which overrides the default. |
| Verification | `GET /api/v1/health` returns `Cache-Control: no-store`. Full unit suite passes. Login background route verified by the earlier browser suite. |
| Status | **Verified** |

### FLT-007 — No way to delete unused masters (categories, sources, brands, locations)
| Field | Detail |
|---|---|
| Module | Product, Customer, Enquiry, Brands, Inventory (locations) |
| Category | Backend + frontend (feature gap) |
| Problem | Categories, enquiry sources, brands and stock locations could be created and edited but never removed. Mistakes stayed on the lists permanently. |
| Root cause | No `DELETE` routes or UI for these masters. |
| Affected files | API: `products/products.service.ts`, `products/products.controller.ts`, `customers/customers.service.ts`, `customers/customers.controller.ts`, `enquiries/enquiries.service.ts`, `enquiries/enquiries.controller.ts`, `companies/companies.service.ts`, `companies/companies.controller.ts`, `stock/stock.service.ts`, `stock/stock.controller.ts`, new `common/utils/master-delete.ts` (+ spec). Web: new `components/delete-record-button.tsx`, `components/master-record-actions.tsx`, `lib/catalogue-actions.ts`, `lib/customer-actions.ts`, `lib/enquiry-actions.ts`, `lib/inventory-actions.ts`, and the pages for these masters. |
| Severity | Medium |
| Business impact | Administrators cannot correct master data; duplicates and test entries persist. |
| Resolution | `DELETE` endpoint per master. A delete is refused with HTTP 409 and a message while any record (including archived) still references the master, because the foreign keys are `SetNull`, which would otherwise unlink those records silently. Deactivation remains the alternative. Each delete writes an audit entry. UI: confirmation dialog, disabled while running, closes and refreshes only on server success; shown disabled with the reason where the stock location is in use. Permissions match the master's update permission (brands: `company.archive`; stock: `stock.manage_locations`). |
| Verification | Unit tests for the in-use rule (3 tests, pass). Live: anonymous → 401; unknown id → 404; malformed id → 400 on all five routes. Refusal path with real in-use records **not verified**, because every master in the database is unused. The UI renders delete controls on the four pages with no page errors. **A permanent delete of a real unused record has not been run**, to avoid removing business data without authorisation. |
| Status | **Fixed**; the refusal path and the success path are **not verified on live data** (see FLT-101). |

---

## 2. Issues found and not yet resolved

### FLT-101 — No isolated test database (blocks live verification)
| Field | Detail |
|---|---|
| Module | All |
| Category | Environment |
| Problem | Live CRUD, delete, refusal, file upload/removal, and workflow tests cannot be run safely. The only database is the shared Neon instance with real data. |
| Root cause | No test database provisioned. |
| Severity | High (for verification) |
| Business impact | Many fixes can only be verified by reading the code and unit tests. |
| Resolution needed | A non-production PostgreSQL database with the schema applied (`prisma migrate deploy`) and a test admin account, supplied via environment variables. |
| Status | **Blocked** — needs the user. |

### FLT-102 — Uploaded files are archived, never removed from storage
| Field | Detail |
|---|---|
| Module | Documents, Appearance (login, sidebar, workspace), all attachment panels |
| Category | Data / storage |
| Problem | Removing or replacing a file archives its database row; the stored file is kept. The requested behaviour is to delete the file once nothing references it. |
| Root cause | Deliberate design: `DocumentsService.archive` keeps the file "so it stays auditable" (`apps/api/src/documents/documents.service.ts`). The appearance feature follows the same rule (`apps/api/src/branding/branding.service.ts`). |
| Severity | Medium |
| Business impact | Storage grows; deleted documents remain recoverable from storage by anyone with storage access. |
| Resolution options | (a) Hard-delete the file and row when unreferenced, and keep only the audit entry — conflicts with the existing auditability design; or (b) keep archiving, but purge stored bytes for archived rows after a retention period. **Decision needed from you.** |
| Status | **Blocked** — requires a policy decision. |

### FLT-103 — Business records have no delete (by design) or are not reachable through the UI
| Field | Detail |
|---|---|
| Module | Payments, Deliveries, Stock movements, Quotation revisions, Users, Vendor categories |
| Category | Feature / business rule |
| Problem | Payments, deliveries, stock movements and revisions have no delete. Users are deactivated rather than deleted. Vendor categories have an API but no screen, so they cannot be managed or deleted from the UI. |
| Root cause | Deliberate for financial and history records (reject/reverse/cancel exist). Vendor categories were never given a UI. |
| Severity | Medium (vendor categories); Low (others, by design) |
| Business impact | Vendor categories cannot be corrected from the application. Payments/deliveries use reverse/cancel — no permanent delete, which matches the business rule. |
| Resolution | Vendor categories: add a screen plus delete (same pattern as FLT-007). Others: leave as designed; document that reverse/cancel/deactivate is the removal path. |
| Status | **Pending** (vendor categories screen is a feature addition that needs your go-ahead; the rest is by design). |

### FLT-104 — Stock movements have no correction path
| Field | Detail |
|---|---|
| Module | Inventory |
| Category | Business logic |
| Problem | A mistaken stock movement cannot be reversed or deleted from the UI or API. |
| Root cause | Not implemented. Only stock-tracking-disabled status is shown when the feature is off. |
| Severity | Low (feature currently off by default) |
| Resolution | Needs a reversing-movement design. Not invented here (business rule not confirmed). |
| Status | **Pending** — needs a confirmed rule. |

### FLT-105 — Existing hard-delete endpoints not re-verified in this pass
| Field | Detail |
|---|---|
| Module | Vendors, Products, Customers, Enquiries, Quotations, Proforma, Final Invoices (`DELETE /…/:id`) |
| Category | Business logic / integrity |
| Problem | These endpoints already existed. Whether each refuses deletion of records with transactions (for example a final invoice with payments, or a customer with invoices) was not checked against live data. |
| Severity | High (if a transactional record can be removed) |
| Resolution | Review each service's delete guard and add tests for the refusal rule. |
| Status | **Pending** — next task. |

### FLT-106 — Race window in the new in-use checks
| Field | Detail |
|---|---|
| Module | FLT-007 endpoints |
| Category | Database / concurrency |
| Problem | The count and the delete are separate statements. A record linked between them would be unlinked by `SetNull`. |
| Root cause | No transaction or row lock around check-then-delete. |
| Severity | Low (requires a concurrent edit at the same moment) |
| Resolution | Run count and delete in one `$transaction` at `Serializable` isolation, or lock the master row. |
| Status | **Pending** — low risk; to be done with the test database. |

### FLT-107 — No ESLint configuration
| Field | Detail |
|---|---|
| Module | Build tooling |
| Category | Quality |
| Problem | `next lint` cannot run: no ESLint config, and it prompts interactively. |
| Resolution | Choose and add a lint configuration. A tooling decision for you. |
| Status | **Blocked** — needs your choice. |

### FLT-108 — Dependency advisories that need major upgrades
| Field | Detail |
|---|---|
| Module | Dependencies |
| Category | Security |
| Problem | `next` 15.5.29 (bundled PostCSS advisory; fix is Next 16), `prisma` / `@prisma/config` 6.19.3 (advisory covering 6.13–7.10; fix is Prisma 7), `zod` 3.25.76 in the API (advisory; fix is Zod 4). `npm audit fix` proposes a Prisma *downgrade* to 6.12.0, which was not applied. |
| Severity | Medium |
| Business impact | Known advisories remain in dependencies. Exploitability in this app is limited (see the audit report), but they should be upgraded. |
| Resolution | Planned major-version upgrades with a full retest. |
| Status | **Pending**. |

### FLT-109 — Client-side router cache after logout (not changed)
| Field | Detail |
|---|---|
| Module | Authentication / caching |
| Category | Caching |
| Problem | Next.js keeps route payloads in the browser for a short time. Dynamic pages are set to `staleTime 0` in Next 15, and all authenticated pages send `Cache-Control: private, no-store`, so previous-user data was not observed on logout. Not changed. |
| Severity | Low |
| Status | **Verified** as not exploitable with the current Next version; monitor on upgrade. |

---

## 3. Security notes

- **Test credentials were pasted into the chat.** Rotate that account's password. They were only passed through environment variables to the test scripts and are not stored in any file in the repository.
- The superadmin password in `.env` is rejected by the database. Check whether it was changed.
- Authorisation: every route declares a permission or `@Public()` (fail-closed guard). Confirmed at runtime: no undeclared route answered, and all write probes were rejected with 400/404 before any write.
- Upload validation: type checked from file bytes, size limits enforced, rejected before storage (tested with a text file named `.png`, a 6 MB file, a missing file and a bad kind).
- Secrets: no `.env` file is tracked; only `.env.example`.
- HTTP: helmet enabled; CORS limited to the web origin with credentials; web app sends frame and content headers; authenticated pages `no-store`.

## 4. Database and API connection results

- Prisma schema: `validate` passes (run from the repository root, where the `.env` is loaded).
- `prisma migrate status`: "Database schema is up to date!" — 14 migrations, Neon PostgreSQL.
- API ↔ database: all GET routes return data or expected errors; no 5xx across 157 GET routes or 144 write probes.

## 5. Modules audited

Dashboard, Vendor, Product, Customer, Enquiry, Quotation, Proforma Invoice, Final Invoice, Payment, Delivery, Reports (all 12 report pages), User Management, Authentication, Admin Console (Users & Roles), Appearance, Settings, Inventory, Brands, Documents.

For each: API reachable and permission-gated; list sort/search/filter exercised where data existed; empty create forms validated; mobile layout checked. **Not verified**: create/edit/delete persistence on real records, PDF generation and downloads for real documents, OCR, and report numbers against real transactions (no data).

## 6. Build and test results

| Check | Result |
|---|---|
| API TypeScript | Pass |
| Web TypeScript | Pass |
| API build (`nest build`, Prisma generate) | Pass |
| Web build (`next build`) | Pass |
| API unit tests | 190 / 190 pass (18 suites) |
| Web lint | Not configured (FLT-107) |
| Web browser crawl, 54 signed-in pages | No 5xx, no page errors (only a deliberately guessed non-existent URL returns 404) |
| Mobile overflow sweep, 28 pages at 375px | 28 / 28 pass |
| Write-route probe (all POST/PATCH/PUT/DELETE, nil ids) | No 5xx |
| Sort matrix (11 modules × declared sort fields × 2 directions) | All pass |

## 7. Modified files (this pass)

API: `users/users.service.ts`, `branding/branding.controller.ts`, `main.ts`, `products/products.service.ts`, `products/products.controller.ts`, `customers/customers.service.ts`, `customers/customers.controller.ts`, `enquiries/enquiries.service.ts`, `enquiries/enquiries.controller.ts`, `companies/companies.service.ts`, `companies/companies.controller.ts`, `stock/stock.service.ts`, `stock/stock.controller.ts`, `common/utils/master-delete.ts` (new), `common/utils/master-delete.spec.ts` (new).

Web: `app/globals.css`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/users/roles/permission-matrix.tsx`, `components/delete-record-button.tsx` (new), `components/master-record-actions.tsx`, `lib/catalogue-actions.ts`, `lib/customer-actions.ts`, `lib/enquiry-actions.ts`, `lib/inventory-actions.ts`, `lib/branding.ts`, `app/(dashboard)/products/categories/page.tsx`, `app/(dashboard)/companies/page.tsx`, `app/(dashboard)/customers/categories/page.tsx`, `app/(dashboard)/enquiries/sources/page.tsx`, `app/(dashboard)/inventory/locations/page.tsx`, `package.json`, `package-lock.json`.

Docs: `docs/COMPLETE_PROJECT_FAULT_REPORT.md`, `docs/GLOBAL_DELETE_AND_CACHE_AUDIT.md`, `docs/BUG_FIX_PROGRESS.md`, `docs/AUDIT_REPORT.md` (previous pass).

## 8. Production readiness

**CONDITIONALLY READY — not ready for unrestricted production use yet.** Reasons: the authenticated business workflows (create/edit/delete with real data, file removal, PDF output) are unverified; dependency upgrades are pending; no lint gate exists; file-retention policy needs a decision. Ready-for-production status would require the test database (FLT-101) and the decisions in FLT-102 and FLT-108.
