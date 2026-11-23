# Kenzo Infosystems ERP: Workflow and Test Guide

This guide walks through every business workflow in the application, step by
step, with the test cases you can run to confirm each one works. Every rule in
it was taken from the application code (services, status transitions and
validation messages), so a failing check points at a real difference between
the code and the behaviour you see.

Use it on the **test environment only** (see section 9). Never run these tests
against the production database.

---

## 1. How to use this guide

1. Set up the test environment (section 21).
2. Sign in as the administrator (section 4).
3. Work through the modules in the order given in section 3. Later steps depend
   on records created earlier.
4. For each step, compare what you see with the **Expected** line. Mark each
   test case as Pass or Fail in the sign-off table (section 11).
5. Record any failure with the page, the steps taken, and the error message.

Test IDs (for example `WF-QUO-04`) identify each case so results can be
reported and re-run.

---

## 2. Roles and access

| Role | What it can do |
|---|---|
| Administrator (SUPER_ADMIN, or any user with `settings.manage`) | Everything, including Appearance, Settings, the Admin Console and branding. |
| Restricted user (for example a sales executive) | Only the permissions granted in their role. Admin-only actions return **403**. |
| Anonymous (signed out) | Protected data returns **401**. The sign-in page is the only public page. |

The application is designed for a **single administrator account**. The
"Users & Roles" entry is not in the navigation. The user pages still exist in
the code; the open decision is recorded in section 23.

**Permission checks happen twice:** the page hides actions the user cannot
perform, and the API refuses the request if the user tries anyway. Both must be
tested (WF-SEC-01 to WF-SEC-03).

---

## 3. The end-to-end business lifecycle

```
Vendor & product setup ─┐
                        ├─► Customer ─► Enquiry ─► Quotation ─► Accepted?
Brands & products ──────┘                              │ (no: stop, follow up)
                                                       ▼ yes
                                 Proforma invoice (PI) ─► Final invoice ─► Payment(s)
                                                       │                 │
                                                       ▼                 ▼
                                                  Delivery(ies)    Payment due alerts,
                                                                    sales reports
```

Stage order for testing (section numbers): 4 Sign-in, 5 Appearance, 6 Brands and
products, 7 Vendors, 8 Customers, 9 Enquiries, 10 Quotations (and 10a Email),
11 Proforma invoices, 12 Final invoices, 13 Payments, 14 Payment due alerts,
15 Deliveries, 16 Reports and sales history, 17 Rankings, 18 Admin console,
19 Settings, documents and audit, 20 Security and cross-checks.

Vendors and products can be set up at any time before quotations need them.

---

## 4. Sign-in and session

**Steps**

1. Open the application address (the sign-in page). Enter the administrator
   email and password, then select **Sign In**.
2. Confirm you land on the dashboard.
3. Select the account menu at the top right, then **Sign out**.
4. Try to open a protected page (for example `/vendors`) while signed out.

**Expected**

- A valid sign-in opens the dashboard. An invalid one shows a message and stays
  on the sign-in page.
- Sign-out returns to the sign-in page.
- A protected page opened while signed out redirects to sign-in.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-AUTH-01 | Sign in with correct details | Dashboard opens |
| WF-AUTH-02 | Sign in with a wrong password | Error message, no data shown |
| WF-AUTH-03 | Sign out, then open `/vendors` | Redirect to sign-in |
| WF-AUTH-04 | Account menu: open, use arrow keys, press Escape | Focus moves into the menu, Escape closes it and returns focus to the trigger |

---

## 5. Appearance (sign-in page, sidebar and workspace backgrounds)

**Who:** administrators only (`settings.manage`). A restricted user sees "Access
denied".

**Steps**

1. Open **Appearance** from the sidebar.
2. In **Main workspace background**, select **Upload image** and choose a PNG,
   JPEG or WEBP file under 5 MB.
3. Check the preview. Nothing is saved yet. Select **Apply image**.
4. Confirm the badge changes to **Custom** and the image shows in the workspace.
5. Select **Replace image** and apply a different image. The old file is kept
   for the audit history, not deleted.
6. Select **Restore default** and confirm. The default colour returns at once.
7. In **Administrator contact**, enter an email address, select **Save**. Then
   **Edit address** and **Clear** to remove it.

