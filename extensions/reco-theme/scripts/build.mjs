#!/usr/bin/env node
/**
 * Minifies reco-track.js and reports gzipped bundle size (NFR-PERF-02: < 15KB).
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "src", "reco-track.js");
const out = join(root, "assets", "reco-track.js");
const MAX_GZIP_BYTES = 15 * 1024;

await build({
  entryPoints: [src],
  outfile: out,
  bundle: true,
  minify: true,
  target: ["es2018"],
  legalComments: "none",
});

const raw = readFileSync(out);
const gzipped = gzipSync(raw);
const gzipKb = (gzipped.length / 1024).toFixed(2);

console.log(`reco-track.js: ${raw.length} bytes raw, ${gzipped.length} bytes gzipped (${gzipKb} KB)`);

if (gzipped.length > MAX_GZIP_BYTES) {
  console.error(`ERROR: Bundle exceeds ${MAX_GZIP_BYTES} bytes gzipped limit`);
  process.exit(1);
}

console.log(`OK: Bundle within ${MAX_GZIP_BYTES / 1024} KB gzipped limit`);
