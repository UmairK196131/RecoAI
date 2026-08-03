-- CreateEnum
CREATE TYPE "catalog_sync_status" AS ENUM ('pending', 'in_progress', 'completed', 'failed');

-- AlterTable
ALTER TABLE "shops"
ADD COLUMN "catalog_sync_status" "catalog_sync_status" NOT NULL DEFAULT 'pending',
ADD COLUMN "last_catalog_sync_at" TIMESTAMP(3),
ADD COLUMN "last_catalog_sync_error" TEXT;
