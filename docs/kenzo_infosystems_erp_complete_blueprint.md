<!-- GENERATED FILE - DO NOT EDIT DIRECTLY.
     This is docs 01-05 concatenated. Edit those files, then regenerate:
       node -e "..."  (see docs/README.md)
     Editing this copy by hand makes it drift from the source documents. -->

# Kenzo Infosystems ERP & Business Management System

## Product Requirements Document (PRD)

**Document status:** Draft v1.0\
**Prepared for:** Kenzo Infosystems\
**Project delivery team:** Kenzo Infosystems\
**Frontend:** Next.js + TypeScript\
**Backend:** NestJS + TypeScript\
**Database:** PostgreSQL\
**ORM:** Prisma

------------------------------------------------------------------------

## 1. Product overview

Kenzo Infosystems is a hardware business that needs a centralized
system to manage supplier relationships, its product catalogue and stock
(if applicable), customer enquiries, quotations, proforma invoices,
payments, and product deliveries.

The proposed product is a web-based ERP and business management
application. It will connect business records so that information
entered once can be reused throughout the sales lifecycle.

The application is planned as a **modular monolith**: one NestJS backend
organized into business modules, one Next.js frontend, and one
PostgreSQL database. This keeps the initial system maintainable while
allowing future scaling.

## 2. Product goals

1.  Centralize vendor, product, customer, enquiry, quotation, invoice,
    payment, and delivery information.
2.  Reduce duplicate data entry through linked records and controlled
    data reuse.
3.  Support manual entry and OCR-assisted data capture where specified.
4.  Preserve quotation revisions and transaction history.
5.  Track full and partial payments, outstanding balances, and partial
    deliveries independently.
6.  Generate professional PDF documents and send them to customers by
    email.
7.  Enforce role-based access and maintain an audit trail for important
    operations.
8.  Provide accurate dashboards and exportable reports based on real
    database data.

## 3. Users and stakeholders

### Proposed roles

  -----------------------------------------------------------------------
  Role                                Primary responsibilities
  ----------------------------------- -----------------------------------
  Super Admin                         System configuration, user/role
                                      management, all authorized business
                                      operations

  Admin                               Operational administration and
                                      oversight

  Vendor Manager                      Vendor onboarding, vendor records,
                                      vendor-product relationships

  Inventory Manager                   Product catalogue and stock
                                      operations, if stock tracking is
                                      enabled

  Sales Manager                       Sales oversight, quotation
                                      review/approval, customer and
                                      enquiry visibility

  Sales Executive                     Customer records, enquiries,
                                      quotation preparation and
                                      communication

  Accounts Manager                    Proforma invoices, payment
                                      recording, receivables and payment
                                      reports

  Delivery Manager                    Dispatch, delivery records and
                                      pending delivery tracking
  -----------------------------------------------------------------------

Roles are initial proposals. The final role list and permission matrix
must be approved by Kenzo Infosystems.

### Permission actions

Permissions should be granular and assigned to roles: - View - Create -
Edit - Delete or archive - Approve - Send email - Download - Export -
Manage settings

Authorization must be enforced by NestJS guards/services. Hiding a
button in Next.js is not sufficient security.

## 4. Scope

### 4.1 In scope

-   Authentication and user administration
-   Role-based access control
-   Vendor management
-   Company/brand management
-   Vendor-company-product mapping
-   Product catalogue and search
-   Inventory/stock management, subject to stock-process confirmation
-   Customer management
-   Customer enquiries and enquiry items
-   Quotation creation, revisions, approval, PDF and email
-   Proforma invoice creation, PDF and email
-   Full and partial payment recording
-   Outstanding balance calculation
-   Product dispatch and partial delivery tracking
-   Document upload and storage
-   OCR-assisted extraction for vendor documents and quotations
-   Email integration and send logs
-   Dashboard, reports and exports
-   Audit logs and system settings

### 4.2 Out of scope until confirmed

