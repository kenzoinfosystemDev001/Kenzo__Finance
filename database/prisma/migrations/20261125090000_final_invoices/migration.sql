-- Module 7: Final Invoice Management. Additive only: new enums, new tables,
-- two DocumentKind values and one nullable documents column. No existing data changes.

-- CreateEnum
CREATE TYPE "InvoicePaymentState" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "FinalInvoiceStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'SENT', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'FINAL_INVOICE_PDF';
ALTER TYPE "DocumentKind" ADD VALUE 'FINAL_INVOICE_ATTACHMENT';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "finalInvoiceId" UUID;

-- CreateTable
CREATE TABLE "final_invoices" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT,
    "proformaInvoiceId" UUID NOT NULL,
    "activeProformaId" UUID,
    "replacesId" UUID,
    "quotationId" UUID NOT NULL,
    "quotationRevisionId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "contactId" UUID,
    "assignedToId" UUID,
    "status" "FinalInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" TEXT NOT NULL,
    "subject" TEXT,
    "purchaseOrderNumber" TEXT,
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
    "amountReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentState" "InvoicePaymentState" NOT NULL DEFAULT 'UNPAID',
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

    CONSTRAINT "final_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_invoice_items" (
    "id" UUID NOT NULL,
    "finalInvoiceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "proformaInvoiceItemId" UUID,
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

    CONSTRAINT "final_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_invoice_status_history" (
    "id" UUID NOT NULL,
    "finalInvoiceId" UUID NOT NULL,
    "previousStatus" "FinalInvoiceStatus",
    "newStatus" "FinalInvoiceStatus" NOT NULL,
    "remarks" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "final_invoice_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "final_invoices_invoiceNumber_key" ON "final_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "final_invoices_activeProformaId_key" ON "final_invoices"("activeProformaId");

-- CreateIndex
CREATE UNIQUE INDEX "final_invoices_replacesId_key" ON "final_invoices"("replacesId");

-- CreateIndex
CREATE UNIQUE INDEX "final_invoices_pdfDocumentId_key" ON "final_invoices"("pdfDocumentId");

-- CreateIndex
CREATE INDEX "final_invoices_proformaInvoiceId_idx" ON "final_invoices"("proformaInvoiceId");

-- CreateIndex
CREATE INDEX "final_invoices_quotationId_idx" ON "final_invoices"("quotationId");

-- CreateIndex
CREATE INDEX "final_invoices_customerId_idx" ON "final_invoices"("customerId");

-- CreateIndex
CREATE INDEX "final_invoices_status_idx" ON "final_invoices"("status");

-- CreateIndex
CREATE INDEX "final_invoices_assignedToId_idx" ON "final_invoices"("assignedToId");

-- CreateIndex
CREATE INDEX "final_invoices_invoiceDate_idx" ON "final_invoices"("invoiceDate");

-- CreateIndex
CREATE INDEX "final_invoices_dueDate_idx" ON "final_invoices"("dueDate");

-- CreateIndex
CREATE INDEX "final_invoices_paymentState_idx" ON "final_invoices"("paymentState");

-- CreateIndex
CREATE INDEX "final_invoices_createdAt_idx" ON "final_invoices"("createdAt");

-- CreateIndex
CREATE INDEX "final_invoice_items_finalInvoiceId_idx" ON "final_invoice_items"("finalInvoiceId");

-- CreateIndex
CREATE INDEX "final_invoice_items_productId_idx" ON "final_invoice_items"("productId");

-- CreateIndex
CREATE INDEX "final_invoice_items_productModelId_idx" ON "final_invoice_items"("productModelId");

-- CreateIndex
CREATE INDEX "final_invoice_status_history_finalInvoiceId_changedAt_idx" ON "final_invoice_status_history"("finalInvoiceId", "changedAt");

-- CreateIndex
CREATE INDEX "documents_finalInvoiceId_idx" ON "documents"("finalInvoiceId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "proforma_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_quotationRevisionId_fkey" FOREIGN KEY ("quotationRevisionId") REFERENCES "quotation_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "final_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_pdfDocumentId_fkey" FOREIGN KEY ("pdfDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoices" ADD CONSTRAINT "final_invoices_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_items" ADD CONSTRAINT "final_invoice_items_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_items" ADD CONSTRAINT "final_invoice_items_proformaInvoiceItemId_fkey" FOREIGN KEY ("proformaInvoiceItemId") REFERENCES "proforma_invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_items" ADD CONSTRAINT "final_invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_items" ADD CONSTRAINT "final_invoice_items_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "product_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_status_history" ADD CONSTRAINT "final_invoice_status_history_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_invoice_status_history" ADD CONSTRAINT "final_invoice_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Continuous invoice series (KI/INV/00001). The number is allocated only when an
-- invoice is issued; a financial-year series, if enabled in Settings, creates
-- its own row (FINAL_INVOICE:2026-27) on first use.
INSERT INTO "document_sequences" ("id", "key", "prefix", "padding", "nextValue", "updatedAt")
VALUES (gen_random_uuid(), 'FINAL_INVOICE', 'KI/INV/', 5, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Permissions (mirrored in src/common/authz/permissions.ts for fresh seeds).
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "createdAt") VALUES
  (gen_random_uuid(), 'invoice.read',     'invoice', 'read',     'View final invoices and their documents', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.create',   'invoice', 'create',   'Create final invoices from issued proforma invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.update',   'invoice', 'update',   'Edit draft final invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.submit',   'invoice', 'submit',   'Submit final invoices for approval', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.approve',  'invoice', 'approve',  'Approve or send back final invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.issue',    'invoice', 'issue',    'Issue final invoices (allocates the number) and record them as sent', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.cancel',   'invoice', 'cancel',   'Cancel issued final invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.delete',   'invoice', 'delete',   'Delete never-issued draft final invoices', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.download', 'invoice', 'download', 'Download final invoice PDFs', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.export',   'invoice', 'export',   'Export the invoice register', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'invoice.reports',  'invoice', 'reports',  'View invoice reports', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Default grants (a proposal; editable at runtime). Super Admin gets everything.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."module" = 'invoice'
WHERE r."code" IN ('SUPER_ADMIN', 'ADMIN', 'ACCOUNTS_MANAGER')
   OR (r."code" = 'SALES_MANAGER' AND p."code" IN ('invoice.read', 'invoice.download', 'invoice.reports'))
   OR (r."code" = 'SALES_EXECUTIVE' AND p."code" = 'invoice.read')
ON CONFLICT DO NOTHING;
