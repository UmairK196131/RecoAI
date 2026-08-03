import type { ActionFunctionArgs } from "@remix-run/node";
import { handleGdprDataRequestWebhook } from "../services/sync/gdpr-webhook-route.server";

export const action = (args: ActionFunctionArgs) => handleGdprDataRequestWebhook(args);