The following must not be assumed or implemented as finalized
requirements: - Purchase orders and procurement workflow - Vendor bills
and accounts payable - Goods receipt notes (GRN) - Multiple warehouses
or branch-level stock - Multi-company/tenant support - GST e-invoicing,
e-way bills or accounting-platform integration - Customer portal -
Payment gateway integration - Automatic bank reconciliation -
Serial-number, IMEI or warranty tracking - Returns, replacements, RMA
and credit notes - Sales tax/accounting ledger beyond the confirmed
invoice/payment needs

These can be added after stakeholder confirmation.

## 5. Functional requirements

### 5.1 Authentication and user administration

-   Users can securely sign in and sign out.
-   Passwords must be stored using a modern password-hashing algorithm
    such as Argon2id or bcrypt with appropriate parameters.
-   Support password reset using a verified mechanism.
-   Access tokens and refresh sessions must be handled securely.
-   Administrators can create, deactivate and manage users.
-   Every protected API must validate the user's identity and
    permissions.
-   Sensitive actions must be recorded in audit logs.

### 5.2 Vendor management

Vendor records should support: - Vendor legal/business name - Contact
person and contact details - Email and phone - Address - GSTIN/PAN where
applicable - Vendor status (e.g. active, inactive) - Notes and
attachments - Created/updated metadata

Vendor onboarding: 1. User chooses manual entry or document upload. 2.
For OCR, the system stores the original file and submits it for
extraction. 3. Extracted values are shown in a review form with
confidence/field status where available. 4. User corrects and confirms
the values. 5. Backend validates uniqueness and required fields. 6.
Vendor is saved only after confirmation.

Vendor relationships: - A vendor may be associated with multiple
companies/brands. - A vendor may supply multiple products. - A product
may have multiple vendors. - Store mapping-specific details only when
required, such as vendor SKU, quoted supply price, lead time or
preferred-vendor flag. These fields need stakeholder confirmation.

Vendor search: - Search by vendor name, company/brand, product name and
model. - Support pagination, sorting and filters. - Search must be
backed by server-side queries.

### 5.3 Company/brand management

-   Maintain a normalized company/brand catalogue.
-   Avoid storing repeated free-text brand names in every product or
    mapping record.
-   Support active/inactive status and searchable names.
-   Confirm whether "company" and "brand" mean the same thing in Kenzo Infosystems'
    business vocabulary.

### 5.4 Product catalogue and inventory

Product catalogue fields may include: - Brand/company - Product
category - Product name - Model number - Design/reference number, if
applicable - Description - Technical specifications - Image and
attachments - Active/inactive status

Search: - Product name - Model - Brand/company - Design/reference
number - Category

Stock management is conditional on stakeholder confirmation. If physical
stock is tracked, the system should support: - Stock
location/warehouse - Quantity on hand - Reserved quantity, if required -
Available quantity - Stock movements with reason and source document -
Receipts, dispatches, adjustments and returns only after their business
rules are approved - Transaction-safe stock updates and stock movement
history

Do not treat a product catalogue entry as proof that stock is physically
available.

### 5.5 Customer management

Customer fields may include: - Customer/business name - Contact person -
Phone and email - Billing and shipping addresses - GSTIN and other tax
details, where applicable - Notes and attachments - Active/inactive
status

A customer may have multiple contacts and multiple enquiries. Avoid
duplicating the customer record for every enquiry.

### 5.6 Enquiry management

An enquiry belongs to a customer and may contain one or more requested
items.

Suggested fields: - Enquiry number - Customer - Enquiry date -
Source/channel, if required - Status - Assigned sales user -
Requirements and remarks - Enquiry items: brand, product/model,
requested quantity, specifications and notes

Each enquiry should retain its history and be linkable to one or more
quotation revisions/versions according to the approved business process.

### 5.7 Quotation management

Quotation creation methods: - Manual entry - OCR-assisted extraction
from uploaded quotation documents

Quotation fields: - Unique quotation number - Customer and enquiry
references - Issue date and validity date - Currency - Line items:
product/model, description, quantity, unit, unit price, discount and
tax - Subtotal, discount total, tax total and grand total - Terms and
conditions - Notes - Status and approval information

