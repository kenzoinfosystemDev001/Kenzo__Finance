-- Module 1 (Vendor Management) v2: multiple addresses, typed contacts,
-- document replacement, audit parent links. Purely additive: no column or
-- table is dropped or retyped, and existing data is copied, not moved.

-- CreateEnum
CREATE TYPE "VendorContactType" AS ENUM ('GENERAL', 'SALES', 'ACCOUNTS', 'SUPPORT', 'MANAGEMENT', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "VendorAddressType" AS ENUM ('REGISTERED_OFFICE', 'OFFICE', 'WAREHOUSE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'VENDOR_VISITING_CARD';
ALTER TYPE "DocumentKind" ADD VALUE 'VENDOR_REGISTRATION_CERTIFICATE';
ALTER TYPE "DocumentKind" ADD VALUE 'VENDOR_PRODUCT_CATALOGUE';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "parentEntityId" TEXT,
ADD COLUMN     "parentEntityType" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "replacesDocumentId" UUID;

-- AlterTable
ALTER TABLE "vendor_contacts" ADD COLUMN     "alternateEmail" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "contactType" "VendorContactType" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "alternateEmail" TEXT,
ADD COLUMN     "registrationNumber" TEXT;

-- CreateTable
CREATE TABLE "vendor_addresses" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "addressType" "VendorAddressType" NOT NULL DEFAULT 'OFFICE',
    "label" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_addresses_vendorId_idx" ON "vendor_addresses"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_addresses_city_idx" ON "vendor_addresses"("city");

-- CreateIndex
CREATE INDEX "audit_logs_parentEntityType_parentEntityId_idx" ON "audit_logs"("parentEntityType", "parentEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_replacesDocumentId_key" ON "documents"("replacesDocumentId");

-- CreateIndex
CREATE INDEX "vendor_contacts_vendorId_contactType_idx" ON "vendor_contacts"("vendorId", "contactType");

-- CreateIndex
CREATE INDEX "vendor_contacts_phone_idx" ON "vendor_contacts"("phone");

-- CreateIndex
CREATE INDEX "vendor_contacts_email_idx" ON "vendor_contacts"("email");

-- AddForeignKey
ALTER TABLE "vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Data backfill
-- ---------------------------------------------------------------------------

-- 1. Existing inline vendor addresses become the vendor's primary address.
--    Rows without an address line are left alone rather than inventing one;
--    their city/state stay on the vendor row.
INSERT INTO "vendor_addresses"
  ("id", "vendorId", "addressType", "addressLine1", "addressLine2", "city",
   "state", "postalCode", "country", "isPrimary", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v."id", 'REGISTERED_OFFICE', v."addressLine1",
       v."addressLine2", v."city", v."state", v."postalCode", v."country",
       true, v."createdAt", CURRENT_TIMESTAMP
FROM "vendors" v
WHERE v."addressLine1" IS NOT NULL AND btrim(v."addressLine1") <> ''
  AND NOT EXISTS (SELECT 1 FROM "vendor_addresses" a WHERE a."vendorId" = v."id");

-- 2. The single inline contact person becomes a primary GENERAL contact, for
--    vendors that do not already have contact rows.
INSERT INTO "vendor_contacts"
  ("id", "vendorId", "contactType", "name", "email", "phone", "alternatePhone",
   "isPrimary", "createdAt", "updatedAt")
SELECT gen_random_uuid(), v."id", 'GENERAL', v."contactPerson", v."email",
       v."phone", v."alternatePhone", true, v."createdAt", CURRENT_TIMESTAMP
FROM "vendors" v
WHERE v."contactPerson" IS NOT NULL AND btrim(v."contactPerson") <> ''
  AND NOT EXISTS (SELECT 1 FROM "vendor_contacts" c WHERE c."vendorId" = v."id");

-- 3. Link existing audit rows for vendor child entities to their vendor, so
--    the vendor's activity history includes changes made before this release.
UPDATE "audit_logs"
SET "parentEntityType" = 'Vendor',
    "parentEntityId" = COALESCE("after"->>'vendorId', "before"->>'vendorId')
WHERE "entityType" IN ('VendorCompany', 'VendorProduct', 'Document')
  AND "parentEntityId" IS NULL
  AND COALESCE("after"->>'vendorId', "before"->>'vendorId') IS NOT NULL;

UPDATE "audit_logs" a
SET "parentEntityType" = 'Vendor', "parentEntityId" = c."vendorId"::text
FROM "vendor_contacts" c
WHERE a."entityType" = 'VendorContact'
  AND a."parentEntityId" IS NULL
  AND a."entityId" = c."id"::text;
