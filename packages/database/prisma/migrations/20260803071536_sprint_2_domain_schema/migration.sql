-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "shop_status" AS ENUM ('active', 'uninstalled', 'suspended');

-- CreateEnum
CREATE TYPE "plan_tier" AS ENUM ('free', 'growth', 'pro');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "inventory_status" AS ENUM ('in_stock', 'out_of_stock', 'low_stock');

-- CreateEnum
CREATE TYPE "behavioral_event_type" AS ENUM ('product_view', 'collection_view', 'search', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'purchase', 'recommendation_impression', 'recommendation_click');

-- CreateEnum
CREATE TYPE "placement_type" AS ENUM ('product_page', 'cart', 'home', 'collection', 'search');

-- CreateEnum
CREATE TYPE "recommendation_strategy" AS ENUM ('collaborative_filtering', 'content_similarity', 'association_rules', 'trending', 'recently_viewed', 'personalized_blend');

-- CreateEnum
CREATE TYPE "ab_test_status" AS ENUM ('draft', 'running', 'paused', 'completed');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "shopify_domain" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "plan_tier" "plan_tier" NOT NULL DEFAULT 'free',
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "shop_status" NOT NULL DEFAULT 'active',

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shopify_product_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product_type" TEXT,
    "vendor" TEXT,
    "price_range_min" DECIMAL(12,2),
    "price_range_max" DECIMAL(12,2),
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "product_status" NOT NULL DEFAULT 'active',
    "inventory_status" "inventory_status" NOT NULL DEFAULT 'in_stock',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "shopify_variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "sku" TEXT,
    "inventory_qty" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "shopify_collection_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "shopify_customer_id" TEXT,
    "shop_id" TEXT NOT NULL,
    "session_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavioral_events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "event_type" "behavioral_event_type" NOT NULL,
    "product_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "behavioral_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shopify_order_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "total_price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_placements" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "placement_type" "placement_type" NOT NULL,
    "strategy" "recommendation_strategy" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_items" INTEGER NOT NULL DEFAULT 4,
    "title_text" TEXT NOT NULL DEFAULT 'You may also like',
    "style_config" JSONB NOT NULL DEFAULT '{}',
    "exclusion_rules" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_logs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "shown_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clicked_product_id" TEXT,
    "impression_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "click_at" TIMESTAMP(3),
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "attributed_order_id" TEXT,

    CONSTRAINT "recommendation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_embeddings" (
    "product_id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "embedding_vector" vector(384),
    "model_version" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_embeddings_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "ab_test_experiments" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "variant_configs" JSONB NOT NULL DEFAULT '[]',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" "ab_test_status" NOT NULL DEFAULT 'draft',

    CONSTRAINT "ab_test_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_shopify_domain_key" ON "shops"("shopify_domain");

-- CreateIndex
CREATE INDEX "shops_status_idx" ON "shops"("status");

-- CreateIndex
CREATE INDEX "products_shop_id_idx" ON "products"("shop_id");

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_shopify_product_id_key" ON "products"("shop_id", "shopify_product_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_shopify_variant_id_key" ON "product_variants"("product_id", "shopify_variant_id");

-- CreateIndex
CREATE INDEX "collections_shop_id_idx" ON "collections"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_shop_id_shopify_collection_id_key" ON "collections"("shop_id", "shopify_collection_id");

-- CreateIndex
CREATE INDEX "customers_shop_id_idx" ON "customers"("shop_id");

-- CreateIndex
CREATE INDEX "customers_shop_id_shopify_customer_id_idx" ON "customers"("shop_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "behavioral_events_shop_id_idx" ON "behavioral_events"("shop_id");

-- CreateIndex
CREATE INDEX "behavioral_events_shop_id_timestamp_idx" ON "behavioral_events"("shop_id", "timestamp");

-- CreateIndex
CREATE INDEX "behavioral_events_shop_id_event_type_timestamp_idx" ON "behavioral_events"("shop_id", "event_type", "timestamp");

-- CreateIndex
CREATE INDEX "behavioral_events_shop_id_session_id_idx" ON "behavioral_events"("shop_id", "session_id");

-- CreateIndex
CREATE INDEX "orders_shop_id_idx" ON "orders"("shop_id");

-- CreateIndex
CREATE INDEX "orders_shop_id_created_at_idx" ON "orders"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_shop_id_shopify_order_id_key" ON "orders"("shop_id", "shopify_order_id");

-- CreateIndex
CREATE INDEX "recommendation_placements_shop_id_idx" ON "recommendation_placements"("shop_id");

-- CreateIndex
CREATE INDEX "recommendation_placements_shop_id_enabled_idx" ON "recommendation_placements"("shop_id", "enabled");

-- CreateIndex
CREATE INDEX "recommendation_logs_shop_id_idx" ON "recommendation_logs"("shop_id");

-- CreateIndex
CREATE INDEX "recommendation_logs_shop_id_impression_at_idx" ON "recommendation_logs"("shop_id", "impression_at");

-- CreateIndex
CREATE INDEX "recommendation_logs_shop_id_placement_id_impression_at_idx" ON "recommendation_logs"("shop_id", "placement_id", "impression_at");

-- CreateIndex
CREATE INDEX "product_embeddings_shop_id_idx" ON "product_embeddings"("shop_id");

-- CreateIndex
CREATE INDEX "ab_test_experiments_shop_id_idx" ON "ab_test_experiments"("shop_id");

-- CreateIndex
CREATE INDEX "ab_test_experiments_shop_id_status_idx" ON "ab_test_experiments"("shop_id", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_events" ADD CONSTRAINT "behavioral_events_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_events" ADD CONSTRAINT "behavioral_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavioral_events" ADD CONSTRAINT "behavioral_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_placements" ADD CONSTRAINT "recommendation_placements_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_logs" ADD CONSTRAINT "recommendation_logs_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "recommendation_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_experiments" ADD CONSTRAINT "ab_test_experiments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_test_experiments" ADD CONSTRAINT "ab_test_experiments_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "recommendation_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
