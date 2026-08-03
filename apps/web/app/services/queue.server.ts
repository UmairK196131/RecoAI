import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

const SYNC_QUEUE_NAME = "catalog-sync";

let redisConnection: IORedis | null = null;
let syncQueue: Queue | null = null;

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for catalog sync queue");
  }
  return url;
}

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: null,
    });
  }
  return redisConnection;
}

export function getRedisConnectionOptions(): ConnectionOptions {
  return getRedisConnection() as unknown as ConnectionOptions;
}

export function getSyncQueue(): Queue {
  if (!syncQueue) {
    syncQueue = new Queue(SYNC_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return syncQueue;
}

export { SYNC_QUEUE_NAME };
