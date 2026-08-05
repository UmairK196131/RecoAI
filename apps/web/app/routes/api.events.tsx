import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { ingestBehavioralEvents } from "../services/events/ingest.server";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonWithCors(
  data: unknown,
  init: ResponseInit & { corsHeaders?: HeadersInit },
) {
  const headers = new Headers(init.headers);
  const corsHeaders = init.corsHeaders ?? {};
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return json(data, { ...init, headers });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(request, null),
    });
  }

  return jsonWithCors({ error: "Method not allowed" }, { status: 405, corsHeaders: buildCorsHeaders(request, null) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const corsHeaders = buildCorsHeaders(request, null);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonWithCors({ error: "Method not allowed" }, { status: 405, corsHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors(
      { ok: false, error: "invalid_json", message: "Invalid JSON body" },
      { status: 400, corsHeaders },
    );
  }

  const shopDomain =
    body && typeof body === "object" && "shop" in body && typeof (body as { shop: unknown }).shop === "string"
      ? (body as { shop: string }).shop.toLowerCase()
      : null;

  const responseCors = buildCorsHeaders(request, shopDomain);

  const result = await ingestBehavioralEvents(body);

  if (!result.ok) {
    const status =
      result.error === "rate_limited"
        ? 429
        : result.error === "shop_not_found" || result.error === "shop_inactive"
          ? 404
          : 400;

    const headers: HeadersInit = { ...responseCors };
    if (result.retryAfterSec) {
      (headers as Record<string, string>)["Retry-After"] = String(result.retryAfterSec);
    }

    return jsonWithCors(result, { status, corsHeaders: headers });
  }

  return jsonWithCors(result, { status: 201, corsHeaders: responseCors });
};
