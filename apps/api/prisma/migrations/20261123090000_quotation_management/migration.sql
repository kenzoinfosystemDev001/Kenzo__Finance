-- Module 5 (Quotation Management). Additive: new tables and enum values, and a
-- nullable documents.quotationId. Nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'QUOTATION_PDF';
ALTER TYPE "DocumentKind" ADD VALUE 'QUOTATION_CUSTOMER_DOCUMENT';
ALTER TYPE "DocumentKind" ADD VALUE 'QUOTATION_ATTACHMENT';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "quotationId" UUID;

-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "enquiryId" UUID,
    "contactId" UUID,
    "assignedToId" UUID,
    "subject" TEXT,
    "referenceNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "currentTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "acceptedRevisionId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_revisions" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "quotationDate" DATE NOT NULL,
    "validUntil" DATE,
    "customerSnapshot" JSONB NOT NULL,
    "internalRemarks" TEXT,
    "termsAndConditions" TEXT,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "warrantyTerms" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itemDiscountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additionalDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherChargesLabel" TEXT,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxBreakdown" JSONB,
    "issuedAt" TIMESTAMP(3),
    "pdfDocumentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID NOT NULL,
    "productModelId" UUID,
    "enquiryItemId" UUID,
    "productName" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "modelName" TEXT,
    "modelNumber" TEXT,
    "description" TEXT,
    "specifications" JSONB,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxLabel" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_status_history" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "previousStatus" "QuotationStatus",
    "newStatus" "QuotationStatus" NOT NULL,
    "remarks" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_communications" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "revisionNumber" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "channel" "FollowUpMethod" NOT NULL,
    "contactName" TEXT,
    "summary" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_communications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_enquiryId_key" ON "quotations"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_acceptedRevisionId_key" ON "quotations"("acceptedRevisionId");

-- CreateIndex
CREATE INDEX "quotations_customerId_idx" ON "quotations"("customerId");

-- CreateIndex
CREATE INDEX "quotations_status_idx" ON "quotations"("status");

-- CreateIndex
CREATE INDEX "quotations_assignedToId_idx" ON "quotations"("assignedToId");

-- CreateIndex
CREATE INDEX "quotations_createdAt_idx" ON "quotations"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_revisions_pdfDocumentId_key" ON "quotation_revisions"("pdfDocumentId");

-- CreateIndex
CREATE INDEX "quotation_revisions_status_idx" ON "quotation_revisions"("status");

-- CreateIndex
CREATE INDEX "quotation_revisions_quotationDate_idx" ON "quotation_revisions"("quotationDate");

-- CreateIndex
CREATE INDEX "quotation_revisions_validUntil_idx" ON "quotation_revisions"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_revisions_quotationId_revisionNumber_key" ON "quotation_revisions"("quotationId", "revisionNumber");

-- CreateIndex
CREATE INDEX "quotation_items_revisionId_idx" ON "quotation_items"("revisionId");

-- CreateIndex
CREATE INDEX "quotation_items_productId_idx" ON "quotation_items"("productId");

-- CreateIndex
CREATE INDEX "quotation_items_productModelId_idx" ON "quotation_items"("productModelId");

-- CreateIndex
CREATE INDEX "quotation_status_history_quotationId_changedAt_idx" ON "quotation_status_history"("quotationId", "changedAt");

-- CreateIndex
CREATE INDEX "quotation_communications_quotationId_occurredAt_idx" ON "quotation_communications"("quotationId", "occurredAt");

-- CreateIndex
CREATE INDEX "documents_quotationId_idx" ON "documents"("quotationId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_acceptedRevisionId_fkey" FOREIGN KEY ("acceptedRevisionId") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_pdfDocumentId_fkey" FOREIGN KEY ("pdfDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "quotation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_enquiryItemId_fkey" FOREIGN KEY ("enquiryItemId") REFERENCES "enquiry_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "quotation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_communications" ADD CONSTRAINT "quotation_communications_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_communications" ADD CONSTRAINT "quotation_communications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quotation number sequence (KI/QT/00001), so numbering works without re-seeding.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'QUOTATION', 'KI/QT/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
