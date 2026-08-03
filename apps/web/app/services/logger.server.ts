type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  event: string;
  level?: LogLevel;
  shop?: string;
  shopId?: string;
  [key: string]: unknown;
}

export function logSyncEvent(payload: LogPayload) {
  const level = payload.level ?? "info";
  const entry = {
    ...payload,
    level,
    timestamp: new Date().toISOString(),
    component: "catalog-sync",
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(entry));
    return;
  }

  console.log(JSON.stringify(entry));
}
