-- Module 6: Proforma Invoice Management. Additive only: new enum, new tables,
-- two DocumentKind values and one nullable documents column. No existing data changes.

-- CreateEnum
CREATE TYPE "ProformaStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'SENT', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'PROFORMA_PDF';
ALTER TYPE "DocumentKind" ADD VALUE 'PROFORMA_ATTACHMENT';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "proformaInvoiceId" UUID;

-- CreateTable
CREATE TABLE "proforma_invoices" (
    "id" UUID NOT NULL,
    "piNumber" TEXT NOT NULL,
    "quotationId" UUID NOT NULL,
    "quotationRevisionId" UUID NOT NULL,
    "activeRevisionId" UUID,
    "replacesId" UUID,
    "customerId" UUID NOT NULL,
    "contactId" UUID,
    "assignedToId" UUID,
    "status" "ProformaStatus" NOT NULL DEFAULT 'DRAFT',
    "piDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL,
    "subject" TEXT,
    "referenceNumber" TEXT,
    "internalRemarks" TEXT,
    "customerSnapshot" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itemDiscountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additionalDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherChargesLabel" TEXT,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxBreakdown" JSONB,
    "advanceAmount" DECIMAL(14,2),
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "warrantyTerms" TEXT,
    "termsAndConditions" TEXT,
    "notes" TEXT,
    "paymentInstructions" TEXT,
    "bankDetails" JSONB,
    "issuedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "pdfDocumentId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice_items" (
    "id" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quotationItemId" UUID,
    "productId" UUID NOT NULL,
    "productModelId" UUID,
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

    CONSTRAINT "proforma_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_invoice_status_history" (
    "id" UUID NOT NULL,
    "proformaInvoiceId" UUID NOT NULL,
    "previousStatus" "ProformaStatus",
    "newStatus" "ProformaStatus" NOT NULL,
    "remarks" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proforma_invoice_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_piNumber_key" ON "proforma_invoices"("piNumber");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_activeRevisionId_key" ON "proforma_invoices"("activeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_replacesId_key" ON "proforma_invoices"("replacesId");

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_pdfDocumentId_key" ON "proforma_invoices"("pdfDocumentId");

-- CreateIndex
CREATE INDEX "proforma_invoices_quotationId_idx" ON "proforma_invoices"("quotationId");

-- CreateIndex
CREATE INDEX "proforma_invoices_quotationRevisionId_idx" ON "proforma_invoices"("quotationRevisionId");

-- CreateIndex
CREATE INDEX "proforma_invoices_customerId_idx" ON "proforma_invoices"("customerId");

-- CreateIndex
CREATE INDEX "proforma_invoices_status_idx" ON "proforma_invoices"("status");

-- CreateIndex
CREATE INDEX "proforma_invoices_assignedToId_idx" ON "proforma_invoices"("assignedToId");

-- CreateIndex
CREATE INDEX "proforma_invoices_piDate_idx" ON "proforma_invoices"("piDate");

-- CreateIndex
CREATE INDEX "proforma_invoices_createdAt_idx" ON "proforma_invoices"("createdAt");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_proformaInvoiceId_idx" ON "proforma_invoice_items"("proformaInvoiceId");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_productId_idx" ON "proforma_invoice_items"("productId");

-- CreateIndex
CREATE INDEX "proforma_invoice_items_productModelId_idx" ON "proforma_invoice_items"("productModelId");

-- CreateIndex
CREATE INDEX "proforma_invoice_status_history_proformaInvoiceId_changedAt_idx" ON "proforma_invoice_status_history"("proformaInvoiceId", "changedAt");

-- CreateIndex
CREATE INDEX "documents_proformaInvoiceId_idx" ON "documents"("proformaInvoiceId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_quotationRevisionId_fkey" FOREIGN KEY ("quotationRevisionId") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_pdfDocumentId_fkey" FOREIGN KEY ("pdfDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "quotation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_status_history" ADD CONSTRAINT "proforma_invoice_status_history_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoice_status_history" ADD CONSTRAINT "proforma_invoice_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- PI number sequence (KI/PI/00001), same convention as KI/QT/.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'PROFORMA_INVOICE', 'KI/PI/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Permissions (mirrored in src/common/authz/permissions.ts for fresh seeds).
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt") VALUES
  (gen_random_uuid(), 'proforma.read',     'proforma', 'read',     'View proforma invoices and their documents', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.create',   'proforma', 'create',   'Create proforma invoices from accepted quotations', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.update',   'proforma', 'update',   'Edit draft proforma invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.submit',   'proforma', 'submit',   'Submit proforma invoices for approval', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.approve',  'proforma', 'approve',  'Approve or send back proforma invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.issue',    'proforma', 'issue',    'Issue proforma invoices and record them as sent', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.download', 'proforma', 'download', 'Download proforma invoice PDFs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.cancel',   'proforma', 'cancel',   'Cancel proforma invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.delete',   'proforma', 'delete',   'Delete never-issued draft proforma invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'proforma.export',   'proforma', 'export',   'Export proforma invoices', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Default grants (a proposal; editable at runtime). Super Admin gets everything.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."module" = 'proforma'
WHERE r."code" IN ('SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER')
   OR (r."code" = 'SALES_MANAGER' AND p."code" IN ('proforma.read', 'proforma.create', 'proforma.update', 'proforma.submit', 'proforma.download', 'proforma.export'))
   OR (r."code" = 'SALES_EXECUTIVE' AND p."code" IN ('proforma.read', 'proforma.download'))
ON CONFLICT DO NOTHING;
