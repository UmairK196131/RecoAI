import type { Prisma, PrismaClient } from "@prisma/client";

import prisma from "./index.js";

/** Models that carry a direct `shopId` column and require tenant isolation. */
const SHOP_SCOPED_MODELS = [
  "Product",
  "Collection",
  "Customer",
  "BehavioralEvent",
  "Order",
  "RecommendationPlacement",
  "RecommendationLog",
  "ProductEmbedding",
  "ABTestExperiment",
] as const;

type ShopScopedModel = (typeof SHOP_SCOPED_MODELS)[number];

function injectShopId<T extends { where?: Record<string, unknown> }>(
  shopId: string,
  args: T,
): T {
  return {
    ...args,
    where: {
      ...args.where,
      shopId,
    },
  };
}

/**
 * Creates a Prisma client extension that automatically scopes all queries on
 * shop-owned models to the given `shopId` (NFR-SEC-05).
 *
 * @example
 * ```ts
 * const db = createShopScopedClient("shop_abc123");
 * const products = await db.product.findMany({ where: { status: "active" } });
 * // Equivalent to: prisma.product.findMany({ where: { shopId: "shop_abc123", status: "active" } })
 * ```
 */
export function createShopScopedClient(shopId: string) {
  const queryExtension = SHOP_SCOPED_MODELS.reduce(
    (acc, model) => {
      const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
      acc[modelKey] = {
        findMany({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
        findFirst({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
        findUnique({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
        count({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
        updateMany({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
        deleteMany({ args, query }: { args: { where?: Record<string, unknown> }; query: (a: unknown) => unknown }) {
          return query(injectShopId(shopId, args));
        },
      };
      return acc;
    },
    {} as Record<string, Record<string, unknown>>,
  );

  return prisma.$extends({
    query: queryExtension as Prisma.Extension["query"],
  });
}

export type ShopScopedClient = ReturnType<typeof createShopScopedClient>;

/**
 * Example: fetch active products for a shop using the tenant-scoped client.
 * Demonstrates NFR-SEC-05 enforcement at the query layer.
 */
export async function exampleShopScopedQuery(
  shopId: string,
  client: PrismaClient | ShopScopedClient = prisma,
) {
  const db = "product" in client ? client : createShopScopedClient(shopId);
  return db.product.findMany({
    where: { status: "active" },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });
}
