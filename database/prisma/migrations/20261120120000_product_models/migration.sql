-- Module 2 (Product Management): Product -> ProductModel split, per-model
-- vendor mappings, mapping status, product SKU/authorship, document kinds.
-- Additive: no column or table is dropped; existing rows are carried over.

-- CreateEnum
CREATE TYPE "VendorMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_BROCHURE';
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_TECH_SPEC';
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_MANUAL';
ALTER TYPE "DocumentKind" ADD VALUE 'PRODUCT_WARRANTY';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "updatedById" UUID,
ALTER COLUMN "modelNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vendor_products" ADD COLUMN     "status" "VendorMappingStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "product_models" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "modelCode" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelNumber" TEXT NOT NULL,
    "normalizedModelNumber" TEXT NOT NULL,
    "description" TEXT,
    "specifications" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageDocumentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_product_models" (
    "id" UUID NOT NULL,
    "vendorProductId" UUID NOT NULL,
    "productModelId" UUID NOT NULL,
    "vendorSku" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "status" "VendorMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_product_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_models_modelCode_key" ON "product_models"("modelCode");

-- CreateIndex
CREATE UNIQUE INDEX "product_models_imageDocumentId_key" ON "product_models"("imageDocumentId");

-- CreateIndex
CREATE INDEX "product_models_modelNumber_idx" ON "product_models"("modelNumber");

-- CreateIndex
CREATE INDEX "product_models_modelName_idx" ON "product_models"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "product_models_productId_normalizedModelNumber_key" ON "product_models"("productId", "normalizedModelNumber");

-- CreateIndex
CREATE INDEX "vendor_product_models_productModelId_idx" ON "vendor_product_models"("productModelId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_product_models_vendorProductId_productModelId_key" ON "vendor_product_models"("vendorProductId", "productModelId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE INDEX "products_createdAt_idx" ON "products"("createdAt");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_imageDocumentId_fkey" FOREIGN KEY ("imageDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_models" ADD CONSTRAINT "vendor_product_models_vendorProductId_fkey" FOREIGN KEY ("vendorProductId") REFERENCES "vendor_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_product_models" ADD CONSTRAINT "vendor_product_models_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill (existing rows used the old "one product row = one model")
-- ---------------------------------------------------------------------------

-- 1. Products of the same brand that share a name were different models.
--    Disambiguate with the model number so the new uniqueness can hold.
UPDATE "products" p
SET "name" = p."name" || ' (' || p."modelNumber" || ')',
    "normalizedName" = p."normalizedName" || ' ' ||
      trim(lower(regexp_replace(p."modelNumber", '[^a-zA-Z0-9]+', ' ', 'g')))
WHERE p."id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "companyId", "normalizedName" ORDER BY "createdAt", "id") AS rn
    FROM "products"
  ) ranked WHERE ranked.rn > 1
);

-- 2. Each legacy product's model number becomes its first model.
INSERT INTO "product_models"
  ("id", "productId", "modelCode", "modelName", "modelNumber", "normalizedModelNumber",
   "specifications", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id",
       'KI/MDL/' || lpad((row_number() OVER (ORDER BY p."createdAt", p."id"))::text, 5, '0'),
       p."name", p."modelNumber", upper(regexp_replace(p."modelNumber", '\s', '', 'g')),
       p."specifications", p."isActive", p."createdAt", CURRENT_TIMESTAMP
FROM "products" p
WHERE p."modelNumber" IS NOT NULL;

-- 3. Model code sequence continues after the backfilled codes.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
SELECT gen_random_uuid(), 'PRODUCT_MODEL', 'KI/MDL/', 5,
       (SELECT count(*) FROM "product_models") + 1, CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;

-- 4. An existing vendor<->product mapping was a mapping to that one model.
INSERT INTO "vendor_product_models"
  ("id", "vendorProductId", "productModelId", "vendorSku", "isPreferred", "createdAt", "updatedAt")
SELECT gen_random_uuid(), vp."id", pm."id", vp."vendorSku", vp."isPreferred", vp."createdAt", CURRENT_TIMESTAMP
FROM "vendor_products" vp
JOIN "product_models" pm ON pm."productId" = vp."productId";

-- 5. Now that names are unique per brand, enforce it.
CREATE UNIQUE INDEX "products_companyId_normalizedName_key" ON "products"("companyId", "normalizedName");
