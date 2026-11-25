# Payment Due Alerts

## What it does

- Admins set the payment due date on each invoice. Drafts use the invoice form. Issued invoices use **Change** on the invoice page (`PATCH /final-invoices/:id/due-date`, permission `invoice.update`). Every change is audited (`final_invoice.due_date_change`).
- An invoice raises an alert **five days before** its due date while any balance is outstanding (*Due in N days*), on the due date (*Due today*), and **every day after** until the balance is paid (*Overdue by N days*).
- Partial payments reduce the outstanding balance, which the existing payment verification already maintains (`amountReceived`, `paymentState`). A verified full payment clears the alert on the next read.
- Changing a due date recalculates the alert immediately, because the alert is computed from the stored date.
- Alerts appear in the **header bell** (every page, count badge, red when any is overdue) and in a **dashboard card** (overdue, due today, due in five days, total still outstanding, and the ten most urgent rows).

## Design

| Concern | How it is handled |
|---|---|
| Shown alert | Computed on each read from the invoice's due date, grand total, amount received and payment state (`payment-alerts.service.ts`, `openAlerts`). It is never read from a stored row, so it cannot be stale. |
| Rules | Pure functions in `payment-alert.rules.ts` (`classifyPaymentAlert`, `assertDueDateChangeAllowed`). No clock or database inside, so they are unit-tested directly. |
| History and duplicates | `PaymentReminder` rows record each stage per invoice and due date. A unique key on (invoice, due date, stage) and `skipDuplicates` ensure a stage is recorded once, even with several API instances or repeated sweeps. |
| Background sweep | `PaymentAlertScheduler` runs a sweep 30 seconds after start and hourly. It never overlaps itself, logs failures, and can be disabled with `PAYMENT_ALERTS_ENABLED=false`. |
| Logged out | Alerts are recorded by the server, not the browser. The sweep runs without any user session. |
| External trigger | `POST /payment-alerts/cron`, with the header `x-alert-token`, for an external scheduler. It is disabled unless `PAYMENT_ALERT_CRON_TOKEN` is set (at least 16 characters). The token is compared in constant time. |
| Permissions | Viewing alerts: `invoice.read`. Changing a due date: `invoice.update`. Manual sweep: `settings.manage`. |

## Scope and rules

- Only **issued and sent** invoices raise alerts. Drafts, approvals and cancelled invoices never do.
- Clearing a due date stops that invoice's alerts.
- A due date cannot be before the invoice date.
- Customer-level default due dates were **not** added. The due date is per invoice, which is what the alerts use.
- Alerts are **in-app only**. No email or push notifications.
- No read/dismiss state is tracked. An alert stays until the invoice is paid, as requested.

## Database change (not yet applied)

Migration folder: `database/prisma/migrations/20261130090000_payment_reminders/`. It is **additive only**: one enum, one table, one unique index and one foreign key. No existing table or row changes.

It was generated from a schema diff offline and has **not** been applied to the shared database. Applying it needs your approval, as it is a production schema change.

- Until it is applied, the **alert list, bell and dashboard work**, because they read existing columns only.
- The **sweep fails** as soon as there is an alert to record, because it writes to `PaymentReminder`. The failure is logged each hour and nothing else breaks. A sweep with no open alerts writes nothing, so it still succeeds.

To apply after approval: `npx prisma migrate deploy --schema database/prisma/schema.prisma` from the repository root.

## Configuration

| Variable | Purpose |
|---|---|
| `PAYMENT_ALERTS_ENABLED` | Set to `false` to turn off the in-process sweep. Default on. |
| `PAYMENT_ALERT_CRON_TOKEN` | Enables `POST /payment-alerts/cron`. Use a random value of 16+ characters. |

**Hosting caveat:** the in-process timer runs only while the API process is awake. On a host that sleeps when idle (a free Render instance does), configure an external scheduler to call `POST /api/v1/payment-alerts/cron` daily with the token. The sweep is idempotent, so extra calls are harmless.

## Tests

| Test | Result |
|---|---|
| Rules: 6 days out (none), 5 days (due soon), 1–4 days, due today, overdue (1 day, 90 days), partly paid still overdue, paid (none), zero balance (none), no due date (none), changed date recalculates, month boundary | Pass |
| Due-date edit rules: issued and sent allowed, clearing allowed, drafts / approval / cancelled refused, date before invoice date refused | Pass |
| Service with a mocked database: partial payment shows remaining balance and days overdue, cleared invoice is dropped, due-soon and due-today counts, repeated sweeps record nothing new (`skipDuplicates`), no write when nothing is open, a changed due date gives a new stage | Pass |
| Full API suite | 211 / 211 pass |
| API and web TypeScript | Pass |
| API and web production builds | Pass |
| Live: anonymous `GET /payment-alerts` | 401 |
| Live: admin `GET /payment-alerts` | 200, empty (no invoices are due in the window in this database) |
| Live: admin sweep, no open alerts | 200, `{evaluated: 0, recorded: 0}` |
| Live: cron endpoint without a configured token | 404 |
| Live: due-date change, unknown invoice / missing field / bad format / anonymous | 404 / 400 / 400 / 401 |
| Browser: bell present with the correct label, panel opens with its empty state, closes on Escape, dashboard card renders, no page errors | Pass |

## Not verified

- **Real alert scenarios on real invoices** (due-soon, due-today, overdue, partial payment, full payment clearing an alert, changing a date and seeing the alert move). The shared database has no issued invoices with due dates, and creating test invoices would write to it. The logic is covered by the unit tests above, but these flows need a test database to confirm end to end.
- **The reminder history writes** (the database insert and the duplicate guard against a real table). Blocked until the migration is applied.
- The external cron call with a real token (only the refusal paths were tested).

## Manual steps

1. Approve and apply the migration (above).
2. Set `PAYMENT_ALERT_CRON_TOKEN` in the API host and point a daily external scheduler at the cron endpoint, if the host sleeps.
3. Run the real-invoice scenarios on a test database before relying on the alerts.
