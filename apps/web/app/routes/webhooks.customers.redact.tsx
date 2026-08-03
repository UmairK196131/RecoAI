import type { ActionFunctionArgs } from "@remix-run/node";
import { handleGdprCustomerRedactWebhook } from "../services/sync/gdpr-webhook-route.server";

export const action = (args: ActionFunctionArgs) => handleGdprCustomerRedactWebhook(args);
