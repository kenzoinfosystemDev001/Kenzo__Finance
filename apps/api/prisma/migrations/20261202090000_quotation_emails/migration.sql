-- Quotation email history. Each row is one attempt to email an issued revision.
-- Nothing existing is altered: new enums and a new table only.

-- CreateEnum
CREATE TYPE "QuotationEmailStatus" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailRecipientType" AS ENUM ('CUSTOMER', 'VENDOR');

-- CreateTable
CREATE TABLE "quotation_emails" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "recipientType" "EmailRecipientType" NOT NULL,
    "recipientId" UUID,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "status" "QuotationEmailStatus" NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "serverResponse" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "quotation_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_emails_idempotencyKey_key" ON "quotation_emails"("idempotencyKey");

-- CreateIndex
CREATE INDEX "quotation_emails_quotationId_createdAt_idx" ON "quotation_emails"("quotationId", "createdAt");

-- AddForeignKey
ALTER TABLE "quotation_emails" ADD CONSTRAINT "quotation_emails_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_emails" ADD CONSTRAINT "quotation_emails_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_emails" ADD CONSTRAINT "quotation_emails_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
