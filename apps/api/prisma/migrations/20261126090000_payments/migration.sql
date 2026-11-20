-- Module 8: Payment Management. Additive only: new enum, new tables,
-- two DocumentKind values and one nullable documents column. No existing data changes.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'PAYMENT_RECEIPT';
ALTER TYPE "DocumentKind" ADD VALUE 'PAYMENT_PROOF';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "paymentId" UUID;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "transactionReference" TEXT,
    "normalizedReference" TEXT,
    "bankReference" TEXT,
    "receivedById" UUID,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "duplicateReferenceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectionReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "reversalReason" TEXT,
    "receiptDocumentId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "finalInvoiceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_history" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "previousStatus" "PaymentStatus",
    "newStatus" "PaymentStatus" NOT NULL,
    "remarks" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptNumber_key" ON "payments"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payments_receiptDocumentId_key" ON "payments"("receiptDocumentId");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- CreateIndex
CREATE INDEX "payments_normalizedReference_idx" ON "payments"("normalizedReference");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "payment_allocations_finalInvoiceId_idx" ON "payment_allocations"("finalInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_finalInvoiceId_key" ON "payment_allocations"("paymentId", "finalInvoiceId");

-- CreateIndex
CREATE INDEX "payment_status_history_paymentId_changedAt_idx" ON "payment_status_history"("paymentId", "changedAt");

-- CreateIndex
CREATE INDEX "documents_paymentId_idx" ON "documents"("paymentId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receiptDocumentId_fkey" FOREIGN KEY ("receiptDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Receipt numbers (KI/RCT/00001), allocated when a payment is recorded.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'PAYMENT_RECEIPT', 'KI/RCT/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Permissions (mirrored in src/common/authz/permissions.ts for fresh seeds).
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt") VALUES
  (gen_random_uuid(), 'payment.read',     'payment', 'read',     'View payments and their documents', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.create',   'payment', 'create',   'Record payments against final invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.update',   'payment', 'update',   'Edit payments pending verification', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.verify',   'payment', 'verify',   'Verify payments (they then count towards the invoice)', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.reject',   'payment', 'reject',   'Reject pending payments', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.reverse',  'payment', 'reverse',  'Reverse verified payments', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.download', 'payment', 'download', 'Download payment receipts', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.export',   'payment', 'export',   'Export the payment register', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'payment.reports',  'payment', 'reports',  'View payment reports', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Default grants (a proposal; editable at runtime). Super Admin gets everything.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."module" = 'payment'
WHERE r."code" IN ('SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER')
   OR (r."code" = 'SALES_MANAGER' AND p."code" IN ('payment.read', 'payment.download', 'payment.reports'))
ON CONFLICT DO NOTHING;