**Business rules (from code)**

- Accepted types: PNG, JPEG, WEBP. The type is checked from the file contents,
  not the file name. Maximum 5 MB.
- An image is saved only after the server accepts it.
- The support email must be a valid address. Clearing it hides the link on the
  sign-in page.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-APP-01 | Upload a valid JPEG to the workspace | Custom badge, image visible |
| WF-APP-02 | Upload a text file renamed to `.png` | Refused, nothing changes |
| WF-APP-03 | Upload a file over 5 MB | Refused with a size message |
| WF-APP-04 | Restore default | Default colour shown, previous file kept in audit |
| WF-APP-05 | Support email `not-an-email` | Inline "Enter a valid email address." |
| WF-APP-06 | Save, then Clear the support email | Saved address shown, then "Not set" |
| WF-APP-07 | Restricted user opens `/appearance` | "Access denied" |

---

## 6. Brands and products

**Steps**

1. **Brands:** open **Product Management > Brands**. Select **Add brand**, enter
   a name and short code, save.
2. **Categories:** open **Product categories**, add a category.
3. **Products:** open **Product Management > Add product**. Choose the brand,
   enter the product name, code and model details, save.
4. Open the product and confirm the details.
5. Open **All products** and search for the product by name and by model number.

**Business rules**

- A product needs a brand (the create request is refused without a brand).
- A brand or category that is in use cannot be deleted; the message says what
  uses it.
- Products appear in the catalogue search used by quotations and invoices.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-PRD-01 | Create a brand | Appears in the brand list |
| WF-PRD-02 | Create a product without a brand | Validation message, not saved |
| WF-PRD-03 | Create a product with a brand and model | Appears in the list and in search |
| WF-PRD-04 | Search by model number | The product is found |
| WF-PRD-05 | Delete a brand used by a product | Refused, message names the use |

---

## 7. Vendors

**Steps**

1. Open **Vendor Management > Add vendor**. Enter the business name, a contact
   with a name and phone or email, and an address. Save.
2. Open the saved vendor. Add a second contact and an address, then edit the
   business name. Confirm the change after a page reload.
3. Map the vendor to brands and products (vendor profile).
4. Open **Import with OCR**, upload a visiting card or document, review the
   extracted fields, correct them, then save.
5. Open **All vendors**, filter, then **Export** as CSV and as Excel (`.xlsx`).
6. Try to delete a vendor that is in use.

**Business rules**

- A new vendor opens with no empty contact or address rows. The name is the only
  required field at creation (per the on-screen text).
- OCR never creates a vendor without the user confirming the fields.
- A vendor in use cannot be deleted; deactivation keeps history.
- Export follows the current filters. Excel files are named
  `Vendors_<date>.xlsx`. A result over 20,000 rows is refused with a message to
  narrow the filters.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-VEN-01 | Open the add form | All fields blank |
| WF-VEN-02 | Submit with only a name | Saved; no empty-row validation errors |
| WF-VEN-03 | Edit the name, reload | New name persists |
| WF-VEN-04 | OCR upload, review, save | Vendor saved only after confirmation |
| WF-VEN-05 | Export Excel with a search filter | File named `Vendors_<date>.xlsx`, only matching rows, frozen header row |
| WF-VEN-06 | Delete a vendor used by a product | Refused with a message |

---

## 8. Customers

**Steps**

1. Open **Customer Management > Add customer**. Choose the type (Business or
   Individual), enter the name, select a category, add a contact with a phone or
   email, and an address. Save.
2. Open the customer. Confirm the code was assigned automatically.
3. Mark the customer as a **favourite** (administrator action).
4. Open **Top customers** and **Favourite customers** views.
5. Export the customer list as Excel and CSV.
6. Try to delete a customer that has invoices.

**Business rules**

- Customer type is required: submitting without one shows "Select a customer
  type."
- At least one contact method (phone or email) is required by the API.
- Duplicate detection refuses a customer that matches an existing one.
- Deletion is refused while the customer has invoices or other records.
- Rankings are computed from issued and sent final invoices.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-CUS-01 | Submit the add form empty | "Select a customer type." and other required messages |
| WF-CUS-02 | Save a valid customer | Code assigned, record visible |
| WF-CUS-03 | Save a second customer with the same name | Duplicate warning |
| WF-CUS-04 | Top customers view | Ranked by invoiced amount |
| WF-CUS-05 | Delete a customer with invoices | Refused |
| WF-CUS-06 | Export Excel | `Customers_<date>.xlsx`, all matching rows, no 5,000-row cut-off |

