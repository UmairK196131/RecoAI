-- Sprint 10: collaborative filtering co-purchase scores, association rules, model registry

CREATE TYPE "model_registry_status" AS ENUM ('active', 'archived', 'rolled_back');

CREATE TABLE "co_purchase_scores" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "source_product_id" TEXT NOT NULL,
    "target_product_id" TEXT NOT NULL,
    "co_occurrence" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "co_purchase_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "co_purchase_scores_shop_id_source_product_id_target_product_id_key"
  ON "co_purchase_scores"("shop_id", "source_product_id", "target_product_id");

CREATE INDEX "co_purchase_scores_shop_id_source_product_id_score_idx"
  ON "co_purchase_scores"("shop_id", "source_product_id", "score" DESC);

CREATE INDEX "co_purchase_scores_shop_id_idx" ON "co_purchase_scores"("shop_id");

ALTER TABLE "co_purchase_scores"
  ADD CONSTRAINT "co_purchase_scores_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "co_purchase_scores"
  ADD CONSTRAINT "co_purchase_scores_source_product_id_fkey"
  FOREIGN KEY ("source_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "co_purchase_scores"
  ADD CONSTRAINT "co_purchase_scores_target_product_id_fkey"
  FOREIGN KEY ("target_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "association_rules" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "antecedent_product_ids" TEXT[] NOT NULL,
    "consequent_product_ids" TEXT[] NOT NULL,
    "support" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lift" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "association_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "association_rules_shop_id_confidence_idx"
  ON "association_rules"("shop_id", "confidence" DESC);

CREATE INDEX "association_rules_shop_id_idx" ON "association_rules"("shop_id");

ALTER TABLE "association_rules"
  ADD CONSTRAINT "association_rules_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "model_registry" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "model_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "model_registry_status" NOT NULL DEFAULT 'active',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "artifact_meta" JSONB NOT NULL DEFAULT '{}',
    "trained_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_registry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "model_registry_shop_id_model_type_status_idx"
  ON "model_registry"("shop_id", "model_type", "status");

CREATE INDEX "model_registry_model_type_version_idx"
  ON "model_registry"("model_type", "version");

ALTER TABLE "model_registry"
  ADD CONSTRAINT "model_registry_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
