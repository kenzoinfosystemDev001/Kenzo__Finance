-- Module 4 (Enquiry Management). Additive: new tables and enum values, and a
-- nullable documents.enquiryId. Nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "EnquiryPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'FOLLOW_UP_PENDING', 'REQUIREMENT_CLARIFICATION', 'READY_FOR_QUOTATION', 'CONVERTED', 'ON_HOLD', 'LOST', 'CLOSED');

-- CreateEnum
CREATE TYPE "FollowUpMethod" AS ENUM ('PHONE', 'EMAIL', 'WHATSAPP', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "FollowUpOutcome" AS ENUM ('INTERESTED', 'CLARIFICATION_NEEDED', 'AWAITING_RESPONSE', 'NEGOTIATION_REQUIRED', 'READY_FOR_QUOTATION', 'NOT_INTERESTED', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'ENQUIRY_REQUIREMENT';
ALTER TYPE "DocumentKind" ADD VALUE 'ENQUIRY_TECH_SPEC';
ALTER TYPE "DocumentKind" ADD VALUE 'ENQUIRY_REFERENCE_IMAGE';
ALTER TYPE "DocumentKind" ADD VALUE 'ENQUIRY_EXISTING_QUOTATION';
ALTER TYPE "DocumentKind" ADD VALUE 'ENQUIRY_OTHER';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "enquiryId" UUID;

-- CreateTable
CREATE TABLE "enquiry_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" UUID NOT NULL,
    "enquiryNumber" TEXT NOT NULL,
    "enquiryDate" DATE NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "priority" "EnquiryPriority" NOT NULL DEFAULT 'NORMAL',
    "customerId" UUID NOT NULL,
    "customerContactId" UUID,
    "sourceId" UUID,
    "assignedToId" UUID,
    "description" TEXT,
    "internalRemarks" TEXT,
    "expectedDecisionDate" DATE,
    "expectedBudget" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "expectedDeliveryTimeline" TEXT,
    "paymentPreference" TEXT,
    "commercialNotes" TEXT,
    "nextFollowUpDate" DATE,
    "convertedAt" TIMESTAMP(3),
    "convertedById" UUID,
    "convertedReference" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_items" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productModelId" UUID,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "technicalRequirements" TEXT,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "contactId" UUID,
    "followUpDate" TIMESTAMP(3) NOT NULL,
    "method" "FollowUpMethod" NOT NULL,
    "discussionSummary" TEXT NOT NULL,
    "customerResponse" TEXT,
    "outcome" "FollowUpOutcome" NOT NULL,
    "nextFollowUpDate" DATE,
    "assignedToId" UUID,
    "internalNotes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_status_history" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "previousStatus" "EnquiryStatus",
    "newStatus" "EnquiryStatus" NOT NULL,
    "reason" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_sources_normalizedName_key" ON "enquiry_sources"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_enquiryNumber_key" ON "enquiries"("enquiryNumber");

-- CreateIndex
CREATE INDEX "enquiries_customerId_idx" ON "enquiries"("customerId");

-- CreateIndex
CREATE INDEX "enquiries_status_idx" ON "enquiries"("status");

-- CreateIndex
CREATE INDEX "enquiries_priority_idx" ON "enquiries"("priority");

-- CreateIndex
CREATE INDEX "enquiries_sourceId_idx" ON "enquiries"("sourceId");

-- CreateIndex
CREATE INDEX "enquiries_assignedToId_idx" ON "enquiries"("assignedToId");

-- CreateIndex
CREATE INDEX "enquiries_enquiryDate_idx" ON "enquiries"("enquiryDate");

-- CreateIndex
CREATE INDEX "enquiries_nextFollowUpDate_idx" ON "enquiries"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "enquiry_items_enquiryId_idx" ON "enquiry_items"("enquiryId");

-- CreateIndex
CREATE INDEX "enquiry_items_productId_idx" ON "enquiry_items"("productId");

-- CreateIndex
CREATE INDEX "enquiry_items_productModelId_idx" ON "enquiry_items"("productModelId");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_enquiryId_followUpDate_idx" ON "enquiry_follow_ups"("enquiryId", "followUpDate");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_assignedToId_idx" ON "enquiry_follow_ups"("assignedToId");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_followUpDate_idx" ON "enquiry_follow_ups"("followUpDate");

-- CreateIndex
CREATE INDEX "enquiry_status_history_enquiryId_changedAt_idx" ON "enquiry_status_history"("enquiryId", "changedAt");

-- CreateIndex
CREATE INDEX "documents_enquiryId_idx" ON "documents"("enquiryId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "enquiry_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_items" ADD CONSTRAINT "enquiry_items_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_items" ADD CONSTRAINT "enquiry_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_items" ADD CONSTRAINT "enquiry_items_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_history" ADD CONSTRAINT "enquiry_status_history_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_status_history" ADD CONSTRAINT "enquiry_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enquiry number sequence (KI/ENQ/00001), so numbering works without re-seeding.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'ENQUIRY', 'KI/ENQ/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
