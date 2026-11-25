# Kenzo Infosystems ERP

## Repository Structure and Engineering Conventions

**Version:** Draft v1.0\
**Architecture:** Next.js frontend + NestJS backend + PostgreSQL +
Prisma\
**Repository style:** Monorepo

------------------------------------------------------------------------

## 1. Recommended repository layout

``` text
kenzo-infosystems-erp/
│
├── apps/
│   ├── web/                         # Next.js frontend
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/
│   │   │   │   │   └── forgot-password/
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── vendors/
│   │   │   │   │   ├── companies/
│   │   │   │   │   ├── products/
│   │   │   │   │   ├── inventory/
│   │   │   │   │   ├── customers/
│   │   │   │   │   ├── enquiries/
│   │   │   │   │   ├── quotations/
│   │   │   │   │   ├── proforma-invoices/
│   │   │   │   │   ├── payments/
│   │   │   │   │   ├── deliveries/
│   │   │   │   │   ├── reports/
│   │   │   │   │   └── settings/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── globals.css
│   │   │   ├── components/
│   │   │   │   ├── ui/
│   │   │   │   ├── layout/
│   │   │   │   ├── forms/
│   │   │   │   ├── tables/
│   │   │   │   └── feedback/
│   │   │   ├── features/
│   │   │   │   ├── vendors/
│   │   │   │   ├── inventory/
│   │   │   │   ├── customers/
│   │   │   │   ├── enquiries/
│   │   │   │   ├── quotations/
│   │   │   │   ├── invoices/
│   │   │   │   ├── payments/
│   │   │   │   └── deliveries/
│   │   │   ├── lib/
│   │   │   │   ├── api/
│   │   │   │   ├── auth/
│   │   │   │   ├── permissions/
│   │   │   │   └── utils/
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── styles/
│   │   ├── tests/
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── api/                         # NestJS backend
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── config/
│       │   ├── common/
│       │   │   ├── decorators/
│       │   │   ├── guards/
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   ├── pipes/
│       │   │   ├── dto/
│       │   │   └── utils/
│       │   ├── database/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── roles/
│       │   ├── permissions/
│       │   ├── vendors/
│       │   ├── companies/
│       │   ├── products/
│       │   ├── inventory/
│       │   ├── customers/
│       │   ├── enquiries/
│       │   ├── quotations/
│       │   ├── proforma-invoices/
│       │   ├── payments/
│       │   ├── deliveries/
│       │   ├── documents/
│       │   ├── ocr/
│       │   ├── email/
│       │   ├── reports/
│       │   ├── audit-logs/
│       │   └── settings/
│       ├── test/
│       ├── nest-cli.json
│       └── package.json
│
├── packages/
│   ├── contracts/                   # Shared API contracts/types if useful
│   ├── eslint-config/
│   └── tsconfig/
│
├── docs/
│   ├── 01_PRD.md
│   ├── 02_WORKFLOW.md
│   ├── 03_SYSTEM_ARCHITECTURE.md
│   ├── 04_DATA_FLOW_DIAGRAMS.md
│   ├── 05_REPOSITORY_STRUCTURE.md
│   ├── decisions/
│   └── api/
│
├── infra/
│   ├── docker/
│   ├── deployment/
│   └── monitoring/
│
├── .github/
│   └── workflows/
│
├── .editorconfig
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── .env.example
```

The project uses **npm workspaces**. pnpm was the original suggestion, but
corepack cannot verify the pnpm signature on the current development machine,
and npm workspaces cover the same need.

backend and frontend exist as described. Module folders for customers,
enquiries, quotations, invoicing, payments and delivery are planned, not built.

## 2. NestJS module internal structure

Example `vendors` module:

``` text
vendors/
├── dto/
│   ├── create-vendor.dto.ts
│   ├── update-vendor.dto.ts
│   ├── vendor-query.dto.ts
│   └── map-vendor-product.dto.ts
├── policies/
│   └── vendor.policy.ts
├── vendors.controller.ts
├── vendors.service.ts
├── vendors.module.ts
└── vendors.service.spec.ts
```

Use a consistent module pattern. Do not create generic abstractions or
repository layers without a concrete need.

## 3. Prisma organization

Start with one Prisma schema for the application unless schema
complexity justifies splitting it.

