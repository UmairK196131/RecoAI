import type { Prisma } from "@prisma/client";
import db from "../../db.server";

export const MODEL_TYPE_COLLABORATIVE_FILTERING = "collaborative_filtering";
export const MODEL_TYPE_ASSOCIATION_RULES = "association_rules";

export function buildModelVersion(
  modelType: string,
  mode: "incremental" | "full" | "daily",
  at: Date = new Date(),
): string {
  const stamp = at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${modelType}-${mode}-${stamp}`;
}

/**
 * Register a newly trained model and mark it active; archive prior active versions
 * for the same shop + model type (NFR-MAINT-02).
 */
export async function registerAndActivateModel(params: {
  shopId: string;
  modelType: string;
  version: string;
  metrics?: Prisma.InputJsonValue;
  artifactMeta?: Prisma.InputJsonValue;
  trainedAt?: Date;
}): Promise<{ id: string; version: string }> {
  const trainedAt = params.trainedAt ?? new Date();

  await db.modelRegistryEntry.updateMany({
    where: {
      shopId: params.shopId,
      modelType: params.modelType,
      status: "active",
    },
    data: { status: "archived" },
  });

  const entry = await db.modelRegistryEntry.create({
    data: {
      shopId: params.shopId,
      modelType: params.modelType,
      version: params.version,
      status: "active",
      metrics: params.metrics ?? {},
      artifactMeta: params.artifactMeta ?? {},
      trainedAt,
      activatedAt: trainedAt,
    },
  });

  return { id: entry.id, version: entry.version };
}

/** Roll back to a previous version by id (archives current active). */
export async function rollbackModelVersion(
  shopId: string,
  modelType: string,
  version: string,
): Promise<{ id: string; version: string } | null> {
  const target = await db.modelRegistryEntry.findFirst({
    where: { shopId, modelType, version },
  });
  if (!target) return null;

  await db.modelRegistryEntry.updateMany({
    where: { shopId, modelType, status: "active" },
    data: { status: "rolled_back" },
  });

  const activated = await db.modelRegistryEntry.update({
    where: { id: target.id },
    data: { status: "active", activatedAt: new Date() },
  });

  return { id: activated.id, version: activated.version };
}

export async function getActiveModelVersion(
  shopId: string,
  modelType: string,
): Promise<string | null> {
  const entry = await db.modelRegistryEntry.findFirst({
    where: { shopId, modelType, status: "active" },
    orderBy: { activatedAt: "desc" },
    select: { version: true },
  });
  return entry?.version ?? null;
}