Quotation revision rules: 1. A sent quotation must not be overwritten
when revised. 2. Each revision/version must be preserved. 3. The system
must identify the current version and the approved final version. 4. A
quotation revision should retain a link to its parent quotation/enquiry.
5. Only an approved quotation can be converted to a proforma invoice. 6.
The exact approval authority and whether customers can approve by
email/link must be confirmed.

Suggested statuses: - Draft - Pending Approval - Approved Internally -
Sent - Revision Requested - Customer Approved - Rejected - Expired -
Cancelled

Do not assume "email sent" means "customer approved".

### 5.8 Proforma invoice management

-   Create a proforma invoice from an approved quotation.
-   Copy a snapshot of customer and line-item details into the invoice
    so historical documents remain accurate if master data changes.
-   Generate a unique invoice number using an approved numbering
    convention.
-   Store issue date, due date, currency, payment terms, bank details,
    tax totals and grand total.
-   Generate a branded PDF.
-   Email the PDF to the customer.
-   Maintain status and document history.
-   Prevent accidental duplicate invoice generation from repeated
    requests.

A proforma invoice is not automatically proof of payment or a tax
invoice. Kenzo Infosystems' accounting/legal document requirements must be
confirmed with its finance team.

### 5.9 Payment management

-   Record multiple payments against an invoice.
-   Capture amount, date, mode, transaction/reference number, notes and
    supporting document.
-   Support full and partial payments.
-   Calculate invoice amount received and outstanding amount on the
    backend.
-   Prevent allocations that exceed the permitted invoice balance unless
    an approved overpayment/refund process exists.
-   Preserve payment history; corrections should be auditable.
-   Generate payment receipts where required.

Core calculation:

`Outstanding = Invoice Grand Total - Sum of Valid Allocated Payments`

Use decimal database types for money. Do not use floating-point
arithmetic for financial calculations.

### 5.10 Delivery management

-   Create delivery/dispatch records linked to the customer and relevant
    invoice/order.
-   Track ordered, delivered and pending quantities by line item.
-   Support multiple partial deliveries.
-   Capture dispatch date, delivery date, transporter/courier and
    reference details where applicable.
-   Store proof-of-delivery documents if required.
-   Keep delivery status separate from payment status.
-   Validate that cumulative delivered quantity does not exceed the
    allowed ordered quantity unless an authorized exception is defined.

### 5.11 OCR and document management

OCR flow: 1. Validate file type and size. 2. Store the original document
securely. 3. Create an OCR processing record. 4. Submit to the
configured OCR provider. 5. Normalize extracted values into a
provider-independent structure. 6. Present extracted values for human
review. 7. Save business records only after confirmation. 8. Store
processing status, errors and provider metadata.

OCR output is untrusted input. It must be validated and must never
directly trigger financial approval or business actions.

Document management: - Store file metadata and secure storage key, not
public unrestricted file paths. - Link documents to the relevant
business record. - Enforce access permissions on downloads. - Record
upload/download activity where appropriate. - Support retention and
deletion policies.

### 5.12 Email integration

-   Send quotations, proforma invoices and payment receipts as
    permitted.
-   Use configurable provider credentials and sender identity.
-   Maintain email logs: recipient, subject, related record, status,
    provider message ID and failure reason.
-   Retry transient failures safely.
-   Avoid duplicate sends caused by repeated requests.
-   Do not expose provider credentials to the frontend.

### 5.13 Reports and dashboard

Dashboard metrics may include: - Vendor count - Product count - Customer
count - Enquiry count - Quotations by status - Proforma invoice value -
Payments received - Outstanding receivables - Pending and completed
deliveries

Reports: - Vendor and vendor-product reports - Product catalogue and
stock reports - Customer and enquiry reports - Quotation reports -
Invoice reports - Payment and outstanding reports - Delivery reports

All values must be calculated from actual authorized database records.
Support date filters and appropriate PDF/Excel export.

## 6. Core business rules

1.  A vendor may map to many brands and products; a product may map to
    many vendors.
2.  Customer records are reusable across multiple enquiries.
3.  An enquiry may have multiple quotation revisions.
4.  Historical quotation revisions must remain immutable after issue;
    revisions create new records.
