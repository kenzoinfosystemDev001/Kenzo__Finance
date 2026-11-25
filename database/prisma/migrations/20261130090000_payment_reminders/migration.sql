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

