/**
 * Windows-safe Prisma generate.
 * Default `prisma generate` often fails with EPERM when query_engine-windows.dll.node
 * is locked by a running Node process. We generate to a temp output dir, then copy
 * client artifacts into node_modules/.prisma/client (skipping a locked engine DLL).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");
const schemaPath = path.join(packageRoot, "prisma", "schema.prisma");
const tmpSchemaPath = path.join(packageRoot, "prisma", "schema.gen-tmp.prisma");
const generatedDir = path.join(packageRoot, "generated", "prisma");
const clientDir = path.join(repoRoot, "node_modules", ".prisma", "client");

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
    return { skippedEngine: false };
  }

  const base = path.basename(from);
  try {
    fs.copyFileSync(from, to);
    return { skippedEngine: false };
  } catch (error) {
    if (base.startsWith("query_engine")) {
      console.warn(
        `[db:generate] skipped locked engine file ${base}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { skippedEngine: true };
    }
    throw error;
  }
}

function run() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  if (!schema.includes('provider = "prisma-client-js"')) {
    throw new Error("Unexpected Prisma generator block");
  }

  const tmpSchema = schema.replace(
    'provider = "prisma-client-js"',
    'provider = "prisma-client-js"\n  output   = "../generated/prisma"',
  );
  fs.writeFileSync(tmpSchemaPath, tmpSchema, "utf8");

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "generate", `--schema=${tmpSchemaPath}`],
    {
      cwd: packageRoot,
      stdio: "inherit",
      shell: true,
      env: process.env,
    },
  );

  fs.rmSync(tmpSchemaPath, { force: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  fs.mkdirSync(clientDir, { recursive: true });

  let skippedEngine = false;
  for (const entry of fs.readdirSync(generatedDir)) {
    const resultCopy = copyRecursive(
      path.join(generatedDir, entry),
      path.join(clientDir, entry),
    );
    if (resultCopy.skippedEngine) skippedEngine = true;
  }

  // Clean stale tmp engine files left by failed native generates.
  for (const entry of fs.readdirSync(clientDir)) {
    if (entry.includes(".tmp")) {
      try {
        fs.rmSync(path.join(clientDir, entry), { force: true });
      } catch {
        // ignore
      }
    }
  }

  if (skippedEngine) {
    console.warn(
      "[db:generate] Prisma client JS updated; engine DLL remained locked (safe if a Node process holds it).",
    );
  } else {
    console.log("[db:generate] Prisma client generated successfully.");
  }
}

run();