5.  Only an approved quotation may be converted into a proforma invoice.
6.  Invoice line items and customer details should be snapshotted for
    document integrity.
7.  An invoice can have multiple payment records.
8.  Payment status is derived from invoice amount and valid payments,
    subject to approved finance rules.
9.  An invoice/order can have multiple delivery records.
10. Payment and delivery statuses are independent.
11. OCR data requires human review before creating or changing business
    records.
12. Important operations must be permission-checked and audited.
13. Document numbering must be unique and concurrency-safe.
14. Critical multi-record changes must use database transactions.
15. Soft deletion/archiving should be used for business records where
    history must be preserved; financial records should not be silently
    deleted.

## 7. Non-functional requirements

### Security

-   HTTPS in all deployed environments.
-   Secure password hashing.
-   Strong session/token lifecycle.
-   Backend RBAC.
-   DTO validation and output filtering.
-   Rate limiting and brute-force protection.
-   Secure file upload validation and malware scanning where feasible.
-   Secrets stored in environment/secret management, never committed.
-   Audit logging for privileged actions.
-   Protection against injection, IDOR, CSRF where applicable, XSS and
    insecure direct file access.

### Reliability and data integrity

-   PostgreSQL constraints and transactions.
-   Idempotency for critical create/send/convert operations.
-   Automated database backups and tested restoration.
-   Error monitoring and structured logs.
-   No silent failures.

### Performance

-   Server-side pagination, filtering and sorting.
-   Indexed search fields.
-   Avoid N+1 database queries.
-   Background processing for slow OCR, email and report tasks.
-   Define measurable response-time and concurrency targets with the
    client.

### Usability

-   Responsive desktop, tablet and mobile interfaces.
-   Consistent forms and validation feedback.
-   Loading, empty, error and success states.
-   Accessible labels and keyboard navigation.
-   Clear audit/history views.

### Maintainability

-   Modular NestJS architecture.
-   Shared API contracts/types where appropriate.
-   Automated tests and CI checks.
-   Versioned database migrations.
-   OpenAPI/Swagger documentation.

## 8. Acceptance criteria

The product is ready for stakeholder acceptance when: - Authorized users
can perform their permitted actions and unauthorized requests are
rejected by the backend. - Vendor, product, customer and enquiry records
can be created, searched and linked correctly. - Vendor-product mapping
supports many-to-many relationships. - OCR extraction is reviewable and
does not auto-save unconfirmed values. - Quotation revisions are
preserved and the final approved version is identifiable. - Only an
approved quotation can generate a proforma invoice. - Multiple payments
calculate the correct outstanding balance. - Partial deliveries
calculate the correct delivered and pending quantities. - Payment and
delivery states can differ. - PDFs are generated from stored transaction
snapshots. - Email attempts and failures are recorded. - Reports
reconcile with underlying records. - Critical workflows pass automated
integration tests. - Backup and restore procedures are documented and
tested.

## 9. Risks and dependencies

  -----------------------------------------------------------------------
  Risk/dependency                     Mitigation
  ----------------------------------- -----------------------------------
  Unclear stock process               Confirm catalogue-only vs stock
                                      ledger before inventory schema is
                                      finalized

  Unclear procurement process         Confirm whether purchase orders,
                                      GRNs and vendor bills are required

  Unclear branch/company model        Confirm single location vs multiple
                                      branches/companies

  OCR inaccuracies                    Human review, field validation and
                                      confidence indicators

  Financial calculation errors        Decimal types, server-side
                                      calculations, transactions and
                                      tests

  Duplicate documents/payments        Unique constraints and idempotency

  Email deliverability                Verified sender domain, provider
                                      logs and retry strategy

  Document exposure                   Private storage and
                                      permission-checked downloads
  -----------------------------------------------------------------------

## 10. Open decisions requiring client confirmation

1.  Is inventory a catalogue only, or does Kenzo Infosystems track physical stock
    quantities?
2.  Does Kenzo Infosystems purchase from vendors through purchase orders and goods
    receipt?
3.  Is Kenzo Infosystems one company at one location, one company with multiple
    branches, or multiple companies?
