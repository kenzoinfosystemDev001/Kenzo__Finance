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