---

## 9. Enquiries

**Statuses:** NEW, ASSIGNED, IN_PROGRESS, FOLLOW_UP_PENDING,
REQUIREMENT_CLARIFICATION, READY_FOR_QUOTATION, CONVERTED, ON_HOLD, LOST, CLOSED.

**Steps**

1. Open **Enquiry Management > Add enquiry**. Choose the customer, enter the
   requirement. Save. The status is NEW.
2. Assign the enquiry to a user. Status becomes ASSIGNED.
3. Log a follow-up for an interaction that already happened. To plan the next
   contact, set a future next follow-up date.
4. Mark the enquiry READY_FOR_QUOTATION.
5. Use **Convert to quotation**. The enquiry becomes CONVERTED and a quotation
   opens from it.

**Business rules**

- An enquiry converts into at most one quotation.
- A follow-up records something that already happened; a future date is refused
  for a log entry.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-ENQ-01 | Create an enquiry | Status NEW |
| WF-ENQ-02 | Assign it | Status ASSIGNED, assignee shown |
| WF-ENQ-03 | Log a follow-up with a future date | Refused |
| WF-ENQ-04 | Convert a READY_FOR_QUOTATION enquiry | Quotation created, enquiry CONVERTED |
| WF-ENQ-05 | Convert the same enquiry again | Refused (already converted) |

---

## 10. Quotations

**Lifecycle (current revision):**

```
DRAFT ─submit─► PENDING_APPROVAL ─approve─► APPROVED ─send─► SENT
  │                  └─send back─► DRAFT          │
  └─────────── send (approval off) ──────────────►┘
SENT ─► UNDER_NEGOTIATION | ACCEPTED | REJECTED | EXPIRED | CANCELLED
UNDER_NEGOTIATION ─► ACCEPTED | REJECTED | EXPIRED | CANCELLED
Any open status ─► CANCELLED.  ACCEPTED and CANCELLED are final.
```

Older revisions become SUPERSEDED and are never changed.

**Steps**

1. Open **Quotation Management > New quotation** (from an enquiry, or manually
   if the user has manual-create rights).
2. Choose the customer, add product lines with quantity, price, discount and tax
   rate. Totals calculate on screen and on the server.
3. Add validity date, terms, payment and delivery terms. Save as draft.
4. If approval is enabled, submit for approval, then approve. Otherwise go
   straight to **Send**.
5. Mark the revision **Sent**. This **issues** the revision: it becomes
   immutable and its PDF is stored.
6. Download the PDF (**Documents** tab). Check the figures match the screen.
7. Create a **new revision** from the SENT quotation (changes after sending are
   new revisions, never edits).
8. Mark the quotation **Accepted** on the revision the customer accepted.
9. Open the **Emails** tab and the **Email** action on an issued revision
   (section 10a).

**Business rules**

- Only the current revision can be edited while it is a draft.
- An issued revision cannot be changed.
- A quotation that is ACCEPTED cannot be revised.
- Changes that reject or cancel need remarks.
- The customer snapshot on a revision is frozen when issued, so later customer
  edits do not change an issued quotation.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-QUO-01 | Add a line with quantity 2 at 1,000, tax 18% | Subtotal 2,000, tax 360, total 2,360 |
| WF-QUO-02 | Save a draft and reload | Values persist |
| WF-QUO-03 | Mark Sent | Status SENT, PDF appears in Documents |
| WF-QUO-04 | Download the PDF | File named `Quotation-<number>-R1.pdf`, same totals as screen, multi-page content not cut |
| WF-QUO-05 | Edit the customer after issuing | The issued PDF still shows the old customer details |
| WF-QUO-06 | Create a new revision from SENT | Revision 2 is a draft; revision 1 and its PDF stay unchanged |
| WF-QUO-07 | Mark a revision Accepted | Status ACCEPTED, revision becomes the accepted revision |
| WF-QUO-08 | Revise an ACCEPTED quotation | Refused |
| WF-QUO-09 | Reject without remarks | Refused: remarks required |

