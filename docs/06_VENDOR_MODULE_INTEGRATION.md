# Vendor Management — Integration Guide for Later Modules

How Product, Customer, Enquiry, Quotation, Proforma Invoice, Payment and
Delivery modules should use the vendor data. The rule: **reuse these records
by ID; never copy vendor, brand or product data into a module's own tables.**

## 1. Entities

```
Vendor ──< VendorContact        (typed; one primary per contact type)
   │  ──< VendorAddress         (typed; exactly one primary)
   │  ──< VendorCompany >── Company   (shared Brand master)
   │  ──< VendorProduct >── Product   (shared catalogue; Product = one brand + model number)
   │  ──< Document              (private storage; vendorId FK)
   └── AuditLog (entityType='Vendor', or parentEntityType='Vendor' for child rows)
```

| Table | Owner | Notes |
| --- | --- | --- |
| `vendors` | Module 1 | `id` (UUID) is the stable reference. `vendorCode` is human-facing only. |
| `vendor_contacts`, `vendor_addresses` | Module 1 | Authoritative. `vendors.contactPerson` and `vendors.address*/city/state` are mirrors of the primary rows, kept in sync by the service — read them, never write them. |
| `companies` | Shared (Brand master) | Unique by normalised name. Product Management owns its UI. |
| `products` | Shared (Product Management) | Unique by `(companyId, modelNumber)`. There is no separate model table: one product row is one model. |
| `vendor_companies`, `vendor_products` | Module 1 | Unique per pair. Mapping a product auto-maps its brand; a brand cannot be unmapped while products of that brand are mapped. |
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

## 3. APIs to call (all under `/api/v1`, same JWT and RBAC)

| Need | Endpoint |
| --- | --- |
| Pick an active vendor | `GET /vendors/lookup?search=` |
| Suppliers of a product | `GET /vendors/lookup?productId=` (includes vendor SKU, lead time, preferred flag) |
| Vendors of a brand | `GET /vendors/lookup?companyId=` |
| Full vendor record | `GET /vendors/:id` |
| Vendors per product on the product page | `GET /products/:id` → `vendors[]` |
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
