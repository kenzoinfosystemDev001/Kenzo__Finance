-- Module 9: Delivery Management

CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT','SCHEDULED','READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERED','DELIVERY_FAILED','RETURNED','CANCELLED');
CREATE TYPE "TransportMode" AS ENUM ('DIRECT','OWN_VEHICLE','TRANSPORT','COURIER');
CREATE TYPE "DeliveryTrackingSource" AS ENUM ('MANUAL','EXTERNAL');

ALTER TYPE "DocumentKind" ADD VALUE 'DELIVERY_CHALLAN';
ALTER TYPE "DocumentKind" ADD VALUE 'PACKING_LIST';
ALTER TYPE "DocumentKind" ADD VALUE 'DELIVERY_POD';
ALTER TYPE "DocumentKind" ADD VALUE 'DELIVERY_SIGNATURE';
ALTER TYPE "DocumentKind" ADD VALUE 'DELIVERY_PHOTO';
ALTER TYPE "DocumentKind" ADD VALUE 'DELIVERY_ATTACHMENT';

ALTER TABLE "documents" ADD COLUMN "deliveryId" UUID;

CREATE TABLE "deliveries" (
  "id" UUID NOT NULL,
  "deliveryNumber" TEXT NOT NULL,
  "customerId" UUID NOT NULL,
  "finalInvoiceId" UUID NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
  "deliveryDate" DATE NOT NULL,
  "expectedDate" DATE,
  "actualDeliveryDate" DATE,
  "deliveryAddress" TEXT NOT NULL,
  "contactPerson" TEXT,
  "contactNumber" TEXT,
  "internalRemarks" TEXT,
  "dispatchDate" DATE,
  "dispatchTime" TEXT,
  "transporterName" TEXT,
  "transportMode" "TransportMode",
  "vehicleNumber" TEXT,
  "driverName" TEXT,
  "driverContact" TEXT,
  "courierCompany" TEXT,
  "trackingNumber" TEXT,
  "lrGrNumber" TEXT,
  "dispatchRemarks" TEXT,
  "failureDate" DATE,
  "failureReason" TEXT,
  "nextAttemptDate" DATE,
  "challanDocumentId" UUID,
  "packingDocumentId" UUID,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_items" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "invoiceItemId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productModelId" UUID,
  "productName" TEXT NOT NULL,
  "productCode" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "modelName" TEXT,
  "modelNumber" TEXT,
  "description" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  "packageCount" INTEGER,
  "remarks" TEXT,
  CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_status_history" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "previousStatus" "DeliveryStatus",
  "newStatus" "DeliveryStatus" NOT NULL,
  "remarks" TEXT,
  "changedById" UUID,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_tracking_events" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "location" TEXT,
  "remarks" TEXT,
  "source" "DeliveryTrackingSource" NOT NULL DEFAULT 'MANUAL',
  "externalReference" TEXT,
  "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shipment_tracking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "packing_lists" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "packingNumber" TEXT NOT NULL,
  "packageNumber" INTEGER NOT NULL,
  "description" TEXT,
  "weight" TEXT,
  "dimensions" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "packing_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "packing_list_items" (
  "id" UUID NOT NULL,
  "packingListId" UUID NOT NULL,
  "deliveryItemId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "packing_list_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proof_of_delivery" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "receiverName" TEXT NOT NULL,
  "receiverContact" TEXT,
  "actualDeliveryDate" DATE NOT NULL,
  "deliveryConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "confirmedById" UUID,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proof_of_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deliveries_deliveryNumber_key" ON "deliveries"("deliveryNumber");
CREATE UNIQUE INDEX "deliveries_challanDocumentId_key" ON "deliveries"("challanDocumentId");
CREATE UNIQUE INDEX "deliveries_packingDocumentId_key" ON "deliveries"("packingDocumentId");
CREATE UNIQUE INDEX "delivery_items_deliveryId_invoiceItemId_key" ON "delivery_items"("deliveryId","invoiceItemId");
CREATE UNIQUE INDEX "packing_lists_packingNumber_key" ON "packing_lists"("packingNumber");
CREATE UNIQUE INDEX "proof_of_delivery_deliveryId_key" ON "proof_of_delivery"("deliveryId");

CREATE INDEX "deliveries_customerId_idx" ON "deliveries"("customerId");
CREATE INDEX "deliveries_finalInvoiceId_idx" ON "deliveries"("finalInvoiceId");
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
CREATE INDEX "deliveries_deliveryDate_idx" ON "deliveries"("deliveryDate");
CREATE INDEX "deliveries_expectedDate_idx" ON "deliveries"("expectedDate");
CREATE INDEX "deliveries_dispatchDate_idx" ON "deliveries"("dispatchDate");
CREATE INDEX "deliveries_actualDeliveryDate_idx" ON "deliveries"("actualDeliveryDate");
CREATE INDEX "delivery_items_deliveryId_idx" ON "delivery_items"("deliveryId");
CREATE INDEX "delivery_items_invoiceItemId_idx" ON "delivery_items"("invoiceItemId");
CREATE INDEX "delivery_status_history_deliveryId_changedAt_idx" ON "delivery_status_history"("deliveryId","changedAt");
CREATE INDEX "shipment_tracking_events_deliveryId_eventAt_idx" ON "shipment_tracking_events"("deliveryId","eventAt");
CREATE INDEX "packing_lists_deliveryId_idx" ON "packing_lists"("deliveryId");
CREATE INDEX "packing_list_items_packingListId_idx" ON "packing_list_items"("packingListId");
CREATE INDEX "documents_deliveryId_idx" ON "documents"("deliveryId");

ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_finalInvoiceId_fkey" FOREIGN KEY ("finalInvoiceId") REFERENCES "final_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_challanDocumentId_fkey" FOREIGN KEY ("challanDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_packingDocumentId_fkey" FOREIGN KEY ("packingDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "final_invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_status_history" ADD CONSTRAINT "delivery_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "shipment_tracking_events_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packing_lists" ADD CONSTRAINT "packing_lists_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "packing_list_items" ADD CONSTRAINT "packing_list_items_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "packing_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_sequences" ("id","key","prefix","padding","nextValue","updatedAt")
VALUES (gen_random_uuid(),'DELIVERY','KI/DLV/',5,1,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("id","code","module","action","description","createdAt") VALUES
(gen_random_uuid(),'delivery.read','delivery','read','View deliveries and tracking history',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.create','delivery','create','Create delivery drafts',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.update','delivery','update','Edit delivery drafts',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.schedule','delivery','schedule','Schedule deliveries',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.dispatch','delivery','dispatch','Dispatch deliveries',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.track','delivery','track','Update shipment tracking',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.confirm','delivery','confirm','Confirm deliveries and proof of delivery',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.cancel','delivery','cancel','Cancel deliveries',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.upload_pod','delivery','upload_pod','Upload proof of delivery documents',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.download','delivery','download','Download delivery documents',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.export','delivery','export','Export delivery data',CURRENT_TIMESTAMP),
(gen_random_uuid(),'delivery.reports','delivery','reports','View delivery reports',CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId","permissionId")
SELECT r."id",p."id" FROM "roles" r JOIN "permissions" p ON p."module"='delivery'
WHERE r."code" IN ('SUPER_ADMIN','ADMIN','DELIVERY_MANAGER')
ON CONFLICT DO NOTHING;
