import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const prisma = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export { PrismaClient };
export { encryptField, decryptField } from "./encryption.js";
export {
  createShopScopedClient,
  exampleShopScopedQuery,
  type ShopScopedClient,
} from "./tenant.js";
export default prisma;
