import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  parseServingRequestFromUrl,
  serveRecommendations,
} from "../services/recommendations/serving/serve.server";
import type { ServingResponse } from "../services/recommendations/serving/types.server";

function normalizeOriginHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedStorefrontOrigin(origin: string | null, shopDomain: string | null): boolean {
  if (!origin) return false;

  const host = normalizeOriginHost(origin);
  if (!host) return false;

  if (host.endsWith(".myshopify.com")) return true;

  if (shopDomain) {
    const shopHost = shopDomain.replace(/\.myshopify\.com$/, "");
    if (host === shopDomain || host === shopHost) return true;
  }

  return false;
}

function buildCorsHeaders(request: Request, shopDomain: string | null): HeadersInit {
  const origin = request.headers.get("Origin");
  if (!isAllowedStorefrontOrigin(origin, shopDomain)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonWithCors(
  data: unknown,
  init: ResponseInit & { corsHeaders?: HeadersInit },
) {
  const { corsHeaders = {}, ...responseInit } = init;
  const headers = new Headers(responseInit.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  // Storefront widgets hide on empty; short cache for intermediaries
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=30");
  }
  return json(data, { ...responseInit, headers });
}

function emptyServingBody(placement = "unknown"): ServingResponse {
  return {
    placement,
    product_id: null,
    strategy_used: "none",
    recommendations: [],
    generated_at: new Date().toISOString(),
    meta: { cache_hit: false, latency_ms: 0 },
  };
}

/**
 * GET /api/recommendations
 * Storefront Recommendation Serving API (FR-REC-02).
 * Never returns HTTP 500 — empty recommendations on failure (NFR-AVAIL-02).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request, null),
    });
  }

  if (request.method !== "GET") {
    return jsonWithCors(
      { ...emptyServingBody(), error: "Method not allowed" },
      { status: 405, corsHeaders: buildCorsHeaders(request, null) },
    );
  }

  const url = new URL(request.url);
  const parsed = parseServingRequestFromUrl(url);

  if ("error" in parsed) {
    // Invalid params → 200 with empty list so widgets hide cleanly
    return jsonWithCors(
      {
        ...emptyServingBody(),
        error: "invalid_request",
        message: parsed.error,
      },
      {
        status: 200,
        corsHeaders: buildCorsHeaders(request, null),
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const corsHeaders = buildCorsHeaders(request, parsed.shop);

  try {
    const result = await serveRecommendations(parsed);
    return jsonWithCors(result, { status: 200, corsHeaders });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "recommendation_api_unhandled_error",
        component: "recommendation-serving",
        level: "error",
        error: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      }),
    );
    return jsonWithCors(emptyServingBody(parsed.placementType), {
      status: 200,
      corsHeaders,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
