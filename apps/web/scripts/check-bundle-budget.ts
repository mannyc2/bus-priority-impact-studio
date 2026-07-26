// Deterministic JS bundle-size budget — the frontend perf guardrail. Real
// first-paint is measured in production via the RUM beacon (/api/v1/rum); this
// catches regressions at build time before they ship. Run after `vite build`.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

// Budgets in gzipped KB. Set with headroom over current sizes; tighten over time.
// `entry` = the eagerly-loaded main chunk that gates first paint.
// `totalJs` = every JS chunk, a backstop against overall bloat.
// Plan 081 remeasured 394.4 KB total after adding the lazy route-history,
// verified-provenance, and historical-map controls. The total cap moves from
// 390 -> 400 KB with modest headroom; the first-paint entry cap is unchanged.
// Plan 102 measured 400.0 KB before and 400.7 KB after the typed change-date
// module: the previous cap had no headroom left, so a 0.8 KB pure-function
// module could not land. The total cap moves 400 -> 410 KB to restore
// headroom; the first-paint entry cap is still unchanged at 138.4 KB actual.
const BUDGET_KB = { entry: 145, totalJs: 410 } as const;

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "client", "assets");

function gzipKb(path: string): number {
  return gzipSync(readFileSync(path)).length / 1024;
}

const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
if (jsFiles.length === 0) {
  console.error(`No JS assets found in ${assetsDir}. Run \`vite build\` first.`);
  process.exit(1);
}

const entryFile = jsFiles.find((name) => /^index-.*\.js$/.test(name));
const totalKb = jsFiles.reduce((sum, name) => sum + gzipKb(join(assetsDir, name)), 0);
const entryKb = entryFile === undefined ? 0 : gzipKb(join(assetsDir, entryFile));

const checks = [
  { label: `entry (${entryFile ?? "missing"})`, actual: entryKb, budget: BUDGET_KB.entry },
  { label: `total JS (${jsFiles.length} chunks)`, actual: totalKb, budget: BUDGET_KB.totalJs },
];

let failed = false;
for (const { label, actual, budget } of checks) {
  const status = actual > budget ? "OVER" : "ok";
  if (actual > budget) {
    failed = true;
  }
  console.log(`${status.padEnd(4)} ${label}: ${actual.toFixed(1)} KB gz / ${budget} KB budget`);
}

if (entryFile === undefined) {
  console.error("Could not find the index-*.js entry chunk.");
  process.exit(1);
}

if (failed) {
  console.error("\nBundle budget exceeded. Trim the bundle or raise the budget deliberately.");
  process.exit(1);
}

console.log("\nBundle within budget.");
