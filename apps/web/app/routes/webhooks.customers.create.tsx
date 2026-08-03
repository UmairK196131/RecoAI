import type { ActionFunctionArgs } from "@remix-run/node";
import { handleCustomerWebhook } from "../services/sync/customer-webhook-route.server";

export const action = (args: ActionFunctionArgs) => handleCustomerWebhook(args);
