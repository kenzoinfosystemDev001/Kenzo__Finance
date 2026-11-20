# Module 6 - Proforma Invoice Management

How proforma invoices (PIs) work, how they connect to the other modules, and
which business decisions are still open.

## Rules

- A PI is raised only from the **revision the customer accepted** of a
  quotation in status `ACCEPTED` (PRD 5.7 rule 5, 6.5).
- Customer details, line items (product/model references and catalogue
  snapshot), quantities, prices, discounts, tax and every total are **copied
  from that revision**. The PI never recalculates and never accepts amounts
  from the client: a commercial change needs a new quotation the customer
  accepts.
- **One live PI per accepted revision.** `proforma_invoices.activeRevisionId`
  is unique; repeated or concurrent conversions fail on it (HTTP 409 with the
  existing PI's id). Cancelling a PI clears the column, so a replacement can be
  raised; the replacement records `replacesId`.
- PI-specific details are editable **only while Draft**: PI date, payment due
  date, contact, assignee, subject, customer reference, advance amount, terms,
  payment instructions, bank details, internal remarks. Customer details follow
  the customer record while Draft and are frozen at issue.
- **Issuing** freezes the PI and renders the PDF once (`PROFORMA_PDF`
  document); every later download returns those bytes. Issued PIs are never
  edited or deleted - they can only be cancelled (reason required).
- A never-issued draft without attachments can be deleted.
- A PI is not a tax invoice and not proof of payment. There are **no payment
  statuses**: they will be derived from Payment records (Module 7).

## Lifecycle

```
DRAFT ── issue ──▶ ISSUED ── mark sent ──▶ SENT
  │ (approval on: DRAFT ── submit ──▶ PENDING_APPROVAL ── approve ──▶ APPROVED ── issue ──▶ ISSUED;
  │               PENDING_APPROVAL ── send back (remarks) ──▶ DRAFT)
any state except CANCELLED ── cancel (reason) ──▶ CANCELLED
```

Every change writes `proforma_invoice_status_history` and the audit log in the
same transaction, under a row lock.

## API (`/api/v1/proforma-invoices`)

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/` (search, status, customerId, quotationId, assignedToId, dateFrom/To, amountMin/Max, sortBy, page) | proforma.read |
| GET | `/summary`, `/assignees` | proforma.read |
| GET | `/export` (CSV, same filters) | proforma.export |
| GET / PUT | `/settings` (bank details, default payment instructions) | read: proforma.read or settings.manage; write: settings.manage |
| GET | `/eligible-quotations` | proforma.create |
| GET | `/from-quotation/:quotationId` (pre-fill, creates nothing) | proforma.create |
| POST | `/` | proforma.create |
| GET | `/:id`, `/:id/activity`, `/:id/payment-handoff` | proforma.read |
| PATCH | `/:id` (draft only) | proforma.update |
| POST | `/:id/status` | per step: submit, approve, issue, cancel |
| DELETE | `/:id` (never-issued draft) | proforma.delete |
| GET | `/:id/pdf` | proforma.download |
| POST / DELETE / GET | `/:id/documents[...]` | proforma.update / proforma.read + document.download |

The approval switch is the boolean setting `proforma.approvalRequired`
(`PATCH /settings`, Settings page). It is **off** by default.

## Integration points

- **Quotations (Module 5):** `quotationId` and `quotationRevisionId` are
  Restrict foreign keys; items keep `quotationItemId`. The quotation detail
  lists its PIs and `proforma-handoff` reports the live PI.
- **Customers / Products:** PIs are counted in the customer and product/model
  delete guards.
- **Payments (Module 7):** `GET /proforma-invoices/:id/payment-handoff` returns
  the PI id, customer, currency, grand total, advance, due date and whether the
  PI can receive payments (issued or sent). Payments should reference
  `proformaInvoiceId`; outstanding amount and payment status must be derived
  from payment records.

## Database (migration `20261124090000_proforma_invoices`)

Additive only: `ProformaStatus` enum; tables `proforma_invoices`,
`proforma_invoice_items`, `proforma_invoice_status_history`; nullable
`documents.proformaInvoiceId`; `DocumentKind` values `PROFORMA_PDF`,
`PROFORMA_ATTACHMENT`; sequence `PROFORMA_INVOICE` (`KI/PI/00001`); ten
`proforma.*` permissions with default grants (Super Admin, Admin and Accounts
Manager: all; Sales Manager: read, create, update, submit, download, export;
Sales Executive: read, download).

## Open business decisions (confirm with the finance team)

1. **PI numbering** follows the existing convention (`KI/PI/00001`, one running
   sequence). Indian businesses often number per financial year
   (e.g. `KI/PI/2026-27/0001`) - confirm the required format.
2. **One PI per accepted quotation.** Partial or split PIs (e.g. separate
   advance and balance PIs, or part quantities) are not supported - confirm
   whether they are needed.
3. **Replacement after cancellation** needs only `proforma.create`. Confirm
   whether cancelling an issued PI or raising a replacement needs approval.
4. **Approval policy** (off by default) and who may approve.
5. **Bank details** - enter the real account in Settings; nothing is assumed.
6. **Advance amount / due date** are free entries; no percentage or term is
   assumed.
7. **Wording** - whether the PDF must carry a statement such as "This is not a
   tax invoice", and any legally required fields.
8. **Additional (header) discount after tax** is inherited from quotations
   (pending decision in Module 5).
9. **Emailing PIs** is not implemented (the application sends no email);
   "Sent" records that someone gave the PI to the customer.
