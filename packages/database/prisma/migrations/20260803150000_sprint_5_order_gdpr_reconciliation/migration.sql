-- Sprint 5: order sync status and nightly reconciliation tracking
ALTER TABLE "shops" ADD COLUMN "last_order_sync" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "last_reconciliation" TIMESTAMP(3);

-- Unique customer per shop for idempotent webhook upserts
CREATE UNIQUE INDEX "customers_shop_id_shopify_customer_id_key" ON "customers"("shop_id", "shopify_customer_id");
