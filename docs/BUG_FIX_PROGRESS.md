# Bug Fix Progress

Last updated in this session. Continue from the "Exact next task" below; do not repeat completed work.

## Counts

| Item | Count |
|---|---|
| Issues discovered (both audits) | 19 (FLT-001 … FLT-109, plus items in section 3 of the fault report) |
| Fixed | 7 (FLT-001 to FLT-007) |
| Verified | 6 of the 7 fixed (FLT-007 is fixed; its refusal and success paths are unverified on live data) |
| Pending (needs work, not blocked) | 5 (FLT-103 vendor categories screen, FLT-104 stock correction design, FLT-105 hard-delete guard review, FLT-106 transaction, FLT-108 dependency upgrades) |
| Blocked (needs the user) | 3 (FLT-101 test database, FLT-102 file-retention decision, FLT-107 lint choice) |
| Monitored, no change | 1 (FLT-109 router cache) |

## Current working phase

Phase: **Delete and cache implementation — master deletes done; verification blocked on a test database.**

## Last completed tasks

1. Added permanent delete for product categories, customer categories, enquiry sources, brands and stock locations (API endpoints with in-use refusal and audit; UI with confirmation).
2. Added shared in-use guard `common/utils/master-delete.ts` with unit tests.
3. Added API-wide `Cache-Control: no-store` default.
4. Inspected all caching layers (browser storage, Next fetch/route/data caches, router cache, API headers, service workers) and recorded findings.
5. Inventoried every Add/Create/Upload and its delete path.
6. Full regression: 190 API unit tests, both typechecks, both builds, 54-page crawl, 28-page mobile sweep, write-route probe.
7. Wrote `COMPLETE_PROJECT_FAULT_REPORT.md`, `GLOBAL_DELETE_AND_CACHE_AUDIT.md`, and this file.

## Exact next task

1. **Get a test database and a non-admin test account from the user** (FLT-101). Without them, the live refusal/success/permission tests cannot run.
2. **Review the existing hard-delete guards** (FLT-105): for vendors, products, customers, enquiries, quotations, proforma and final invoices, confirm each refuses to delete a record that has transactions, and add a unit test for the refusal rule.
3. Then, with the test database: run the master-delete success and refusal paths, and the appearance upload/remove cycle, and record results in the reports.

## Notes for the next session

- Do not run a live delete against the shared production Neon database. Its real masters are unused, so any delete would succeed and remove data.
- The test credential pasted in the chat must be rotated; it is not stored in any file.
- Rebuild the API before restarting it (`npm run api:build` from the repo root). Stop the old process first, or Prisma's query-engine DLL stays locked (`EPERM`).
- Use `MSYS_NO_PATHCONV=1` for Git Bash calls that include `/paths`, or the leading slash is rewritten.
