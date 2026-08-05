import type { BehavioralEventType } from "@prisma/client";

export const BEHAVIORAL_EVENT_TYPES: BehavioralEventType[] = [
  "product_view",
  "collection_view",
  "search",
  "add_to_cart",
  "remove_from_cart",
  "checkout_start",
  "purchase",
  "recommendation_impression",
  "recommendation_click",
];

export interface IncomingBehavioralEvent {
  eventType: string;
  sessionId: string;
  customerId?: string | null;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  shop?: string;
}

export interface EventBatchPayload {
  shop: string;
  events: IncomingBehavioralEvent[];
}

export type IngestionErrorCode =
  | "invalid_json"
  | "invalid_payload"
  | "shop_not_found"
  | "shop_inactive"
  | "cross_shop_injection"
  | "rate_limited"
  | "invalid_event_type"
  | "missing_session_id";

export interface IngestionResult {
  ok: boolean;
  inserted: number;
  rejected: number;
  error?: IngestionErrorCode;
  message?: string;
  retryAfterSec?: number;
}
