import type { ActionFunctionArgs } from "@remix-run/node";
import { handleOrderWebhook } from "../services/sync/order-webhook-route.server";

export const action = (args: ActionFunctionArgs) => handleOrderWebhook(args);
