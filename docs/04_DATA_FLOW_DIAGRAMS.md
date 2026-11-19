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