4.  Are warehouses/stock locations required?
5.  What is the approved quotation and invoice numbering format?
6.  Who can approve quotations and invoices?
7.  What currency, GST/tax rules, rounding and discount rules apply?
8.  Can products be delivered before full payment? Who authorizes
    exceptions?
9.  Are returns, replacements, warranties and credit notes required?
10. Which OCR and email providers are approved?
11. What file types, file size limits and document retention policies
    apply?
12. Which reports and export formats are mandatory?

**PRD status:** This is a baseline draft based on currently supplied
requirements. Resolve open decisions with Kenzo Infosystems stakeholders before
treating it as a signed-off specification.
------------------------------------------------------------------------

# Kenzo Infosystems ERP

## Business Workflow and Process Specification

**Version:** Draft v1.0

------------------------------------------------------------------------

## 1. End-to-end lifecycle

``` mermaid
flowchart TD
    A[Vendor onboarding] --> B[Vendor-company-product mapping]
    B --> C[Product catalogue]
    C --> D{Physical stock tracking enabled?}
    D -->|Yes| E[Stock ledger and availability]
    D -->|No| F[Catalogue availability information]
    E --> G[Customer registration]
    F --> G
    G --> H[Customer enquiry]
    H --> I[Prepare quotation]
    I --> J{Customer requests revision?}
    J -->|Yes| K[Create new quotation version]
    K --> I
    J -->|No| L{Quotation approved?}
    L -->|No| M[Rejected / closed / follow-up]
    L -->|Yes| N[Generate proforma invoice]
    N --> O[Send PI to customer]
    O --> P[Record one or more payments]
    P --> Q[Calculate outstanding balance]
    Q --> R[Create delivery / dispatch]
    R --> S[Record partial or complete delivery]
    S --> T[Customer transaction history and reports]
```

Vendor/product setup and customer sales are related but not strictly
sequential. Kenzo Infosystems may maintain its catalogue and vendors before a
customer enquiry arrives.

## 2. Vendor onboarding workflow

``` mermaid
flowchart TD
    A[Open Vendor Management] --> B{Entry method}
    B -->|Manual| C[Enter vendor details]
    B -->|OCR| D[Upload document]
    D --> E[Validate file]
    E --> F[OCR extraction]
    F --> G[Review and correct extracted fields]
    C --> H[Backend validation]
    G --> H
    H --> I{Valid and duplicate check passed?}
    I -->|No| J[Show validation errors]
    J --> C
    I -->|Yes| K[Save vendor]
    K --> L[Map brands and products]
    L --> M[Vendor profile and history]
```

Rules: - OCR never creates a vendor without user confirmation. -
Duplicate checks should consider approved identifiers such as GSTIN and
normalized name/contact details. - Vendor-product relationships should
be stored separately from vendor master data. - Vendor deactivation
should preserve historical transactions.

## 3. Product and inventory workflow

1.  Authorized user creates or imports a brand/company.
2.  User creates a product and enters model/specification details.
3.  Product may be mapped to one or more vendors.
4.  Product becomes searchable in the catalogue.
5.  If physical stock tracking is enabled, stock is changed only through
    documented stock movements.
6.  Availability shown to sales users is derived from the stock ledger
    and reservation rules, not manually guessed.

``` mermaid
flowchart TD
    A[Brand / Company] --> B[Product and model]
    B --> C[Vendor mappings]
    B --> D{Stock ledger enabled?}
    D -->|Yes| E[Opening balance / receipt / adjustment / dispatch]
    E --> F[Calculate on-hand and available stock]
    D -->|No| G[Catalogue only]
```

The exact stock receipt process depends on whether Kenzo Infosystems uses purchase
orders and goods receipt records.

## 4. Customer and enquiry workflow

1.  Sales user searches for an existing customer.
2.  If found, select that customer; otherwise create a new customer.
3.  Create an enquiry under the customer.
4.  Add one or more requested products/models and quantities.
5.  Assign the enquiry to a sales user if assignment is required.
6.  Update enquiry status and notes as it progresses.
7.  Start a quotation from the enquiry.

An enquiry should not create duplicate customer records.