Recommended practices: - Every schema change is made through a
migration. - Never manually alter production schema without a
migration. - Use explicit relation names for ambiguous relations. - Add
unique constraints for business identifiers. - Use Decimal for currency
and quantities where precision is needed. - Add indexes based on real
query patterns. - Use seed scripts only for required reference data and
initial administrator setup. - Do not seed fake vendors, customers,
products or transactions into production.

Potential model groups: - Identity: User, Role, Permission, UserRole,
RolePermission - Vendor: Vendor, VendorCompany, VendorProduct -
Catalogue: Company, ProductCategory, Product, ProductModel - Stock
(conditional): StockLocation, StockMovement - CRM: Customer,
CustomerContact, Enquiry, EnquiryItem - Sales: Quotation,
QuotationVersion, QuotationItem, QuotationApproval - Billing:
ProformaInvoice, ProformaInvoiceItem - Finance: Payment,
PaymentAllocation - Fulfilment: Delivery, DeliveryItem - Documents:
Document, OcrJob, EmailLog - Governance: AuditLog, Setting

## 4. API module conventions

-   Use `/api/v1` versioning.
-   Controllers should remain thin.
-   Put business rules in services/domain logic.
-   Validate all incoming DTOs.
-   Return consistent response and error shapes.
-   Use server-side pagination and filtering.
-   Document endpoints in Swagger.
-   Add authorization metadata and guards.
-   Use transactions for multi-step critical writes.
-   Use idempotency keys for retryable operations such as PI conversion
    and payment creation where appropriate.

## 5. Naming conventions

  Item                     Convention               Example
  ------------------------ ------------------------ ----------------------
  Database tables/models   PascalCase model names   `ProformaInvoice`
  Database fields          camelCase in Prisma      `invoiceNumber`
  NestJS modules           kebab-case folders       `proforma-invoices/`
  Classes                  PascalCase               `VendorsService`
  Methods/variables        camelCase                `createVendor()`
  React components         PascalCase               `VendorForm`
  Routes                   kebab-case               `/proforma-invoices`
  Environment variables    UPPER_SNAKE_CASE         `DATABASE_URL`

## 6. Environment configuration

Maintain separate environment variables for local, staging and
production environments.

Example `.env.example`:

``` dotenv
NODE_ENV=development

WEB_URL=http://localhost:3000
API_URL=http://localhost:4000
PORT=4000

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/kenzo_erp
REDIS_URL=redis://localhost:6379

AUTH_ACCESS_SECRET=replace-with-secret
AUTH_REFRESH_SECRET=replace-with-secret

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=

OCR_PROVIDER=
OCR_API_KEY=

EMAIL_PROVIDER=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=
```

Never commit real secrets. Validate required environment variables at
application startup. Use a secrets manager in production where
available.

## 7. Testing structure

Frontend: - Component tests - Form validation tests - Route/permission
visibility tests - End-to-end user workflows

Backend: - Unit tests for services and calculations - Controller/API
integration tests - Authorization tests - Database integration tests -
Workflow tests for quotation-to-PI, payment and delivery

Critical scenarios: - Duplicate vendor handling - Quotation revision
immutability - Duplicate PI conversion prevention - Partial payment
calculations - Payment reversal audit trail - Partial delivery
quantities - Unauthorized record access - OCR confirmation requirement

## 8. Git and delivery conventions

Suggested branches: - `main`: production-ready - `develop`: integration
branch - `feature/<name>`: feature development - `fix/<name>`: bug
fixes - `hotfix/<name>`: urgent production fixes

Pull requests should include: - Scope and rationale - Screenshots/API
examples where useful - Database migration notes - Test evidence -
Security and permission impact - Rollback considerations

## 9. Development order

1.  Repository setup and CI.
2.  Database connection and Prisma migrations.
3.  Authentication, users and RBAC.
4.  Vendors, brands and vendor-product mappings.
5.  Product catalogue and stock decision.
6.  Customers and enquiries.
7.  Quotations and versioning.
8.  Proforma invoices and PDF generation.
9.  Payments and receivables.
10. Delivery and fulfilment.
11. OCR, email and document integrations.
12. Reports, audit and dashboard.
13. Security review, performance testing and deployment.

## 10. Definition of done

A feature is not complete merely because its screen exists.

A feature is complete only when: - UI is connected to real APIs. -
Backend validation and authorization are implemented. - Database
constraints and migrations are included. - Loading, empty, success and
error states work. - Audit requirements are met. - Unit/integration
tests pass. - API documentation is updated. - No secrets or dummy
production data are committed. - Existing workflows continue to work.
