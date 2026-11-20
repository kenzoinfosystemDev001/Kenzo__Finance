# Vendor & Product Management — Integration Guide for Later Modules

How Product, Customer, Enquiry, Quotation, Proforma Invoice, Payment and
Delivery modules should use the vendor data. The rule: **reuse these records
by ID; never copy vendor, brand or product data into a module's own tables.**

## 1. Entities

```
Vendor ──< VendorContact        (typed; one primary per contact type)
   │  ──< VendorAddress         (typed; exactly one primary)
   │  ──< VendorCompany >── Company   (shared Brand master)
   │  ──< VendorProduct >── Product ──< ProductModel
   │         └──< VendorProductModel >── ProductModel   (optional per-model supply)
   │  ──< Document              (private storage; vendorId FK)
   └── AuditLog (entityType='Vendor', or parentEntityType='Vendor' for child rows)
```

| Table | Owner | Notes |
| --- | --- | --- |
| `vendors` | Module 1 | `id` (UUID) is the stable reference. `vendorCode` is human-facing only. |
| `vendor_contacts`, `vendor_addresses` | Module 1 | Authoritative. `vendors.contactPerson` and `vendors.address*/city/state` are mirrors of the primary rows, kept in sync by the service — read them, never write them. |
| `companies` | Shared (Brand master) | Unique by normalised name. Product Management owns its UI. |
| `products` | Module 2 | One catalogue product per brand + name (unique). `productCode` is generated; `sku` optional and unique. `modelNumber` is a legacy column from before models existed. |
| `product_models` | Module 2 | Many per product. `modelCode` generated; model number unique within the brand. Specifications are a JSON array of `{name, value}` (any attributes per category). |
| `vendor_companies`, `vendor_products` | Modules 1 + 2 | Unique per pair. A vendor can only be mapped to a product of a brand it is mapped to: otherwise the API answers 409 `VENDOR_BRAND_NOT_MAPPED`, unless the caller sends `mapBrand: true` and holds `vendor.manage_brands`. `vendor_products.status` marks a mapping inactive without deleting it. |
| `vendor_product_models` | Module 2 | Optional models a vendor supplies under its product mapping; none = the whole product. Deleting a product mapping removes these; a model with mappings cannot be deleted. |
| `documents` | Shared | Add a nullable FK column per owner type (`quotationId`, ...), as `vendorId`/`productId` do. |

## 2. Referencing a vendor from a new business document

1. Store `vendorId` (UUID FK to `vendors.id`, `onDelete: Restrict`).
2. Before creating the document, call
   `VendorsService.assertSelectableForTransaction(vendorId, actor)`
   (export of `VendorsModule`). It rejects archived vendors and inactive
   vendors unless the user holds `vendor.use_inactive`.
3. Add your table to `VendorsService.getReferenceCounts()` so a vendor your
   module references can never be hard-deleted.