## 5. Quotation workflow

``` mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> PendingApproval
    PendingApproval --> ApprovedInternally
    PendingApproval --> Draft: Changes requested
    ApprovedInternally --> Sent
    Sent --> RevisionRequested
    RevisionRequested --> NewVersion
    NewVersion --> PendingApproval
    Sent --> CustomerApproved
    Sent --> Rejected
    Sent --> Expired
    CustomerApproved --> ConvertedToPI
    Rejected --> [*]
    Expired --> [*]
    ConvertedToPI --> [*]
```

Process: 1. Create quotation from enquiry. 2. Populate customer and
enquiry information. 3. Add product line items, quantities, prices,
discounts and tax. 4. Validate totals on the backend. 5. Route for
internal approval if required. 6. Generate a PDF snapshot. 7. Send to
customer and record email outcome. 8. If customer requests changes,
create a new version; do not overwrite the issued version. 9. Record
customer approval explicitly. 10. Convert the approved version into a
proforma invoice.

Important: - "Sent" and "approved" are different states. - Email open
tracking is optional and not proof of acceptance. - The final quotation
version must be traceable to its enquiry and prior versions.

## 6. Proforma invoice workflow

``` mermaid
flowchart TD
    A[Customer-approved quotation] --> B[Request PI creation]
    B --> C[Backend checks approval and duplicate conversion]
    C --> D[Create PI and line-item snapshots]
    D --> E[Allocate unique PI number]
    E --> F[Generate PDF]
    F --> G[Store PDF and document metadata]
    G --> H[Send email if requested]
    H --> I[Record email status]
```

The invoice must preserve the commercial values used at the time of
issue, even if the product catalogue or customer master data later
changes.

## 7. Payment workflow

``` mermaid
flowchart TD
    A[Open invoice] --> B[Enter payment]
    B --> C[Validate amount and reference]
    C --> D[Create payment and allocation]
    D --> E[Recalculate allocated total]
    E --> F{Outstanding balance}
    F -->|Zero| G[Paid]
    F -->|Greater than zero and payment exists| H[Partially paid]
    F -->|No payment| I[Unpaid]
    G --> J[Generate receipt if required]
    H --> J
    I --> K[Continue receivables follow-up]
```

Rules: - An invoice may have multiple payments. - A payment may need
allocation to one or more invoices only if Kenzo Infosystems confirms that business
rule. - Payment status is calculated from valid allocations. - Refunds,
reversals, overpayments and payment deletion require explicit finance
rules and audit history.

## 8. Delivery workflow

``` mermaid
flowchart TD
    A[Approved order / invoice reference] --> B[Create delivery]
    B --> C[Select line items and quantities]
    C --> D[Validate pending quantity]
    D --> E[Save dispatch record]
    E --> F[Update cumulative delivered quantity]
    F --> G{All quantities delivered?}
    G -->|No| H[Partially delivered]
    H --> B
    G -->|Yes| I[Delivery completed]
    I --> J[Store delivery proof and history]
```

Payment and delivery are independent dimensions: - Paid + not
delivered - Partially paid + partially delivered - Paid + partially
delivered - Delivered + outstanding amount

Allowed combinations must follow Kenzo Infosystems' credit and dispatch policy.

## 9. Exception workflows

  -----------------------------------------------------------------------
  Situation                           Expected handling
  ----------------------------------- -----------------------------------
  Duplicate vendor/customer           Warn and offer existing record
                                      selection; enforce unique
                                      identifiers where appropriate

  OCR failure                         Preserve upload, show failure and
                                      allow manual entry

  Quotation rejected                  Preserve version and rejection
                                      reason; allow new revision or close
                                      enquiry

  Quotation expired                   Prevent conversion unless
                                      authorized extension/reissue occurs

  PI creation retried                 Idempotency and uniqueness prevent
                                      duplicate PI

  Partial payment                     Record payment and recalculate
                                      outstanding

  Payment reversal                    Create auditable
                                      reversal/adjustment; do not erase
                                      history

  Partial delivery                    Record delivered quantity and leave
                                      remaining quantity pending

  Delivery exceeds order              Reject unless an authorized
                                      exception is defined

  Email fails                         Record failure and allow safe retry

  Document missing                    Show clear error; retain record and
                                      support controlled regeneration
  -----------------------------------------------------------------------

