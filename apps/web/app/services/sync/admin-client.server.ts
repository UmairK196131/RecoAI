import type { Session } from "@shopify/shopify-api";
import shopify, { sessionStorage } from "../../shopify.server";

export async function getOfflineSession(shopDomain: string): Promise<Session> {
  const sessions = await sessionStorage.findSessionsByShop(shopDomain);
  const offlineSession = sessions.find((s) => !s.isOnline) ?? sessions[0];
  if (!offlineSession) {
    throw new Error(`No Shopify session found for ${shopDomain}`);
  }
  return offlineSession;
}

export async function getAdminGraphqlClient(shopDomain: string) {
  const session = await getOfflineSession(shopDomain);
  return new shopify.api.clients.Graphql({ session });
}