### 10a. Emailing a quotation (new)

**Who:** users with `quotation.send`. Recipient records need `customer.read` or
`vendor.read` as well.

**Steps**

1. Open an issued quotation, **Documents** tab. Select **Email** on the revision.
2. Choose **Customer** or **Vendor**. Search for the record and select it. The
   saved address appears; if none exists, type one.
3. Edit the recipient address if needed (this affects only this email). Add up to
   five CC addresses. Optionally add a personal message (max 1,000 characters).
4. Select **Send email**. Wait for the result.
5. Open the **Emails** tab to see the history.

**Business rules**

- Only issued revisions can be emailed. Drafts are refused.
- The sender is the administrator address (`SMTP_FROM`, default
  `jitender.saini@kenzoinfosystem.com`). Credentials come only from environment
  variables.
- A missing SMTP setting returns an error and writes no history row.
- Success is shown only when the mail server accepts the message. The app does
  not confirm delivery to the inbox.
- The attachment is the stored PDF of that revision, the same file as the
  download.
- The same send key never sends twice, so a double-click cannot send two emails.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-EML-01 | Send to a customer with a saved address | Result "Accepted by the mail server"; one email received with the PDF |
| WF-EML-02 | Send to a vendor | Recorded with recipient type VENDOR |
| WF-EML-03 | Enter `not-an-email` as recipient | Refused, nothing sent |
| WF-EML-04 | Add six CC addresses | Refused (maximum five) |
| WF-EML-05 | Double-click Send | One email only |
| WF-EML-06 | Send with SMTP settings missing | Error naming the missing settings; no history row |
| WF-EML-07 | Send with an unreachable mail server | History row "Failed" with a safe message |
| WF-EML-08 | Compare attachment with the download | Byte-identical |
| WF-EML-09 | Open the Emails tab | Every attempt listed, newest first, with status and sender |
| WF-EML-10 | Email a draft revision | Refused |

---

## 11. Proforma invoices (PI)

**Rule:** a PI is raised from the **accepted revision** of a quotation. It keeps
the accepted figures; only PI-specific details (due date, advance) can differ.
Only one live PI can exist per quotation.

**Statuses:** DRAFT, PENDING_APPROVAL, APPROVED, ISSUED, SENT, CANCELLED.

**Steps**

1. Open **Proforma Invoice > New proforma invoice**. Select an accepted
   quotation.
2. Enter the PI date and optional due date and advance. Save as draft.
3. If approval is enabled, submit and approve. Then **Issue** the PI.
4. Mark it **Sent**. Download the PDF.
5. To correct an issued PI, cancel it with a reason and raise a replacement.

**Business rules**

- Due date cannot be before the PI date.
- Advance cannot exceed the grand total.
- Issuing requires the quotation to still be ACCEPTED.
- An issued PI cannot be edited; cancel and replace it instead.
- Cancelling is refused while a final invoice exists for it.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-PI-01 | Create a PI from an accepted quotation | Totals equal the accepted revision |
| WF-PI-02 | Create a second live PI for the same quotation | Refused, names the existing PI |
| WF-PI-03 | Due date before PI date | Refused |
| WF-PI-04 | Advance greater than total | Refused |
| WF-PI-05 | Issue, then edit | Edit refused |
| WF-PI-06 | Cancel without a reason | Refused |
| WF-PI-07 | Download PDF | `Proforma-Invoice_<number>.pdf`, totals match quotation |

---

## 12. Final invoices

**Rule:** a final invoice is raised from an **issued** proforma invoice. One
final invoice per PI.

**Statuses:** DRAFT, PENDING_APPROVAL, APPROVED, ISSUED, SENT, CANCELLED.

**Steps**

1. Open **Final Invoice > New final invoice**. Pick an issued PI.
2. Enter the invoice date and due date. Save as draft.
3. Approve if approval is enabled, then **Issue** the invoice.
4. Mark it **Sent** and download the PDF (**Preview / Print** opens it in a
   new tab).
5. Record payments (section 13). Check the outstanding balance on the invoice.

**Business rules**

- Due date cannot be before the invoice date.
- Issued invoices are never changed; cancel and raise a replacement.
- Cancelling is refused while the invoice has verified or pending payments
  ("Reverse or reject them in Payment Management before cancelling").
