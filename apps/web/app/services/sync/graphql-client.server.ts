import { logSyncEvent } from "../logger.server";
import type { GraphQLCostExtensions } from "./types";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

interface GraphqlClientLike {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  extensions?: GraphQLCostExtensions;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getThrottleDelay(extensions?: GraphQLCostExtensions): number {
  const throttle = extensions?.throttleStatus;
  if (!throttle) return 0;

  const { currentlyAvailable, restoreRate, requestedQueryCost } = {
    currentlyAvailable: throttle.currentlyAvailable,
    restoreRate: throttle.restoreRate,
    requestedQueryCost: extensions.requestedQueryCost ?? 1,
  };

  if (currentlyAvailable >= requestedQueryCost) {
    return 0;
  }

  const deficit = requestedQueryCost - currentlyAvailable;
  return Math.ceil((deficit / restoreRate) * 1000) + 100;
}

export async function graphqlRequest<T>(
  client: GraphqlClientLike,
  query: string,
  variables?: Record<string, unknown>,
  shopDomain?: string,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const httpResponse = await client.graphql(query, { variables });
      const response = (await httpResponse.json()) as GraphQLResponse<T>;

      if (response.errors?.length) {
        const throttled = response.errors.some((e) =>
          /throttl|rate.?limit|cost/i.test(e.message),
        );
        if (throttled && attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * 2 ** attempt;
          logSyncEvent({
            event: "graphql_throttle_backoff",
            shop: shopDomain,
            attempt: attempt + 1,
            delayMs: delay,
            level: "warn",
          });
          await sleep(delay);
          continue;
        }
        throw new Error(response.errors.map((e) => e.message).join("; "));
      }

      const throttleDelay = getThrottleDelay(response.extensions);
      if (throttleDelay > 0) {
        logSyncEvent({
          event: "graphql_cost_throttle_wait",
          shop: shopDomain,
          delayMs: throttleDelay,
          currentlyAvailable: response.extensions?.throttleStatus?.currentlyAvailable,
        });
        await sleep(throttleDelay);
      }

      if (!response.data) {
        throw new Error("GraphQL response missing data");
      }

      return response.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message;
      const isRetryable =
        /throttl|rate.?limit|429|ECONNRESET|ETIMEDOUT|503/i.test(message);

      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        logSyncEvent({
          event: "graphql_retry",
          shop: shopDomain,
          attempt: attempt + 1,
          delayMs: delay,
          error: message,
          level: "warn",
        });
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("GraphQL request failed");
}
