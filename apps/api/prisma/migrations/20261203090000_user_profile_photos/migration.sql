-- Profile photos: one optional image per user, stored in the database.
-- Additive only: a new table with a foreign key to users (cascade on delete).


-- CreateTable
CREATE TABLE "user_profile_photos" (
    "userId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profile_photos_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_profile_photos" ADD CONSTRAINT "user_profile_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

