# Modules 9 and 10 - Delivery Management, Reports & Analytics

How deliveries and the analytics reports work, how they connect to the other
modules, and which business decisions are still open.

## Module 9 - Delivery Management

### Rules

- A delivery is created against an **issued final invoice** (status `ISSUED`
  or `SENT`) of the same customer. Payment is **not** a precondition.
- Lines reference final invoice items. A line's quantity can never exceed the
  item's **remaining** quantity: invoiced minus quantity reserved by the
  invoice's other deliveries. Reservation counts every delivery except
  `CANCELLED` and `RETURNED`. Creates and edits run under a row lock on the
  invoice, so concurrent users cannot both take the last units.
- The delivery address is required. Edits (header, lines, packages) are
  allowed only before dispatch (`DRAFT`, `SCHEDULED`, `READY_FOR_DISPATCH`).
- **Dispatch** needs a dispatch date and transport mode. The identifying field
  of that mode is also required: courier company (`COURIER`), transporter name
  (`TRANSPORT`) or vehicle number (`OWN_VEHICLE`). Dispatch renders the
  delivery challan and the packing list **once** and stores them. Before
  dispatch, both PDFs are watermarked previews and are not stored.
- **Dispatched is not delivered.** Delivered quantities come only from
  confirmation: receiver name, actual delivery date, an explicit
  acknowledgment, and per-item delivered quantity (≤ the dispatched quantity).
  If every line is fully received the delivery becomes `DELIVERED`; otherwise
  it becomes `PARTIALLY_DELIVERED`.
- Proof of delivery is never overwritten. A correction creates a new record
  that `amends` the previous one and carries a reason.
- Tracking is **manual**: events are entered by users (`recordedById`). No
  carrier integration exists, and no tracking events are generated.
- A delivery can be cancelled (reason required) only before dispatch. A final
  invoice with a delivery that is not `CANCELLED` or `RETURNED` cannot be
  cancelled.
- Deliveries never change invoice amounts or payment figures.

### Lifecycle

```
DRAFT ─ schedule ─▶ SCHEDULED ─ ready ─▶ READY_FOR_DISPATCH ─ dispatch ─▶ DISPATCHED ─ track ─▶ IN_TRANSIT
                    (SCHEDULED can also dispatch directly; READY can go back to SCHEDULED)
DISPATCHED / IN_TRANSIT ─▶ DELIVERED | PARTIALLY_DELIVERED | DELIVERY_FAILED | RETURNED
DELIVERY_FAILED ─▶ SCHEDULED (re-attempt) | RETURNED
DRAFT / SCHEDULED / READY_FOR_DISPATCH ─ cancel (reason) ─▶ CANCELLED
```

Final states: `DELIVERED`, `PARTIALLY_DELIVERED`, `CANCELLED`, `RETURNED`. A
new delivery can record `redeliveryOfId` to point at a failed or returned one.
Every transition writes `delivery_status_history` and the audit log in the
same transaction.

### API (`/api/v1/deliveries`)

List, summary, reports, CSV export, eligible invoices, invoice items with
remaining quantities, invoice and customer history; create, edit, packages,
schedule, simple status changes, dispatch, tracking, failure, confirm, POD
amendment, cancel; challan / packing-list PDFs; document upload, download and
removal. Permissions use `delivery.*` codes (see
`backend/src/common/authz/permissions.ts`).

### Database (migration `20261128090000_delivery_hardening`)

This migration is additive. It adds dispatch, cancellation, failure, return
and redelivery fields to `deliveries`, and `deliveredQuantity` to
`delivery_items`. Proof of delivery becomes an amendment chain (one row per
version, so the unique index on `deliveryId` is dropped). Tracking events gain
`createdAt`, `provider` and `recordedById`. Migration
`20261129090000_analytics_permissions` seeds the `PACKING_LIST` number
sequence (`KI/PKG/`).

## Module 10 - Reports & Analytics

### Rules

- Read-only aggregation over the live business tables. No reporting copy of
  the data is kept, and nothing is cached or hardcoded.
- **Periods** are calendar days in `BUSINESS_TIMEZONE`, inclusive on both
  ends. Presets: today, yesterday, last 7 / 30 days, this month, previous
  month, this quarter, this year, custom (from/to), all. Comparisons use the
  preceding period of the same length.
- **Money is reported per currency**; amounts are never summed across
  currencies and no exchange rates are applied.
- Revenue (invoiced value) counts **issued final invoices only**. PI values
  are reported separately and are not revenue. A quotation counts once, at the
  total of its latest revision.
- Collections count **verified** payments only. Pending, rejected and reversed
  payments are excluded. Outstanding is issued invoice value minus verified
  payments as of the period end.
- Deliveries are reported as dispatched vs **confirmed delivered** quantities.
- Every report returns a `definitions` object that states how each figure is
  calculated. The UI and the exports show this same text.
- Exports (CSV, Excel, PDF) are generated from the same report object as the
  screen, so the figures always match.

### Permissions

`analytics.dashboard`, `analytics.<report>` (vendors, products, customers,
enquiries, quotations, proforma, invoices, payments, deliveries),
`analytics.export`, and `analytics.financial`. Without the financial
permission, money figures are withheld (returned as null) rather than shown
as zero.

Proposed default grants (editable): Admin / Super Admin get all. Accounts
Manager gets dashboard, customers, proforma, invoices, payments, deliveries,
export and financial. Sales Manager gets dashboard, customers, products,
vendors, enquiries, quotations, proforma and export. Delivery Manager gets
dashboard, deliveries and export.

## Open business decisions (confirm with the business)

1. Should a delivery be allowed before the invoice is paid (currently yes)?
   Should advance or full payment be a precondition for some customers?
2. Should a `DRAFT` delivery reserve quantity (currently yes, to prevent two
   drafts promising the same units)?
3. Should returned goods free quantity for redelivery (currently yes), or
   should a return require a credit note first? Credit notes are not
   implemented.
4. Are the required identifying fields per transport mode correct? Should an
   LR/GR number be mandatory for `TRANSPORT`?
5. Challan wording, a signature block, and whether an e-way bill number field
   is needed. No legal wording has been invented.
6. Who may confirm deliveries? Should the person who dispatched be barred from
   confirming (separation of duties)?
7. Analytics default role grants above, especially which roles see money
   figures.
8. Financial-year definition for reports (calendar year is used for "this
   year"; invoice numbering already uses the April-March financial year).
