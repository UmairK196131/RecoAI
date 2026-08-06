-- Sprint 9: trending scores for cold-start / best-seller rankings
CREATE TABLE "trending_scores" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "order_volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "view_count" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sales_velocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trending_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trending_scores_product_id_key" ON "trending_scores"("product_id");

CREATE INDEX "trending_scores_shop_id_score_idx" ON "trending_scores"("shop_id", "score" DESC);

CREATE INDEX "trending_scores_shop_id_idx" ON "trending_scores"("shop_id");

ALTER TABLE "trending_scores" ADD CONSTRAINT "trending_scores_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trending_scores" ADD CONSTRAINT "trending_scores_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
