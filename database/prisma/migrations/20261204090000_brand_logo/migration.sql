-- Company logo: one optional row (key 'primary') stored in the database.
-- Additive only: a new table. The bundled default logo is used when no row exists.

-- CreateTable
CREATE TABLE "brand_logo" (
    "key" VARCHAR(40) NOT NULL DEFAULT 'primary',
    "data" BYTEA NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brand_logo_pkey" PRIMARY KEY ("key")
);
