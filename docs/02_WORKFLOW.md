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