- Only ISSUED and SENT invoices count as sales.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-FI-01 | Create from an issued PI | Totals equal the PI |
| WF-FI-02 | Create a second invoice for the same PI | Refused |
| WF-FI-03 | Issue, then edit | Edit refused |
| WF-FI-04 | Cancel with live payments | Refused, names the payment count |
| WF-FI-05 | Download PDF and Preview/Print | `Final-Invoice_<number>.pdf`; Print opens a print view |

---

## 13. Payments

**Statuses:** PENDING_VERIFICATION, VERIFIED, REJECTED, REVERSED.

**Steps**

1. Open **Payment Management > Record payment**. Choose the customer, then the
   issued final invoice.
2. Enter amount, payment date, method and reference. Save. It starts as
   PENDING_VERIFICATION (unless the method is on the auto-verify list).
3. Verify the payment. The verified total updates the invoice balance.
4. Record a second, partial payment, then the balance. When the verified total
   reaches the invoice total, the invoice shows **Paid**. (This is derived from
   the payments, not a stored invoice status.)
5. Reverse or reject a payment to see the balance change back.

**Business rules**

- Amount must be greater than zero.
- Payment date cannot be in the future.
- Payments can only be recorded against issued invoices.
- Payment currency must equal the invoice currency; currency conversion is not
  supported.
- A verified payment can be reversed, not edited. Pending payments can be edited.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-PAY-01 | Record a payment against a draft invoice | Refused |
| WF-PAY-02 | Amount 0 | Refused |
| WF-PAY-03 | Payment dated tomorrow | Refused |
| WF-PAY-04 | Partial payment of 1,000 on an invoice of 4,900 | Outstanding 3,900 after verification |
| WF-PAY-05 | Pay the balance | Invoice shows Paid |
| WF-PAY-06 | Reverse a verified payment | Balance goes back up |

**Test data used in the test report:** a 1,000 part-payment on an invoice gave
a remaining balance of 4,900 on a 5,900 invoice; these figures are examples
for the test database only.

---

## 14. Payment due alerts

**What it does:** lists invoices that are due within **five days**, due
**today**, or **overdue**, and clears an alert when the invoice is fully paid.

**Where:** the dashboard alert panel, the bell at the top of the page, and the
Final invoice page filter "Overdue invoices".

**Steps**

1. Create an issued final invoice with a due date **20 days ago** (the due date
   cannot be before the invoice date, so set the invoice date earlier too).
2. Check the dashboard and the bell: an overdue alert with the outstanding
   amount and days overdue.
3. Change the due date to 3 days from today. The alert becomes "due soon".
4. Clear the due date. The alert goes.
5. Record a full payment. The alert clears.

**Automatic sweep:** runs hourly in the API. The cron endpoint
(`POST /payment-alerts/cron`) requires the `x-alert-token` header and the
server's `PAYMENT_ALERT_CRON_TOKEN`.

**Known limitation:** the sweep stores its history in a table from a migration
that is **not applied yet** (see `docs/MIGRATION_REVIEW.md`). Until it
is approved, the sweep returns an error when an open alert exists. The alert
list itself works.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-ALR-01 | Overdue invoice | Overdue alert with remaining balance |
| WF-ALR-02 | Due date moved to 3 days ahead | Due soon |
| WF-ALR-03 | Clear the due date | Alert removed |
| WF-ALR-04 | Full payment | Alert removed |
| WF-ALR-05 | Cron endpoint with a wrong token | Refused |

---

## 15. Deliveries

**Rule:** a delivery ships goods from an **issued** final invoice. Deliveries
never change invoice amounts or payments.

**Statuses:** DRAFT, SCHEDULED, READY_FOR_DISPATCH, DISPATCHED, IN_TRANSIT,
PARTIALLY_DELIVERED, DELIVERED, DELIVERY_FAILED, RETURNED, CANCELLED.

**Steps**

1. Open **Delivery Management > New delivery**. Pick an issued final invoice.
2. Choose the items and quantities. Each quantity cannot exceed what is still
   deliverable.
3. Save as draft, schedule, mark ready for dispatch, dispatch, then in transit.
4. Record the delivery outcome: delivered, partially delivered, failed or
   returned.
5. For a returned delivery, create a **redelivery** (it must refer to the same
   invoice).