## 10. Cross-module record traceability

Every transaction should be traceable:

`Customer -> Enquiry -> Quotation -> Quotation Version -> Approved Quotation -> Proforma Invoice -> Payments -> Delivery Records -> Documents`

Vendor/product traceability:

`Vendor -> Vendor Product Mapping -> Product -> Brand/Company`

When stock tracking is enabled:

`Stock Location -> Stock Movement -> Product -> Source Business Document`

## 11. Workflow acceptance tests

-   Create a vendor manually and through OCR review.
-   Map one vendor to multiple brands/products.
-   Map multiple vendors to the same product.
-   Search vendors and products using all required search fields.
-   Create a customer and multiple enquiries.
-   Create quotation version 1, issue it, then create version 2 without
    modifying version 1.
-   Approve a quotation and convert it to exactly one PI.
-   Record two partial payments and verify the outstanding balance.
-   Record two partial deliveries and verify pending quantity.
-   Confirm payment status does not automatically determine delivery
    status.
-   Verify permissions and audit logs for each critical action.
------------------------------------------------------------------------

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
------------------------------------------------------------------------

# Kenzo Infosystems ERP

## Data Flow Diagrams (DFD)

**Version:** Draft v1.0

------------------------------------------------------------------------

## 1. System context diagram -- Level 0

``` mermaid
flowchart LR
    V[Vendor Manager]
    S[Sales User]
    A[Accounts User]
    D[Delivery User]
    ADM[Administrator]
    ERP((Kenzo Infosystems ERP System))
    OCR[OCR Provider]
    EMAIL[Email Provider]
    STORE[(Private Document Storage)]

    V -->|Vendor and product mapping data| ERP
    S -->|Customer, enquiry and quotation data| ERP
    A -->|Invoice and payment data| ERP
    D -->|Dispatch and delivery data| ERP
    ADM -->|Users, roles and configuration| ERP
    ERP -->|Extracted fields/status| V
    ERP -->|Quotation, PI and enquiry status| S
    ERP -->|Receivables and payment status| A
    ERP -->|Delivery status| D
    ERP -->|Reports and audit data| ADM
    ERP <-->|Document for extraction / extracted data| OCR
    ERP <-->|Email request / delivery status| EMAIL
    ERP <-->|Upload and download documents| STORE
```

## 2. Level 1 -- Main business processes

``` mermaid
flowchart TB
    U[Authorized Users]
    P1((1.0 Manage Vendors))
    P2((2.0 Manage Products and Inventory))
    P3((3.0 Manage Customers and Enquiries))
    P4((4.0 Manage Quotations))
    P5((5.0 Manage Proforma Invoices))
    P6((6.0 Manage Payments))
    P7((7.0 Manage Deliveries))
    P8((8.0 Reports and Audit))

    D1[(Vendor and Mapping Data)]
    D2[(Product and Stock Data)]
    D3[(Customer and Enquiry Data)]
    D4[(Quotation Data)]
    D5[(Invoice Data)]
    D6[(Payment Data)]
    D7[(Delivery Data)]
    D8[(Documents and Audit Data)]

    U --> P1 --> D1
    U --> P2 --> D2
    U --> P3 --> D3
    D3 --> P4
    D2 --> P4
    P4 --> D4
    D4 --> P5
    P5 --> D5
    D5 --> P6
    P6 --> D6
    D5 --> P7
    D7 --> P7
    P7 --> D7
    D1 --> P8
    D2 --> P8
    D3 --> P8
    D4 --> P8
    D5 --> P8
    D6 --> P8
    D7 --> P8
    P1 --> D8
    P4 --> D8
    P5 --> D8
    P6 --> D8
    P7 --> D8
    P8 --> U
```

## 3. Level 2 -- OCR vendor onboarding data flow

