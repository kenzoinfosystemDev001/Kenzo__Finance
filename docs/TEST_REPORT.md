# Test Report (isolated test database)

All tests in this report ran against a **separate local test database**, never against the production (Neon) database. The test database is a throwaway PostgreSQL 18 cluster started from the locally installed binaries on `127.0.0.1:15432`, with its own data folder outside the repository. It was rebuilt from the 14 existing migrations and the project's own seed (which creates no business records). Test records were created through the application's own APIs and screens.

The two pending migrations were **not applied** to any database, as requested. Anything that depends on them is marked *not verified*.

Environment: test API on port 4100, test web app on port 3100, both production builds. The shared-database API was stopped during testing.

## Results

| Area | Test | Result |
|---|---|---|
| Full business workflow | Brand, product category, product, vendor, customer category, customer, enquiry source, enquiry, quotation (SENT, ACCEPTED), proforma (ISSUED), final invoice (ISSUED, number allocated), partial payment (verified), balance payment (verified, PAID), delivery, customer and vendor edits, delete rules, top customers, sales history, top sellers, Excel exports, duplicate check | **35 of 35 pass** |
| Computed figures | Quotation 2 x 1,000 + 18% GST = 2,360; invoice total 2,360; two payments bring the invoice to PAID | Pass |
| Invoice downloads | Proforma and final invoice PDFs download as real PDFs, with the filename `Proforma-Invoice_<number>.pdf` and `Final-Invoice_<number>.pdf` | Pass (filenames changed in this pass) |
| Invoice pages | Download PDF and Preview / Print controls present on both pages | Pass |
| Vendor form | Opens blank; empty submit shows the correction message; create from the form; edit loads saved name; edited name persists after reload | **Pass** (after two fixes, see below) |
| Customer form | Empty submit asks for a customer type; required messages shown | Pass |
| Payment due alerts (real invoices) | Overdue alert with remaining balance (4,900 after a 1,000 part-payment); 10 days overdue; changing the due date to 3 days gives "due soon"; clearing the date removes the alert; full payment removes it | **7 of 7 pass** |
| Payment due alert sweep | Sweep with an open alert and no reminder table | **500 (expected).** The reminder table is part of the unapplied migration. Clears once the migration is approved and applied. |
| Authorisation | A SALES_EXECUTIVE user is refused (403) on users, roles, settings writes, branding writes, appearance upload, the admin-only favourite toggle, and the alert sweep | Pass |
| Anonymous access | 401 on vendors, customers, final invoices, sales history, vendor Excel export | Pass |
| Input handling | SQL-like search text (`' OR '1'='1`, `'; DROP TABLE ...`) returns normal results; vendors table intact afterwards | Pass |
| NUL characters | A NUL character in a search returned a server error before this pass | **Fixed**: now refused with 400 |
| Script-like names | A name containing `<script>` is stored as text, returned unchanged, and rendered as text (the UI escapes it) | Pass |
| Security headers | `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` on the web app | Pass |
| API unit tests | 22 suites, 225 tests | Pass |
| TypeScript | API and web | Pass |
| Production builds | API and web | Pass |
| Page server render time | Six main pages, 9 runs each, p50 50 to 85 ms | Baseline recorded |
| API response time | Six list and report endpoints, p50 13 to 17 ms | Baseline recorded |

## Defects found by testing and fixed

1. **Vendor form required a contact and an address it had created itself.** A new vendor started with an empty contact row and an empty address row, and both failed validation, although the form's own text said only the name was mandatory. New vendors now start with no rows; rows the user adds are still validated. Verified by the UI test.
2. **Customer form had the same empty default address row.** Removed. The required contact (phone or email) remains, as the API requires it.
3. **A select's error message never showed.** The shared select component accepted an error but did not display it. It now shows the message.
4. **A NUL character in a URL caused a server error** (the database cannot store NUL). Requests containing one are now refused with 400.
5. **Two layout lookups ran one after the other**, and the session and alert lookups were repeated during one page render. They now run together, and each lookup runs once per render. This removed duplicate calls, but it made no measurable difference to the timings (see performance).

## Not verified, and why

- **Migrations (both):** not applied to any database. Their behaviour is reviewed in `docs/MIGRATION_REVIEW.md`. Consequences: the reminder history cannot be written (confirmed by the 500 above); favourite marking returns the "not yet available" message; the favourite toggle and Favourite view are untested end to end.
- **Other forms:** only the vendor and customer forms were exercised in the browser, plus the invoice actions. Create, edit and validation for products, enquiries, quotations, payments, deliveries, users and the brand and category forms were not tested individually in the browser. Their API paths were exercised by the workflow.
- **Multi-page PDFs:** the invoices in the test database are one page long. Pagination of long tables, totals and signatures across pages was not verified.
- **PDF generation failures:** the download route passes through the upstream error, but no failure was induced and the response was not tested.
- **Export of selected rows:** exports follow the current list filters. Choosing individual rows for export is not implemented.
- **Edit reflection across modules:** a customer rename is visible in lists, rankings, sales history and exports. Issued invoices keep the name as it was when issued, by design (historical accuracy). Vendor edits were checked in the vendor screens only.
- **Sales figures at scale and index use:** the test database is small, so the sales and ranking queries were not measured under load.
- **Excel contents with real rows:** the Excel file is valid and downloads, and the sheet builder is unit-tested. The workflow created vendors and customers, but the Excel file was only checked for validity, not every cell.

## Test data

Test records (vendors, customers, products, invoices, payments) exist only in the isolated test database. The test administrator and a restricted test user were created there with generated passwords kept in a file outside the repository. Nothing was written to the production database, and no credential is stored in the repository.
