-- File bytes stored in PostgreSQL. Document.storageKey "db:<id>" points here.

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "folder" VARCHAR(60) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_files_checksumSha256_idx" ON "stored_files"("checksumSha256");