6. Download the packing list and the delivery challan PDFs.

**Business rules**

- Each invoice item appears once per delivery.
- A delivery cannot be edited once it has issued documents.
- Packages can only change before dispatch.
- Only a RETURNED delivery can be redelivered.
- Expected delivery date cannot be before the delivery date.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-DEL-01 | Delivery for a draft invoice | Refused |
| WF-DEL-02 | Quantity above the remaining amount | Refused, shows the remaining quantity |
| WF-DEL-03 | Full delivery, then check the invoice | Invoice totals and payments unchanged |
| WF-DEL-04 | Partial delivery, then a second delivery for the rest | Remaining quantity updates |
| WF-DEL-05 | Redeliver a non-returned delivery | Refused |
| WF-DEL-06 | Download packing list and challan | PDFs open and show the delivery items |

---

## 16. Reports, analytics and sales history

**Sales definition:** issued and sent **final invoices** only. Cancelled and
replaced invoices are excluded. Quotations and proforma invoices are never
counted as sales.

**Where:** Reports & Analytics (overview, sales, customers, vendors, products,
enquiries, quotations, proforma, invoices, payments, deliveries, insights) and
**Sales History** (Latest sales, Oldest sales, product-wise and customer-wise
views, top sellers, product comparison and monthly summary).

**Steps**

1. Note the grand total of a final invoice (section 12).
2. Open **Sales History** with period **All time** and view **Latest sales**.
   Confirm the invoice's product lines are listed with the right quantity and
   amount.
3. Set a custom date range that includes the invoice date. Confirm it appears;
   set a range that excludes it and confirm it disappears.
4. Search by product name, customer name and invoice number.
5. Use **View** or **Download PDF** on a row.
6. Export Excel, PDF and CSV. Open each file and compare totals with the screen.
7. Cancel the invoice (section 12) and confirm it no longer counts.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-RPT-01 | Latest sales shows the new invoice's lines | Quantity and amount match the invoice |
| WF-RPT-02 | Custom range excluding the invoice date | Invoice not listed |
| WF-RPT-03 | Search by invoice number | Only matching rows |
| WF-RPT-04 | Excel, PDF and CSV export | Files download, totals match the screen |
| WF-RPT-05 | Cancel the invoice | Sales totals drop by its amount |
| WF-RPT-06 | Quotation without invoice | Does not appear in sales |

---

## 17. Customer rankings and favourites

**Steps**

1. Open **Customers** and switch between the **All**, **Top** and **Favourite**
   views.
2. Sort by invoiced amount, purchases or orders.
3. Mark a customer favourite (administrator). Confirm it appears in the Favourite
   view.

**Known limitation:** the favourite flag needs a migration that is **not applied
yet**. Until approval, marking a favourite shows "not yet available".

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-RNK-01 | Top view sorted by invoiced amount | Highest first |
| WF-RNK-02 | Favourite view | Only favourites |
| WF-RNK-03 | Mark favourite before approval | Clear "not yet available" message |

---

## 18. Admin console

**Steps**

1. Open **Admin Console**. Switch between **All modules**, **Manage customers**
   and **Manage vendors**.
2. In **All modules**, select a shortcut in each module card and confirm it
   opens the correct page.
3. In **Manage customers** and **Manage vendors**, search, edit and delete a
   record (delete is refused while the record is in use).

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-ADM-01 | Every module shortcut | Opens the page it names; none broken |
| WF-ADM-02 | Search in Manage vendors | Filtered list |
| WF-ADM-03 | Delete a vendor in use | Refused |

---

## 19. Settings, documents and audit log

- **Settings:** company profile (printed on PDFs), numbering and business
  switches. Company profile values appear on quotation and invoice PDFs.
- **Documents:** files attached to vendors, customers, products, enquiries,
  quotations, invoices, payments and deliveries. Type is checked from the file
  contents. Default maximum size is 10 MB.
- **Audit log:** every create, change, issue, cancel, download and email action
  records who did it, what changed and from which address. Passwords and tokens
  are never recorded.

**Test cases**

| ID | Action | Expected |
|---|---|---|
| WF-SET-01 | Change the company profile, download a quotation PDF | New company details appear |
| WF-DOC-01 | Upload a `.exe` renamed to `.pdf` | Refused |
| WF-AUD-01 | Issue a quotation, then open Activity | An entry shows who issued it and when |