``` mermaid
flowchart TD
    A[User uploads vendor document] --> B[Next.js upload screen]
    B --> C[NestJS file validation]
    C --> D[Private object storage]
    C --> E[OCR processing record]
    E --> F[OCR job queue or provider call]
    F --> G[OCR provider]
    G --> H[Extracted raw result]
    H --> I[Normalize and map fields]
    I --> J[Review screen]
    J --> K{User confirms?}
    K -->|No| L[User edits or cancels]
    L --> J
    K -->|Yes| M[Backend validation and duplicate check]
    M --> N[(Vendor database)]
    N --> O[Vendor created]
```

The OCR provider output is untrusted. The backend must validate all
submitted values and enforce permissions before saving.

## 4. Level 2 -- Quotation to proforma invoice

``` mermaid
flowchart TD
    A[(Customer and Enquiry)] --> B[Create quotation draft]
    C[(Product Catalogue)] --> B
    B --> D[Calculate and validate totals]
    D --> E[Approval process]
    E --> F{Approved?}
    F -->|No| G[Return for changes or reject]
    G --> B
    F -->|Yes| H[Create immutable quotation version]
    H --> I[Generate PDF]
    I --> J[Store document]
    H --> K[Send email]
    K --> L[Record email result]
    H --> M[Customer approval recorded]
    M --> N[Convert to PI]
    N --> O[Create invoice and item snapshots]
    O --> P[(Proforma Invoice database)]
```

The actual customer-approval method must be confirmed. Internal approval
and customer approval are separate events.

## 5. Level 2 -- Payment data flow

``` mermaid
flowchart TD
    A[Accounts user opens invoice] --> B[Enter payment details]
    B --> C[Validate amount, mode and reference]
    C --> D[Check invoice and permission]
    D --> E[Database transaction]
    E --> F[(Payment record)]
    E --> G[(Payment allocation)]
    G --> H[Recalculate amount received]
    H --> I[Calculate outstanding]
    I --> J[Update derived payment status]
    J --> K[Generate receipt if requested]
    K --> L[Store receipt and audit event]
    J --> M[Display updated invoice]
```

Calculation:

`Amount Received = Sum of valid payment allocations`

`Outstanding = Invoice Total - Amount Received`

The business must define treatment of overpayments, refunds, reversals,
credit notes and currency conversion before implementation.

## 6. Level 2 -- Delivery data flow

``` mermaid
flowchart TD
    A[Delivery user selects invoice/order] --> B[Load ordered line items]
    B --> C[Enter dispatch quantities]
    C --> D[Validate against remaining quantity]
    D --> E{Valid?}
    E -->|No| F[Return validation error]
    E -->|Yes| G[Create delivery record]
    G --> H[Create delivery line items]
    H --> I[Recalculate cumulative delivered quantity]
    I --> J[Calculate pending quantity]
    J --> K[Update delivery status]
    K --> L[Store delivery documents]
    L --> M[Show delivery history]
```

## 7. Data ownership and source of truth

  Data                          System of record
  ----------------------------- -----------------------------------------
  User, role, permission        PostgreSQL
  Vendor                        PostgreSQL
  Brand/company                 PostgreSQL
  Product/model                 PostgreSQL
  Stock balance                 Derived from stock ledger if enabled
  Customer                      PostgreSQL
  Enquiry                       PostgreSQL
  Quotation and versions        PostgreSQL
  PI and invoice snapshots      PostgreSQL
  Payments and allocations      PostgreSQL
  Delivery and delivery items   PostgreSQL
  File binary                   Private object storage
  File metadata and links       PostgreSQL
  OCR raw/normalized result     PostgreSQL and/or secure object storage
  Email delivery result         PostgreSQL
  Audit event                   PostgreSQL or approved audit store

## 8. Data-flow controls

-   Authenticate and authorize every protected request.
-   Validate data at the API boundary.
-   Use server-side business calculations.
-   Use transactions for related database writes.
-   Use idempotency for retryable financial/document operations.
-   Keep document storage private.
-   Record actor, action, timestamp and affected record for important
    changes.
-   Do not treat OCR output, uploaded files or email content as trusted
    instructions or verified business data.
------------------------------------------------------------------------

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
