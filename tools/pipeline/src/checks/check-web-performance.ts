import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { PUBLIC_STUDIO_ROUTES } from "../../../../apps/web/src/studio/seo.js";

const distRoot = "apps/web/dist/client";
const indexPath = `${distRoot}/index.html`;
const auditDir = process.env["BP_WEB_AUDIT_DIR"] ?? "data/artifacts/web-audits/latest";

const budgets = {
  mainAppChunkGzipBytes: 325 * 1024,
  initialJsGzipBytes: 160 * 1024,
  initialCssGzipBytes: 32 * 1024,
  maxSingleLazyChunkGzipBytes: 48 * 1024,
} as const;

const lighthouseThresholds = {
  performance: 0.95,
  accessibility: 0.95,
  bestPractices: 0.95,
  seo: 1,
} as const;

type AssetSummary = {
  path: string;
  bytes: number;
  gzipBytes: number;
  initial: boolean;
};

type LighthouseRouteSummary = {
  path: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
};

const failures: string[] = [];
const indexFile = Bun.file(indexPath);

if (!(await indexFile.exists())) {
  failures.push(`${indexPath} is missing; run bun --filter @bp/web build first.`);
} else {
  const indexHtml = await indexFile.text();
  const initialAssetPaths = extractInitialAssetPaths(indexHtml);
  const assets = await summarizeAssets(initialAssetPaths);
  const jsAssets = assets.filter((asset) => asset.path.endsWith(".js"));
  const cssAssets = assets.filter((asset) => asset.path.endsWith(".css"));
  const initialJsGzipBytes = sum(
    jsAssets.filter((asset) => asset.initial),
    "gzipBytes",
  );
  const initialCssGzipBytes = sum(
    cssAssets.filter((asset) => asset.initial),
    "gzipBytes",
  );
  const mainAppChunk = jsAssets
    .filter((asset) => basename(asset.path).startsWith("index-"))
    .toSorted((left, right) => right.gzipBytes - left.gzipBytes)[0];
  const largestLazyChunk = jsAssets
    .filter((asset) => !asset.initial)
    .toSorted((left, right) => right.gzipBytes - left.gzipBytes)[0];
  const lighthouse = await maybeRunLighthouse();

  if (mainAppChunk === undefined) {
    failures.push("main app chunk was not found");
  } else if (mainAppChunk.gzipBytes > budgets.mainAppChunkGzipBytes) {
    failures.push(
      `${mainAppChunk.path}: gzip ${mainAppChunk.gzipBytes} exceeds main app budget ${budgets.mainAppChunkGzipBytes}`,
    );
  }

  if (initialJsGzipBytes > budgets.initialJsGzipBytes) {
    failures.push(
      `initial JS gzip ${initialJsGzipBytes} exceeds budget ${budgets.initialJsGzipBytes}`,
    );
  }

  if (initialCssGzipBytes > budgets.initialCssGzipBytes) {
    failures.push(
      `initial CSS gzip ${initialCssGzipBytes} exceeds budget ${budgets.initialCssGzipBytes}`,
    );
  }

  if (
    largestLazyChunk !== undefined &&
    largestLazyChunk.gzipBytes > budgets.maxSingleLazyChunkGzipBytes
  ) {
    failures.push(
      `${largestLazyChunk.path}: gzip ${largestLazyChunk.gzipBytes} exceeds lazy chunk budget ${budgets.maxSingleLazyChunkGzipBytes}`,
    );
  }

  mkdirSync(auditDir, { recursive: true });
  await Bun.write(
    `${auditDir}/performance-budget.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        routeCount: PUBLIC_STUDIO_ROUTES.length,
        budgets,
        initialJsGzipBytes,
        initialCssGzipBytes,
        mainAppChunk,
        largestLazyChunk,
        assets,
        lighthouse,
        passed: failures.length === 0,
      },
      null,
      2,
    ),
  );
}

if (failures.length > 0) {
  console.error(
    ["web performance check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
  );
  process.exit(1);
}

console.log(`web performance check passed (${PUBLIC_STUDIO_ROUTES.length} route budget matrix)`);

function extractInitialAssetPaths(html: string): Set<string> {
  const paths = new Set<string>();
  const pattern = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g;

  for (const match of html.matchAll(pattern)) {
    if (match[1]) {
      paths.add(match[1]);
    }
  }

  return paths;
}

async function summarizeAssets(initialAssetPaths: Set<string>): Promise<AssetSummary[]> {
  const glob = new Bun.Glob("assets/*.{js,css}");
  const summaries: AssetSummary[] = [];

  for await (const relativePath of glob.scan({ cwd: distRoot, onlyFiles: true })) {
    const path = `${distRoot}/${relativePath}`;
    const bytes = await Bun.file(path).arrayBuffer();
    const publicPath = `/${relativePath}`;

    summaries.push({
      path: publicPath,
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(Buffer.from(bytes)).byteLength,
      initial: initialAssetPaths.has(publicPath),
    });
  }

  return summaries.toSorted((left, right) => left.path.localeCompare(right.path));
}

async function maybeRunLighthouse(): Promise<{
  status: "skipped" | "passed" | "failed";
  reason?: string;
  routes?: LighthouseRouteSummary[];
}> {
  if (process.env["BP_RUN_LIGHTHOUSE"] !== "1") {
    return {
      status: "skipped",
      reason: "Set BP_RUN_LIGHTHOUSE=1 and BP_LIGHTHOUSE_URL to collect Lighthouse JSON.",
    };
  }

  const baseUrl = process.env["BP_LIGHTHOUSE_URL"];
  if (!baseUrl) {
    failures.push("BP_RUN_LIGHTHOUSE=1 requires BP_LIGHTHOUSE_URL.");
    return { status: "failed", reason: "missing BP_LIGHTHOUSE_URL" };
  }

  const chrome =
    process.env["CHROME_PATH"] ?? (await firstExecutable(["google-chrome", "chromium"]));
  if (chrome === null) {
    failures.push("BP_RUN_LIGHTHOUSE=1 requires Chrome or CHROME_PATH.");
    return { status: "failed", reason: "missing Chrome executable" };
  }

  const lighthouseRoutes: LighthouseRouteSummary[] = [];

  for (const route of PUBLIC_STUDIO_ROUTES) {
    const url = new URL(route.path, baseUrl).toString();
    const outputPath = `${auditDir}/${route.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.lighthouse.json`;
    const proc = Bun.spawn({
      cmd: [
        "bunx",
        "lighthouse",
        url,
        "--quiet",
        "--preset=desktop",
        "--output=json",
        `--output-path=${outputPath}`,
        `--chrome-flags=--headless --no-sandbox`,
      ],
      env: { ...process.env, CHROME_PATH: chrome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      failures.push(`Lighthouse failed for ${route.path}: ${stderr.trim()}`);
      return { status: "failed", reason: `failed on ${route.path}` };
    }

    const summary = await readLighthouseSummary(route.path, outputPath);
    lighthouseRoutes.push(summary);
    if (summary.performance < lighthouseThresholds.performance) {
      failures.push(
        `Lighthouse performance ${summary.performance} for ${route.path} is below ${lighthouseThresholds.performance}`,
      );
    }
    if (summary.accessibility < lighthouseThresholds.accessibility) {
      failures.push(
        `Lighthouse accessibility ${summary.accessibility} for ${route.path} is below ${lighthouseThresholds.accessibility}`,
      );
    }
    if (summary.bestPractices < lighthouseThresholds.bestPractices) {
      failures.push(
        `Lighthouse best-practices ${summary.bestPractices} for ${route.path} is below ${lighthouseThresholds.bestPractices}`,
      );
    }
    if (summary.seo < lighthouseThresholds.seo) {
      failures.push(
        `Lighthouse SEO ${summary.seo} for ${route.path} is below ${lighthouseThresholds.seo}`,
      );
    }
  }

  return { status: failures.length === 0 ? "passed" : "failed", routes: lighthouseRoutes };
}

async function firstExecutable(names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    const proc = Bun.spawn({
      cmd: ["bash", "-lc", `command -v ${name}`],
      stdout: "pipe",
      stderr: "ignore",
    });
    if ((await proc.exited) === 0) {
      const path = (await new Response(proc.stdout).text()).trim();
      if (path.length > 0) {
        return path;
      }
    }
  }

  return null;
}

async function readLighthouseSummary(
  path: string,
  outputPath: string,
): Promise<LighthouseRouteSummary> {
  const report = (await Bun.file(outputPath).json()) as {
    categories?: {
      performance?: { score?: number | null };
      accessibility?: { score?: number | null };
      "best-practices"?: { score?: number | null };
      seo?: { score?: number | null };
    };
  };

  return {
    path,
    performance: report.categories?.performance?.score ?? 0,
    accessibility: report.categories?.accessibility?.score ?? 0,
    bestPractices: report.categories?.["best-practices"]?.score ?? 0,
    seo: report.categories?.seo?.score ?? 0,
  };
}

function sum(items: readonly AssetSummary[], key: "bytes" | "gzipBytes"): number {
  return items.reduce((total, item) => total + item[key], 0);
}