---

## 20. Security and cross-checks

| ID | Action | Expected |
|---|---|---|
| WF-SEC-01 | As a restricted user, call an admin-only action (for example `/settings` writes) | 403 |
| WF-SEC-02 | Signed out, open `/api/v1/vendors` | 401 |
| WF-SEC-03 | Restricted user opens Appearance | Access denied |
| WF-SEC-04 | Search for a text containing a NUL character (`%00`) | 400 refusal, no server error |
| WF-SEC-05 | Search `' OR '1'='1` | Normal results; no data change |
| WF-SEC-06 | Name a vendor `<script>alert(1)</script>` | Stored as text, displayed as text |
| WF-X-01 | Quotation total = PI total = final invoice total (same customer and items) | Equal |
| WF-X-02 | Invoice paid in full | Sales, reports and alerts agree |
| WF-X-03 | Email a quotation, then check the quotation | Totals and status unchanged |

---

## 21. Test environment setup (test database only)

The application needs a **separate test database**. Do not point test runs at
the production database.

1. Start a local PostgreSQL test cluster on a port that is not production.
2. Set `DATABASE_URL` and `DIRECT_URL` to that test database only.
3. Apply the migrations to the test database, then seed it.
4. Start the API on port 4000 (or change `NEXT_PUBLIC_API_URL`) and the web app
   on port 3000 (or your chosen port).
5. For email tests, run a local SMTP test server and set `SMTP_HOST`,
   `SMTP_PORT` and `SMTP_SECURE=false`. Do not use a real mailbox for test
   sends unless you intend to.

Commands (from the repository root):

```
npm install
npm run api:build          # generates the Prisma client and builds the API
npm run api:test           # API unit tests (run if the script exists)
npm run web:build          # production build of the web app
```

Never commit credentials. The test administrator and any restricted test user
should use generated passwords kept outside the repository.

---

## 22. Sign-off checklist

Record each result as **Pass**, **Fail** or **Not run**, with a note.

| Area | Test IDs | Result | Tester | Date |
|---|---|---|---|---|
| Sign-in | WF-AUTH-01..04 | | | |
| Appearance | WF-APP-01..07 | | | |
| Brands and products | WF-PRD-01..05 | | | |
| Vendors | WF-VEN-01..06 | | | |
| Customers | WF-CUS-01..06 | | | |
| Enquiries | WF-ENQ-01..05 | | | |
| Quotations | WF-QUO-01..09 | | | |
| Quotation email | WF-EML-01..10 | | | |
| Proforma invoices | WF-PI-01..07 | | | |
| Final invoices | WF-FI-01..05 | | | |
| Payments | WF-PAY-01..06 | | | |
| Payment due alerts | WF-ALR-01..05 | | | |
| Deliveries | WF-DEL-01..06 | | | |
| Reports and sales history | WF-RPT-01..06 | | | |
| Rankings and favourites | WF-RNK-01..03 | | | |
| Admin console | WF-ADM-01..03 | | | |
| Settings, documents, audit | WF-SET-01, WF-DOC-01, WF-AUD-01 | | | |
| Security and cross-checks | WF-SEC-01..06, WF-X-01..03 | | | |

---

## 23. Known limitations (not bugs in the test, but expected gaps)

- **Two migrations are not applied** and need approval: the payment-reminder
  history (affects the due-alert sweep) and the customer favourites columns
  (affects favourite marking). Tests for these show the expected "not yet
  available" or sweep error.
- **Email delivery** needs a real SMTP provider and credentials. Tests so far
  used a local test server, so real delivery is not verified.
- **Stuck email rows:** if the server stops in the middle of a send, that row
  stays "Sending". It is not retried automatically.
- **Draft email refusal** (WF-EML-10) was not exercised end-to-end, because the
  test data had no draft quotation.
- **Selected-record export** is not available: exports follow the current
  filters.
- **Charts** for the sales comparison and monthly sections are not built.
- **Open decisions:** whether the `/users` pages should be blocked or removed
  for the single-administrator policy, and whether `GET /settings` should be
  limited to administrators.
- **Quotation status comment:** the code comment in the quotation rules still
  says the application does not email anything. This is out of date.
