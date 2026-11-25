# Migration Review (for approval, not applied)

Status: **both migrations are unapplied and wait for your approval.** Neither has been run against the production (Neon) database, and neither has been run against the test database. This document describes exactly what each one does, so you can decide.

Both migrations are in `database/prisma/migrations/`. The files are reviewed below in full.

---

## Migration 1: `20261130090000_payment_reminders`

**Purpose:** history of payment due alerts. Each row records one alert stage (due soon, due today, overdue) raised for an issued invoice on a given due date. The alert shown to users is computed from invoice data, not from these rows. These rows are the audit and de-duplication record.

**SQL (complete):**

```sql
-- CreateEnum
CREATE TYPE "PaymentReminderStage" AS ENUM ('DUE_SOON', 'DUE_TODAY', 'OVERDUE');

-- CreateTable
CREATE TABLE "PaymentReminder" (
    "id" UUID NOT NULL,
    "finalInvoiceId" UUID NOT NULL,
    "dueDate" DATE NOT NULL,
    "stage" "PaymentReminderStage" NOT NULL,
    "daysRemaining" INTEGER NOT NULL,
    "outstandingAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentReminder_createdAt_idx" ON "PaymentReminder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_finalInvoiceId_dueDate_stage_key" ON "PaymentReminder"("finalInvoiceId", "dueDate", "stage");

-- AddForeignKey
ALTER TABLE "PaymentReminder" ADD CONSTRAINT "PaymentReminder_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

| Question | Answer |
|---|---|
| Database changes | Creates one enum type, one table, one index on `createdAt`, one unique index, one foreign key. |
| Tables affected | Creates `PaymentReminder`. Reads the existing `final_invoices` table through the foreign key only. |
| Columns / relationships | New table with `finalInvoiceId` referencing `final_invoices.id`. |
| Existing data modified or deleted? | **No.** No existing table, row or column is altered. |
| Risk to existing production data | **None to existing data.** The foreign key uses `ON DELETE RESTRICT`, so an issued invoice cannot be hard-deleted while it has reminder rows. Drafts never get reminders. The migration takes a brief lock only on the new table, which is empty. |
| Runtime effect once applied | The payment-alert sweep (hourly, and through `POST /payment-alerts/cron`) starts writing rows. Until applied, the sweep logs an error only when there is an open alert to record. The alert list, bell and dashboard do not use this table. |
| Rollback | **Possible and safe.** `DROP TABLE "PaymentReminder"; DROP TYPE "PaymentReminderStage";`. Only reminder history is lost. No business record depends on it. |

---

## Migration 2: `20261201090000_customer_favourites`

**Purpose:** let an administrator mark a customer as a favourite.

**SQL (complete):**

```sql
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "favouritedAt" TIMESTAMP(3),
ADD COLUMN     "favouritedById" UUID,
ADD COLUMN     "isFavourite" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_favouritedById_fkey" FOREIGN KEY ("favouritedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

| Question | Answer |
|---|---|
| Database changes | Adds three columns to `customers`, and one foreign key from `customers` to `users`. |
| Tables affected | `customers` (altered). `users` (referenced, not changed). |
| Columns / relationships | `isFavourite BOOLEAN NOT NULL DEFAULT false`; `favouritedAt TIMESTAMP(3) NULL`; `favouritedById UUID NULL` referencing `users.id`. |
| Existing data modified or deleted? | **Existing rows are not changed in content.** Every existing customer gets `isFavourite = false` and NULL for the other two columns, which is the correct starting state. No row is deleted. |
| Risk to existing production data | **Low.** On PostgreSQL 11 and later, adding a column with a constant default does not rewrite the table. It takes a brief exclusive lock on `customers` while the catalogue changes. `ON DELETE SET NULL` means deleting a user clears the favourite-marked-by field only; the favourite flag stays. |
| Runtime effect once applied | The favourite toggle and the Favourite view start to work. Before it is applied, both return a clear "not yet available" message, and the rest of the customer module is unaffected (this was verified). |
| Rollback | **Possible, but it loses data.** `ALTER TABLE "customers" DROP CONSTRAINT "customers_favouritedById_fkey"; ALTER TABLE "customers" DROP COLUMN "isFavourite", DROP COLUMN "favouritedAt", DROP COLUMN "favouritedById";`. The rollback **permanently discards every favourite mark** made after the migration was applied. Take a backup first if marks have been made. |

**Known follow-up, not part of the migration:** the Prisma model in `schema.prisma` does not yet include these three fields (they were removed to keep the client working until approval). After approval the fields must be added back to the model and the client regenerated. Until then the code uses raw SQL for the column, which works once the column exists.

---

## Observed on the isolated test database (neither migration applied)

- With an open overdue alert and no `PaymentReminder` table, `POST /payment-alerts/sweep` returns **500**. The alert list, bell and dashboard are unaffected. Applying migration 1 removes this failure.
- The payment-alert list itself was verified on real test invoices, without these migrations: overdue, due soon, recalculation after a date change, clearing a date, and full payment all behave as specified.
- Favourite marking returns its "not yet available" message while migration 2 is unapplied. No other customer endpoint was affected (checked: list, summary, detail).

## Before either migration is applied to production (for your approval)

1. Take a database backup (Neon branch or dump) and record its identifier.
2. Apply to the test database first, and run the checks in the test report.
3. Apply to production only with your explicit approval, in a maintenance window if desired.
4. Note that `render.yaml` runs `prisma migrate deploy` at build time for the `main` branch. These migrations must not reach `main` until approved.
