import { loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(appDir, "../..");

const env = loadEnv("test", monorepoRoot, "");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: env.DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    },
  },
});
