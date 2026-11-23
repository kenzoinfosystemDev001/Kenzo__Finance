# Global Add / Delete and Cache Audit

Companion to `docs/COMPLETE_PROJECT_FAULT_REPORT.md`. This records what was inspected, what was changed, and what is still open.

## 1. Add / Create / Upload inventory and Delete coverage

Status key: **Yes** = delete exists and is reachable from the UI; **API** = delete exists in the API only; **No** = none; **By design** = removal is deliberately a different action (reverse, cancel, archive, deactivate).

| Module | Add / Create / Upload | Delete / Remove | Status | Notes |
|---|---|---|---|---|
| Vendors | Create vendor | `DELETE /vendors/:id` | Yes (existing) | Business guard on the existing endpoint not re-verified (FLT-105). |
| Vendors | Addresses, contacts, documents, brand and product mappings | `DELETE` on each child | Yes (existing) | |
| Vendor categories | Create (API) | None | **No** — no screen, no delete | FLT-103 |
| Products | Create product | `DELETE /products/:id`, plus archive/restore | Yes (existing) | |
| Products | Categories | `DELETE /products/categories/:id` | **Yes (new)** | FLT-007 |
| Products | Product models, model images | `DELETE` (existing) | Yes (existing) | |
| Products | Product image, documents | `DELETE` (existing) | Yes (existing) | |
| Products | Vendor mappings | `DELETE /products/:id/vendors/:vendorId` | Yes (existing) | |
| Brands (companies) | Create brand | `DELETE /companies/:id` (new), plus archive | **Yes (new)** | Refused while products or vendor mappings use it. |
| Customers | Create customer | `DELETE /customers/:id` | Yes (existing) | |
| Customers | Categories | `DELETE /customers/categories/:id` | **Yes (new)** | |
| Customers | Contacts, addresses, product mappings, documents | `DELETE` (existing) | Yes (existing) | |
| Enquiries | Create enquiry | `DELETE /enquiries/:id` | Yes (existing) | |
| Enquiries | Sources | `DELETE /enquiries/sources/:id` | **Yes (new)** | |
| Enquiries | Items, follow-ups, attachments | `DELETE` (existing) | Yes (existing) | |
| Quotations | Create quotation | `DELETE /quotations/:id` | Yes (existing) | Existing guard not re-verified (FLT-105). |
| Quotations | Revisions | None | By design | Revisions are history. |
| Quotations | Documents | `DELETE` (existing) | Yes (existing) | |
| Proforma invoices | Create PI | `DELETE /proforma-invoices/:id` | Yes (existing) | FLT-105 |
| Proforma invoices | Documents | `DELETE` (existing) | Yes (existing) | |
| Final invoices | Create invoice | `DELETE /final-invoices/:id` | Yes (existing) | FLT-105 |
| Final invoices | Documents | `DELETE` (existing) | Yes (existing) | |
| Payments | Record payment | None; reject / reverse | By design | Financial record. |
| Payments | Documents | `DELETE` (existing) | Yes (existing) | |
| Deliveries | Create delivery | None; cancel | By design | Cancel is the removal path. |
| Deliveries | Documents | `DELETE` (existing) | Yes (existing) | |
| Inventory | Stock locations | `DELETE /stock/locations/:id` | **Yes (new)** | Refused while movements exist. Screen shown only when stock tracking is enabled. |
| Inventory | Stock movements | None | **No** | FLT-104 — correction path not designed. |
| Documents (generic) | Upload | `POST /documents/:id/archive` | By design (file kept) | FLT-102 |
| OCR | Upload vendor document | Via the vendor's document | Covered by the document | |
| Appearance | Login / sidebar / workspace image | Restore default (`DELETE`) | Yes (existing / fixed) | The old file is archived, not removed (FLT-102). Replacement only archives the old file after the new one is saved. |
| Users | Create user | Deactivate / activate | By design | User accounts are kept for audit. |
| Roles | Edit permissions | None (fixed set) | By design | |
| Settings | Business switches | n/a | n/a | |

