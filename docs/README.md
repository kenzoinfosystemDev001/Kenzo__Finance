# Kenzo Infosystems ERP -- Project Documentation

This documentation pack contains the initial product and engineering
blueprint for the Kenzo Infosystems ERP and Business Management System.

## Documents

1.  [`01_PRD.md`](./01_PRD.md) -- Product Requirements Document
2.  [`02_WORKFLOW.md`](./02_WORKFLOW.md) -- Business workflows and
    process rules
3.  [`03_SYSTEM_ARCHITECTURE.md`](./03_SYSTEM_ARCHITECTURE.md) --
    Next.js, NestJS, PostgreSQL and integration architecture
4.  [`04_DATA_FLOW_DIAGRAMS.md`](./04_DATA_FLOW_DIAGRAMS.md) -- Context,
    Level 1 and Level 2 data flow diagrams
5.  [`05_REPOSITORY_STRUCTURE.md`](./05_REPOSITORY_STRUCTURE.md) --
    Monorepo and application folder structure
6.  [`06_DEPLOYMENT.md`](./06_DEPLOYMENT.md) -- Deploying to Vercel (web),
    Render (API) and Neon, with the full environment-variable matrix

## Implementation status

| Module | Status |
| --- | --- |
| Authentication, users, roles, permissions (RBAC) | Implemented |
| **Module 1 - Vendor Management** | **Implemented** |
| **Module 2 - Inventory Management** | **Implemented** (stock ledger, off by default) |
| Brands/companies, product catalogue (minimum for vendor mapping) | Implemented |
| Documents, OCR extraction + review, audit log, document numbering | Implemented |
| Settings (runtime business switches) | Implemented |
| Modules 3-5 - Customers, enquiries, quotations | Implemented |
| **Module 6 - Proforma Invoice** | **Implemented** ([07_PROFORMA_INVOICE.md](07_PROFORMA_INVOICE.md)) |
| Modules 7-8 - Payments, delivery | Not started |

Setup and run instructions are in the repository [README](../README.md).

## Current technology stack

-   Frontend: Next.js + TypeScript
-   Backend: NestJS + TypeScript
-   Database: PostgreSQL
-   ORM: Prisma
-   Monorepo: npm workspaces (pnpm/corepack is broken on the dev machine)
-   API: REST + Swagger/OpenAPI
-   Background jobs: Redis + BullMQ, when needed
-   Documents: private object storage
-   OCR: provider to be selected
-   Email: SMTP/transactional provider to be selected

## Important status

These documents are a **draft baseline**, not a signed-off final
specification. The following business decisions remain open and affect
database design:

1.  Catalogue-only inventory or physical stock quantity tracking?
2.  Does Kenzo Infosystems purchase from vendors and require purchase orders, vendor
    bills and goods receipt?
3.  One location, multiple branches, or multiple companies?
4.  Are warehouses, returns, warranties and customer credit rules
    required?
5.  What are the approved tax, numbering, approval and document
    policies?

Confirm these with Kenzo Infosystems stakeholders before finalizing the database
schema or building dependent workflows.

## Suggested review order

1.  Review and sign off the PRD.
2.  Resolve open business decisions.
3.  Validate the workflow diagrams with the actual business users.
4.  Approve the architecture and repository conventions.
5.  Design the detailed ERD and API contracts.
6.  Begin implementation module by module.
