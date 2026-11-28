-- Payment reminders: repeat OVERDUE every few days (cycle) and email the
-- customer through an outbox (emailStatus). Additive: existing reminders keep
-- cycle 0 and emailStatus SKIPPED, so nothing already recorded is emailed.

-- CreateEnum
CREATE TYPE "PaymentReminderEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- DropIndex
DROP INDEX "PaymentReminder_finalInvoiceId_dueDate_stage_key";

-- AlterTable
ALTER TABLE "PaymentReminder" ADD COLUMN     "cycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "emailStatus" "PaymentReminderEmailStatus" NOT NULL DEFAULT 'SKIPPED',
ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "recipientEmail" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "PaymentReminder_emailStatus_createdAt_idx" ON "PaymentReminder"("emailStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReminder_finalInvoiceId_dueDate_stage_cycle_key" ON "PaymentReminder"("finalInvoiceId", "dueDate", "stage", "cycle");