**Summary:** 5 master types gained delete (product categories, customer categories, enquiry sources, brands, stock locations). Remaining gaps: vendor categories (no screen), stock movements (no correction path), and the file-retention policy (FLT-102).

## 2. Database deletion

- Existing hard-delete routes: real `DELETE` statements through Prisma, not UI-only removal.
- New master deletes: check the dependents with `count()` (archived included), refuse with 409 if any exist, otherwise `delete()` and write an audit entry (`*.delete`, entity type, the name before deletion). Uses the foreign keys' existing behaviour; no cascade is introduced.
- Transactions: the count and the delete are separate statements. A concurrent link could be unlinked (FLT-106). Planned: a serializable transaction.
- Dependent records: masters are referenced with `SetNull`, so a delete would unlink them. The rule above prevents that for these masters.
- Success is reported only after the API returns, and the page is refreshed from the database.

## 3. File and image deletion

- Documents and appearance images are **archived**. The row keeps its `archivedAt`, the stored file remains, and archived files are never served. This is the existing design and conflicts with the request to delete unreferenced files (FLT-102). **Not changed** pending a decision.
- Replacement ordering (appearance): new file stored → setting switched (commit point) → old file archived. A failed upload leaves the current image untouched.
- Product images and model images: removed through their existing `DELETE` routes.

## 4. Cache inspection

| Layer | Inspected | Finding | Action |
|---|---|---|---|
| Browser `localStorage` / `sessionStorage` / IndexedDB | grep of the web source | No business data stored. The only mention is a comment that tokens are not stored there (`lib/session.ts`). | None needed. |
| Service workers / Cache Storage | grep | None. | None. |
| Next.js fetch cache | every server-side `fetch` in the web app | All `apiFetch` calls and the export / document / PDF proxies use `cache: 'no-store'`. | None needed. |
| Next.js route / data cache | `revalidate`, `unstable_cache`, `force-static` | None used. `revalidatePath` is used after mutations. | None needed. |
| Next.js HTML response for signed-in pages | `curl`/Playwright headers on `/dashboard`, `/vendors`, `/users` | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. | Verified. |
| Next.js client router cache | Next 15 defaults | Dynamic pages are not kept for reuse (`staleTime 0`). | Monitored (FLT-109). |
| API responses | `Cache-Control` on JSON | None set before this pass. | **Added** global `no-store` default (`main.ts`). Public login background keeps its own versioned cache header. |
| Server caches (Redis, in-memory) | grep for cache-manager / CACHE_MANAGER | None. | None. |
| Static assets | Next build output | Hashed JS / CSS, cacheable by design. | Correct as is. |
| Appearance images | proxy route | Private, `max-age=3600`, versioned by document id (`?v=`), so a replaced image gets a new URL. | Verified in design; authenticated image path not verified with live upload (no test data). |

**Logout:** the server clears session cookies and revokes the refresh token; authenticated responses are `no-store`, so a back-button return does not show previous-user data from the browser cache. Not tested with two accounts (no second account available).

## 5. Tests executed

| Test | Result |
|---|---|
| API unit tests (18 suites, including new `master-delete.spec.ts`) | 190 / 190 pass |
| API and web TypeScript | Pass |
| Live delete routes, anonymous | 401 (all five) |
| Live delete routes, nil id | 404 (all five) |
| Live delete routes, malformed id | 400 (all five) |
| Write probe with unknown property, every write route | No 5xx |
| Delete controls on the four master pages and the locations table | Render; no page errors |
| Live refusal of an in-use record | **Not run** — no in-use records exist |
| Live successful delete of an unused record | **Not run** — would permanently delete real data without authorisation |
| Upload and replace/remove of a valid image | **Not run** — would change the live appearance |
| Logout / second account / permission-denied delete | **Not run** — no second account |

## 6. Remaining work

1. Decide the file-retention policy (FLT-102).
2. Provide a test database and a second non-admin account to run the live success, refusal, permission and cross-user cache tests.
3. Add a screen and delete for vendor categories (FLT-103).
4. Design the stock-movement correction (FLT-104).
5. Review the existing hard-delete guards for transactional records (FLT-105).
6. Move the new in-use checks into a serializable transaction (FLT-106).
