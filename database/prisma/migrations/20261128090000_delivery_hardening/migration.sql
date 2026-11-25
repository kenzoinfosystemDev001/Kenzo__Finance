-- Module 9 hardening: POD amendments (one delivery may have the original
-- confirmation plus amendments, so the 1:1 unique index on deliveryId is
-- replaced by a plain index), redelivery links, failure/return/cancel details,
-- delivered quantity per item and the recorder of tracking events.
-- Additive; the delivery tables held no rows when this was written.

-- DropIndex
DROP INDEX "proof_of_delivery_deliveryId_key";

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "failureRemarks" TEXT,
ADD COLUMN     "redeliveryOfId" UUID,
ADD COLUMN     "returnReason" TEXT;

-- AlterTable
ALTER TABLE "delivery_items" ADD COLUMN     "deliveredQuantity" INTEGER;

-- AlterTable
ALTER TABLE "proof_of_delivery" ADD COLUMN     "amendmentReason" TEXT,
ADD COLUMN     "amendsId" UUID;

-- AlterTable
ALTER TABLE "shipment_tracking_events" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "recordedById" UUID;

-- CreateIndex
CREATE INDEX "deliveries_redeliveryOfId_idx" ON "deliveries"("redeliveryOfId");

-- CreateIndex
CREATE INDEX "packing_list_items_deliveryItemId_idx" ON "packing_list_items"("deliveryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "packing_list_items_packingListId_deliveryItemId_key" ON "packing_list_items"("packingListId", "deliveryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "packing_lists_deliveryId_packageNumber_key" ON "packing_lists"("deliveryId", "packageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "proof_of_delivery_amendsId_key" ON "proof_of_delivery"("amendsId");

-- CreateIndex
CREATE INDEX "proof_of_delivery_deliveryId_idx" ON "proof_of_delivery"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_tracking_events_deliveryId_provider_externalRefere_key" ON "shipment_tracking_events"("deliveryId", "provider", "externalReference");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_redeliveryOfId_fkey" FOREIGN KEY ("redeliveryOfId") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "shipment_tracking_events_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_list_items" ADD CONSTRAINT "packing_list_items_deliveryItemId_fkey" FOREIGN KEY ("deliveryItemId") REFERENCES "delivery_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_amendsId_fkey" FOREIGN KEY ("amendsId") REFERENCES "proof_of_delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

