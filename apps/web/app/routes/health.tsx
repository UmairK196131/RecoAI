import { json } from "@remix-run/node";
import db from "../db.server";
import { ensureSyncWorkerStarted } from "../services/sync/worker.server";

export const loader = async () => {
  ensureSyncWorkerStarted();
  try {
    await db.$queryRaw`SELECT 1`;
    return json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "health_check_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    return json({ status: "error" }, { status: 503 });
  }
};