4. Snapshot anything that must not change with the master record (e.g. the
   vendor's name/GSTIN as printed on a PO) in your own columns at issue time.

Historical references stay valid when a vendor is deactivated or archived:
both are status flags, the row is never removed.

### Referencing a product or model

Quotation / PI / enquiry / delivery lines store `productId` and, where the
customer chose a variant, `productModelId` (FKs, `onDelete: Restrict`).
Before creating a line call
`ProductsService.assertSelectableForTransaction(productId, modelId, actor)`
(inactive needs `product.use_inactive`), and add the new table to
`ProductsService.getReferenceCounts()` and the model delete check in
`ProductModelsService.remove()`. Snapshot name / model number on the line.

## 3. APIs to call (all under `/api/v1`, same JWT and RBAC)

| Need | Endpoint |
| --- | --- |
| Pick an active vendor | `GET /vendors/lookup?search=` |
| Suppliers of a product | `GET /vendors/lookup?productId=` (includes vendor SKU, lead time, preferred flag) |
| Vendors of a brand | `GET /vendors/lookup?companyId=` |
| Full vendor record | `GET /vendors/:id` |
| Vendors per product (with models) | `GET /products/:id/vendors` |
| Pick an active product + its active models | `GET /products/lookup?search=&companyId=&vendorId=` |
| Models of a product | `GET /products/:id/models` |
| Search with filters / paging | `GET /vendors?search=&status=&companyId=&productId=&sortBy=&page=&pageSize=` |

Response and error shapes are the API-wide ones: paginated lists return
`{ items, meta }`; errors return `{ statusCode, error, message, correlationId }`.

## 4. Shared utilities to reuse

- **Auth/permissions:** `@RequirePermissions(PERMISSIONS.X)`; add codes to
  `common/authz/permissions.ts` and re-run `npm run db:seed`.
- **Audit:** `AuditService.record({ ..., parentEntityType, parentEntityId }, tx)`
  inside the same transaction as the change.
- **Files:** `DocumentsService.upload/openForDownload/archive` (signature
  validation, private storage, replacement chain, inline-preview rules).
- **Numbering:** `NumberingService.allocate(key, tx)` for document numbers.
- **Validation:** `IsGstin`, `IsPan`, `IsPhone`; `normalizeName/Email/Phone`.

## 5. Vendor permissions

`vendor.read` (view), `vendor.create`, `vendor.update`, `vendor.deactivate`,
`vendor.archive`, `vendor.delete`, `vendor.export`, `vendor.manage_contacts`,
`vendor.manage_addresses`, `vendor.manage_brands`, `vendor.manage_products`,
`vendor.manage_documents`, `vendor.use_inactive`. `vendor.map_products` was
split into `manage_brands` / `manage_products` and is removed by the seed.

Product permissions: `product.read` (view), `product.create`, `product.update`
(edit + status), `product.archive`, `product.delete`, `product.export`,
`product.manage_models`, `product.manage_vendors`, `product.upload_documents`,
`product.delete_documents`, `product.use_inactive`.

## 6. Customers (Module 3)

`customers` is the single customer master. Later modules store `customerId`
(FK, `onDelete: Restrict`) and never copy customer data except print
snapshots on issued documents.

| Table | Notes |
| --- | --- |
| `customers` | `customerCode` generated (KI/CUS/0001). `customerType` INDIVIDUAL / BUSINESS. GSTIN (unique), PAN and CIN are accepted only when `taxCountry` is India; other countries use `taxRegistrationNumber`. |
| `customer_contacts` | Many; exactly one primary. A customer always keeps at least one contact with a phone or email. |
| `customer_addresses` | Many; BILLING / SHIPPING / OFFICE / REGISTERED / OTHER, one default per type. Quotations and PIs should pick the default billing/shipping address. |
| `customer_product_interests` | References existing `products` / `product_models` only. Not an enquiry or order. |
| `customer_categories` | Configurable (settings.manage). |

Before creating an enquiry/quotation/PI call
`CustomersService.assertSelectableForTransaction(customerId, actor)`
(inactive needs `customer.use_inactive`) and add the new table to
`CustomersService.getReferenceCounts()`. Selector: `GET /customers/lookup`.
The customer profile's "Business Transactions" tab is where those records
should then be listed by `customerId`.

## 7. Enquiries (Module 4)

| Table | Notes |
| --- | --- |
| `enquiries` | `enquiryNumber` generated (KI/ENQ/00001). `customerId` Restrict, optional `customerContactId`, `sourceId` (configurable `enquiry_sources`), `assignedToId` (existing users; there is no separate employee master). `convertedAt` / `convertedReference` record the single conversion. |
| `enquiry_items` | Product requirements; reference `products` / `product_models` (Restrict). |
| `enquiry_follow_ups`, `enquiry_status_history` | History; `nextFollowUpDate` on the enquiry is kept in sync. |

Lifecycle and locks live in `enquiry-rules.ts`. CONVERTED, LOST and CLOSED
enquiries are read-only. CONVERTED can only be reached through the hand-off:

- `EnquiriesService.conversionHandoff(id, actor)` returns readiness
  (`ready`, `problems`) and the customer, contact, currency and items.
  It creates nothing. HTTP: `GET /enquiries/:id/conversion`.
- `EnquiriesService.markConverted(tx, enquiryId, reference, actor)` must run
  inside the transaction that creates the downstream document. Its guarded
  update allows exactly one conversion.
- `EnquiriesService.revertConversion(tx, enquiryId, reference, actor)` undoes
  it when that document is deleted before it was ever issued.

Permissions: `enquiry.read`, `create`, `update`, `delete`, `assign`,
`change_status`, `manage_follow_ups`, `upload_attachments`,
`delete_attachments`, `convert`, `export`.

## 8. Quotations (Module 5)

| Table | Notes |
| --- | --- |
| `quotations` | Header. `quotationNumber` (KI/QT/00001), `customerId` Restrict, `enquiryId` **unique** (one quotation per enquiry), `status` / `currentRevisionNumber` / `currentTotal` mirror the current revision for listing, `acceptedRevisionId` pins acceptance. |
| `quotation_revisions` | Content of each version: dates, terms, totals (`Decimal(14,2)`), `taxBreakdown`, and `customerSnapshot`, which is frozen when the revision is issued. `issuedAt` is set on Mark as Sent. `pdfDocumentId` is the stored PDF. |
| `quotation_items` | Snapshot lines (product, brand and model names, specs) plus `productId` / `productModelId` references. Prices, discount and tax are per line and entered by the user. |
| `quotation_status_history`, `quotation_communications` | History. A communication is a record of what happened; nothing is sent by the system. |

Rules:

- Only a DRAFT revision is editable (`PATCH /quotations/:id/draft`).
- Changing an issued quotation creates a new revision
  (`POST /quotations/:id/revisions`). The previous revision becomes
  SUPERSEDED and is never modified. Superseded revisions cannot be accepted.
- Lifecycle: see `quotation-rules.ts`. Approval is optional through the
  `quotation.approvalRequired` setting (default off). When it is on, a draft
  goes through PENDING_APPROVAL → APPROVED before it can be sent.
- Amounts are computed on the server in `quotation-calc.ts` with exact
  decimals.
  - **Pending business decision:** the additional (header) discount is
    applied after tax, as a flat reduction.
- PDFs come from the revision snapshot only. An issued revision is rendered
  once and stored (`QUOTATION_PDF`). An unissued revision renders on demand
  with a DRAFT watermark. The company block comes from the
  `branding.companyProfile` setting (`PUT /quotations/settings/company-profile`).

**Proforma Invoice hand-off (Module 6).** Call
`GET /quotations/:id/revisions/:n/proforma-handoff` (or
`QuotationsService.proformaHandoff`). It returns `ready` only for the accepted
revision, along with the items, totals, customer and currency, and creates
nothing. Implemented by Module 6 (see `07_PROFORMA_INVOICE.md`): PIs store
`quotationId` and `quotationRevisionId` (Restrict), copy the lines into their
own tables, and are counted in the customer and product reference checks; the
hand-off now also reports the live PI (`existingProforma`).

Permissions: `quotation.read`, `create` (from enquiry), `create_manual`,
`update`, `revise`, `submit`, `approve`, `send` (mark sent and record
customer responses), `download`, `cancel`, `delete` (never-issued drafts
only), `export`, `reports`.
