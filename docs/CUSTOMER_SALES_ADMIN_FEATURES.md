# Customer, Sales and Admin Console features

Four requests were delivered in one pass: Top Customers and Favourites, Product Sales Analytics and Sales History, Admin Console customer and vendor management, and Centralised Module Access. This document says what was built, how each figure is calculated, what is verified, and what is waiting on you.

## 1. Top Customers and Favourite Customers

**Where:** Customer Management, `/customers`. Three tabs: *All customers* (the existing list), *Top customers* (`?view=top`), *Favourite customers* (`?view=favourite`).

**Ranking.** Computed on each request from issued and sent final invoices (`GET /customers/rankings`, `customer-rankings.service.ts`). Three sort options, each with a stable tie-break by name and id:

| Sort | Measure |
|---|---|
| Invoiced amount | Sum of invoice grand totals |
| Products purchased | Sum of line quantities (units) and the number of distinct products |
| Orders | Number of issued or sent invoices |

Cancelled invoices and invoices replaced by a revision are not issued or sent, so they drop out automatically. Quotations and proforma invoices never contribute. Nothing is stored, so a new, edited or cancelled invoice is reflected on the next load.

**Multiple currencies.** A customer invoiced in two currencies appears once per currency, and the amounts are never added across currencies.

**Favourites.** An administrator can mark or unmark a customer (`PATCH /customers/:id/favourite`, permission `settings.manage`). Each change is audited with who changed it. Everyone who can read customers sees the badge. The toggle appears only to administrators.

**Status: partly live.** Rankings and the Top view work now. Favourites need a database change that is waiting for your approval (see *Waiting on you*). Until then the Favourite view reports that it is unavailable, and marking a favourite returns a clear message. Nothing else in the customer module is affected.

## 2. Product Sales Analytics and Sales History

**Where:** `/sales-history` (sidebar: *Sales History*; dashboard card: *Top-selling products this month*).

**Scope.** Every figure comes from line items of issued and sent final invoices. The same scope is used by every query and export, so the screen and the export always agree.

**History views.** Latest sales, oldest sales, product-wise totals and customer-wise totals. Periods: all time, this month, last month, or a custom range (the start and end dates are checked). Search covers product, model, product code, customer name and invoice number. Each line shows product and model, customer, invoice number, quantity, sale amount and invoice date. Totals are shown per currency.

**Analytics.** Top products this month ranked three ways (quantity, value, number of orders). A monthly summary for the last twelve months. A product-wise comparison of the selected period with the period before it of the same length; this is the existing analytics definition, and the label on the page shows both date ranges.

**Export.** Excel, PDF and CSV, from the same figures on screen, through the existing export writers. A history export is capped at 5,000 lines; the export notes if a request is capped. The browser never sees the API token: exports go through a Next route handler.

**Revisions and cancellations.** A revised invoice is replaced by a new invoice, and the old one is cancelled. Only the active invoice is counted, so no sale is counted twice.

**Performance.** Each query aggregates over line items for the period. There is no pre-computed table, so figures are always current. On a large history, the indexes on invoice date and status should be checked before relying on the all-time views; this was not measured because the database has no sales data.

## 3. Admin Console: manage customers and vendors

**Where:** `/admin` (sidebar: *Admin Console*, for administrators only). Sections: *All modules*, *Manage customers*, *Manage vendors*.

**Customers and vendors.** The lists use the same APIs as the modules, with search, pagination and the row actions the modules already use: view, edit, mark favourite (customers), activate or deactivate, and delete. Deletion is refused, with the reason shown, when a record is still in use. Newly added records appear here and in the modules immediately, because nothing is copied.

**Not built here:** a separate add-and-edit form inside the console. *Add* and *Edit* open the existing module forms, so the validation and business rules stay in one place.

## 4. Centralised module access

**Where:** `/admin`, section *All modules*. It lists every module and its sub-sections, each linking to the existing page. Every link was checked against the live application.

**Permissions.** The console is restricted to Super Admins and anyone with `settings.manage`. The API enforces the same permissions as before; nothing in the module APIs was relaxed. A Super Admin holds every permission, so the console opens every module without a separate department check.

**Not changed:** module pages are not duplicated, and no new data systems were created.

## Verification

| Check | Result |
|---|---|
| API unit tests (21 suites) | 221 of 221 pass, including new tests for the sales scope, the period comparison and the ranking rules |
| API and web TypeScript | Pass |
| API and web production builds | Pass |
| Existing customer endpoints after the change (list, summary, detail) | Pass; detail returns 404 for an unknown id, as before |
| Rankings (all, top) | 200 with the correct shape |
| Favourite view and marking, before the database update | 409 with the clear message |
| Sales history (latest, oldest, product, customer, this month, last month, custom) | 200 with the correct shape |
| Invalid date range and invalid view | 400 |
| Anonymous access to sales and rankings | 401 |
| Excel, PDF and CSV exports | Correct content types and real files |
| Browser: dashboard card, sales history, all three customer views, the console sections | Render with no page or server errors |
| Phone-width overflow on the new screens | See the results recorded at the end of this document |

## Not verified

- **Actual rankings and sales figures.** The database has no issued invoices, so every figure is zero. Ranking order, the three sorts, totals, monthly figures, the comparison and exports need real invoices to confirm. A test database would close this gap.
- **Favourite marking and the Favourite view.** Blocked until the database update below is applied.
- **Admin-only access for a non-admin user.** No second account is available to test the refusal path.

## Waiting on you

1. **Approve the favourites database change.** It is `apps/api/prisma/migrations/20261201090000_customer_favourites/migration.sql`: three new columns on `customers` and a foreign key to `users`, all additive. It was generated from a schema diff and has not been applied. Once you approve it, I will restore the three fields in `schema.prisma`, regenerate the client, and verify the Favourite view and the toggle.
2. **Approve the earlier payment reminder migration** (`20261130090000_payment_reminders`), if it has not been applied yet.
3. **Provide a test database** to verify real figures for rankings, sales and exports.

## Notes on how the favourite column is handled

The regenerated client briefly expected the favourite column, which broke the existing customer detail page. I caught this in testing and reverted the Prisma model to its pre-favourite state. The favourite code reads and writes the column with raw SQL, so the rest of the customer module is unaffected until the column exists, and the favourite actions report a clear message until then.
