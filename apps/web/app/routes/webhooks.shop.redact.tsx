import type { ActionFunctionArgs } from "@remix-run/node";
import { handleGdprShopRedactWebhook } from "../services/sync/gdpr-webhook-route.server";

export const action = (args: ActionFunctionArgs) => handleGdprShopRedactWebhook(args);
