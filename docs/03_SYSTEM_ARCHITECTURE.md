# Kenzo Infosystems ERP

## System Architecture

**Version:** Draft v1.0

------------------------------------------------------------------------

## 1. Architecture overview

Recommended initial architecture: **modular monolith**.

-   Next.js is the web application and user interface.
-   NestJS is the API server and owns business rules.
-   PostgreSQL stores transactional and master data.
-   Prisma is the data-access layer and migration tool.
-   Redis/BullMQ is optional infrastructure for asynchronous tasks.
-   Object storage stores uploaded and generated documents.
-   OCR and email providers are external integrations.

Do not begin with microservices. A modular monolith is simpler to
develop, test, deploy and operate for the initial scope.

## 2. Logical architecture diagram

``` mermaid
flowchart TB
    U[Business Users]
    FE[Next.js Web Application]
    API[NestJS REST API]
    AUTH[Authentication and RBAC]
    MOD[Business Modules]
    DBL[Prisma Data Access]
    PG[(PostgreSQL)]
    Q[Redis and BullMQ - optional]
    WORK[Background Workers]
    OBJ[(Private Object Storage)]
    OCR[OCR Provider]
    MAIL[Email Provider]
    PDF[PDF Generation]

    U --> FE
    FE <-->|HTTPS JSON API| API
    API --> AUTH
    API --> MOD
    MOD --> DBL
    DBL <--> PG
    MOD --> OBJ
    MOD --> Q
    Q --> WORK
    WORK --> OCR
    WORK --> MAIL
    WORK --> PDF
    PDF --> OBJ
    OCR --> WORK
    MAIL --> WORK
```

## 3. Frontend architecture -- Next.js

Responsibilities: - Authentication screens and protected application
routes. - Dashboard and navigation. - Vendor, product, customer and
enquiry forms. - Search, filters, tables and detail pages. - Quotation
editor and version history. - PI, payment and delivery screens. - File
upload and OCR review screens. - Reports and exports. - API
error/loading/empty states.

Suggested frontend organization:

``` text
frontend/
├── public/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── forgot-password/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── vendors/
│   │   │   ├── companies/
│   │   │   ├── products/
│   │   │   ├── inventory/
│   │   │   ├── customers/
│   │   │   ├── enquiries/
│   │   │   ├── quotations/
│   │   │   ├── proforma-invoices/
│   │   │   ├── payments/
│   │   │   ├── deliveries/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── tables/
│   │   └── feedback/
│   ├── features/
│   │   ├── vendors/
│   │   ├── inventory/
│   │   ├── customers/
│   │   ├── enquiries/
│   │   ├── quotations/
│   │   ├── invoices/
│   │   ├── payments/
│   │   └── deliveries/
│   ├── lib/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── permissions/
│   │   └── utils/
│   ├── hooks/
│   ├── types/
│   └── styles/
├── tests/
├── package.json
└── next.config.ts
```

This is a proposed structure. Adjust it to the selected Next.js version
and App Router conventions.

## 4. Backend architecture -- NestJS

NestJS owns all business rules and database writes.

Suggested modules: - AuthModule - UsersModule - RolesModule -
PermissionsModule - VendorsModule - CompaniesModule - ProductsModule -
InventoryModule - CustomersModule - EnquiriesModule - QuotationsModule -
ProformaInvoicesModule - PaymentsModule - DeliveriesModule -
DocumentsModule - OcrModule - EmailModule - ReportsModule -
AuditLogsModule - SettingsModule - DatabaseModule

Each business module should normally contain: - Controller: HTTP
endpoints and request/response mapping - Service: business logic - DTOs:
validated input contracts - Module: dependency registration -
Repository/data-access abstraction only where it provides value - Tests:
unit and integration coverage

Example:

``` text
vendors/
├── vendors.module.ts
├── vendors.controller.ts
├── vendors.service.ts
├── dto/
│   ├── create-vendor.dto.ts
│   ├── update-vendor.dto.ts
│   └── query-vendors.dto.ts
├── policies/
└── vendors.service.spec.ts
```

## 5. Recommended technology choices

  -----------------------------------------------------------------------
  Layer                               Recommendation
  ----------------------------------- -----------------------------------
  Frontend                            Next.js + TypeScript

  Backend                             NestJS + TypeScript

  API style                           REST with JSON

  API contract                        Swagger / OpenAPI

  Database                            PostgreSQL

  ORM                                 Prisma

  Authentication                      Passport with secure session/token
                                      strategy

  Authorization                       NestJS guards and RBAC policies

  Validation                          class-validator/class-transformer
                                      or a consistent schema validation
                                      approach

  Background jobs                     Redis + BullMQ when asynchronous
                                      workload requires it

  File storage                        Private S3-compatible object
                                      storage

  OCR                                 Approved provider such as Google
                                      Cloud Vision or AWS Textract

  Email                               SMTP or transactional email
                                      provider

  PDF                                 PDFKit or server-side HTML-to-PDF
                                      using Puppeteer

  Logging                             Structured logger such as Pino

  Testing                             Jest and Supertest

  Deployment                          Containerized services or managed
                                      application hosting
  -----------------------------------------------------------------------

