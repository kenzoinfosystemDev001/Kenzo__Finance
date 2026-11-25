-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "favouritedAt" TIMESTAMP(3),
ADD COLUMN     "favouritedById" UUID,
ADD COLUMN     "isFavourite" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_favouritedById_fkey" FOREIGN KEY ("favouritedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

