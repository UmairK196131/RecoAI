-- AlterTable
ALTER TABLE "shops" ADD COLUMN "uninstalled_at" TIMESTAMP(3),
ADD COLUMN "purge_scheduled_at" TIMESTAMP(3);