Select exact versions and providers during implementation planning.
Avoid unnecessary dependencies.

## 6. API design

Use a versioned API prefix, for example `/api/v1`.

Example endpoints:

  ----------------------------------------------------------------------------------------
  Method                  Endpoint                                 Purpose
  ----------------------- ---------------------------------------- -----------------------
  POST                    `/api/v1/auth/login`                     Sign in

  GET                     `/api/v1/vendors`                        Search/list vendors

  POST                    `/api/v1/vendors`                        Create vendor

  GET                     `/api/v1/vendors/:id`                    Vendor detail

  POST                    `/api/v1/vendors/:id/products`           Map vendor products

  GET                     `/api/v1/products`                       Search products

  POST                    `/api/v1/customers`                      Create customer

  POST                    `/api/v1/enquiries`                      Create enquiry

  POST                    `/api/v1/enquiries/:id/quotations`       Create quotation

  POST                    `/api/v1/quotations/:id/versions`        Create revision

  POST                    `/api/v1/quotations/:id/approve`         Approve quotation

  POST                    `/api/v1/quotations/:id/convert-to-pi`   Convert approved
                                                                   quotation

  POST                    `/api/v1/invoices/:id/payments`          Record payment

  POST                    `/api/v1/invoices/:id/deliveries`        Record delivery

  GET                     `/api/v1/reports/receivables`            Outstanding report
  ----------------------------------------------------------------------------------------

Use consistent pagination, sorting, filtering, error formats and request
correlation IDs.

## 7. Authentication and authorization

-   Hash passwords using Argon2id or bcrypt.
-   Use secure, HTTP-only, Secure and appropriate SameSite cookies for
    browser sessions where suitable.
-   If JWT is used, implement access-token expiry, refresh-token
    rotation/revocation and secure storage.
-   Do not store long-lived sensitive tokens in localStorage.
-   Apply guards to all protected endpoints.
-   Check resource-level permissions where users should only access
    assigned records.
-   Log privileged operations.

## 8. Database and transaction architecture

-   PostgreSQL is the source of truth.
-   Prisma schema defines relational models and migrations.
-   Use foreign keys and unique constraints.
-   Use database transactions for multi-step critical operations.
-   Use decimal types for money.
-   Use explicit currency codes.
-   Use database-backed document number allocation with concurrency
    safety.
-   Store invoice and quotation line-item snapshots.
-   Use append-only or auditable records for payments and stock
    movements.
-   Use indexes for common filters and search.
-   Avoid hard deletes of records referenced by financial history.

## 9. Asynchronous processing

Use background jobs for work that may be slow or unreliable: - OCR
processing - Email delivery - Large PDF generation - Bulk import - Large
report exports

A job should have: - Unique job/business reference - Status - Retry
policy - Backoff - Failure details - Idempotent processing - Monitoring

Do not put every simple API operation into a queue. Use synchronous
processing where it is fast and transactional.

## 10. File and document storage

-   Store files in private object storage.
-   Keep metadata and storage keys in PostgreSQL.
-   Serve downloads through permission-checked API endpoints or
    short-lived signed URLs.
-   Validate MIME type, extension, file size and file signature.
-   Consider malware scanning.
-   Never trust a client-provided filename or path.
-   Keep original OCR source documents.
-   Link generated PDFs to the record and version that produced them.

## 11. Observability and operations

-   Structured application logs.
-   Error monitoring.
-   Health/readiness endpoints.
-   Database connection monitoring.
-   Queue monitoring if queues are used.
-   Audit logs for business events.
-   Backup schedule and tested restore process.
-   Separate development, staging and production environments.
-   CI checks for lint, typecheck, tests and migrations.

## 12. Deployment topology

Initial deployment can use: - Next.js application service - NestJS API
service - PostgreSQL managed database - Redis service if background jobs
are enabled - Private object storage - External OCR/email providers

Use HTTPS, managed secrets, restricted network access, backups and a
documented deployment/rollback process.

## 13. Architecture decisions still required

-   Single location or multiple branches?
-   Single company or multi-company?
-   Stock ledger and warehouses?
-   Procurement/purchase orders and GRN?
-   Customer portal?
-   Tax and e-invoicing requirements?
-   Hosting provider and data residency requirements?
-   OCR/email provider selection?
