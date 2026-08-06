#!/usr/bin/env node
/**
 * Minifies reco-theme storefront scripts and reports gzipped sizes.
 * reco-track.js must stay < 15KB gzipped (NFR-PERF-02).
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(__dirname, "../../extensions/reco-theme");
const srcDir = join(__dirname, "src");
const assetsDir = join(extensionRoot, "assets");
const MAX_TRACK_GZIP_BYTES = 15 * 1024;

const entries = [
  {
    name: "reco-track.js",
    src: join(srcDir, "reco-track.js"),
    out: join(assetsDir, "reco-track.js"),
    maxGzip: MAX_TRACK_GZIP_BYTES,
  },
  {
    name: "reco-widget.js",
    src: join(srcDir, "reco-widget.js"),
    out: join(assetsDir, "reco-widget.js"),
    maxGzip: null,
  },
];

for (const entry of entries) {
  await build({
    entryPoints: [entry.src],
    outfile: entry.out,
    bundle: true,
    minify: true,
    target: ["es2018"],
    legalComments: "none",
  });

  const raw = readFileSync(entry.out);
  const gzipped = gzipSync(raw);
  const gzipKb = (gzipped.length / 1024).toFixed(2);

  console.log(
    `${entry.name}: ${raw.length} bytes raw, ${gzipped.length} bytes gzipped (${gzipKb} KB)`,
  );

  if (entry.maxGzip != null && gzipped.length > entry.maxGzip) {
    console.error(`ERROR: ${entry.name} exceeds ${entry.maxGzip} bytes gzipped limit`);
    process.exit(1);
  }
}

console.log(`OK: Extension bundles built`);
