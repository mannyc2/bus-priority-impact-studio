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
// totalJs raised 300 -> 430 for the Recharts charting library (~95 KB gz),
// which is code-split into a lazy chunk and never loaded at first paint
// (entry budget unchanged). See components/ui/chart.tsx + HourBars/HourOverlay.
// totalJs raised 430 -> 485 for the brief-prose markdown stack (react-markdown +
// remark-gfm/-directive, ~54 KB gz in the lazy BriefProse chunk), loaded only on
// brief surfaces, never at first paint (entry budget unchanged). Real recovery of
// the route-detail chunk is deferred to the frontend §8.1 registry-driven splits;
// see hard-cutover-dossier-contract.md C0 + frontend-goal §11-P0.
const BUDGET_KB = { entry: 165, totalJs: 485 } as const;

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
