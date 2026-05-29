import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { Glob } from "bun";
import { defineCommand, z } from "@liche/core";
import {
  type CloudflareCostSummary,
  estimateR2StandardCost,
} from "../../lib/cloudflare-costs.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import {
  collectD1ArtifactKeys,
  collectManifestArtifactKeys,
} from "./publish-artifact-keys.ts";

const DEFAULT_PREFIXES = ["map", "studio", "source-availability", "pipeline-v1"] as const;
const DEFAULT_MANIFEST_DIRS = ["briefs", "evaluations", "map"] as const;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS_BASE = 5_000;

export type S3Driver = {
  tracksRemoteCosts?: boolean;
  stat(key: string): Promise<{ size: number; etag: string } | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
};

export type PublishR2Options = {
  month: string;
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  concurrency: number;
  maxAttempts: number;
  backoffMsBase: number;
  prefixes: readonly string[];
  manifestDirs: readonly string[];
  d1SchemaPath: string;
  d1SeedPath: string;
  artifactRoot: string;
  outputPath: string;
  dryRun: boolean;
  force: boolean;
  driver?: S3Driver | undefined;
};

type UploadItem = { key: string; localPath: string };
type ItemOutcome = "uploaded" | "skipped" | "failed" | "dry-run";

export type PublishR2Report = {
  schemaVersion: 1;
  month: string;
  bucket: string;
  generatedAt: string;
  status: "pass" | "fail";
  candidateCount: number;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  dryRunCount: number;
  candidateByteCount: number;
  uploadedByteCount: number;
  skippedByteCount: number;
  dryRunByteCount: number;
  r2ClassBOperationCount: number;
  cost: {
    actual: CloudflareCostSummary;
    projectedExecute: CloudflareCostSummary;
  };
  failed: Array<{ key: string; error: string }>;
  outputPath: string;
};

type Counters = {
  uploaded: number;
  skipped: number;
  failed: number;
  dryRun: number;
  candidateBytes: number;
  uploadedBytes: number;
  skippedBytes: number;
  dryRunBytes: number;
  headOperations: number;
};

function contentTypeFor(key: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".geojson")) return "application/geo+json";
  if (key.endsWith(".pbf")) return "application/x-protobuf";
  if (key.endsWith(".pmtiles")) return "application/vnd.pmtiles";
  if (key.endsWith(".csv")) return "text/csv";
  if (key.endsWith(".txt") || key.endsWith(".md")) return "text/plain; charset=utf-8";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function md5Hex(body: Uint8Array): string {
  return createHash("md5").update(body).digest("hex");
}

function normalizeEtag(etag: string): string {
  return etag.replace(/^"|"$/g, "").toLowerCase();
}

async function collectPrefixKeys(
  artifactRoot: string,
  prefixes: readonly string[],
): Promise<string[]> {
  const keys = new Set<string>();
  for (const prefix of prefixes) {
    const root = join(artifactRoot, prefix);
    try {
      await stat(root);
    } catch {
      continue;
    }
    const glob = new Glob("**/*");
    for await (const rel of glob.scan({ cwd: root, onlyFiles: true, dot: false })) {
      keys.add(`${prefix}/${rel.split(sep).join("/")}`);
    }
  }
  return [...keys];
}

async function collectCandidates(options: PublishR2Options): Promise<UploadItem[]> {
  const [manifestKeys, d1Keys, prefixKeys] = await Promise.all([
    collectManifestArtifactKeys({
      artifactRoot: options.artifactRoot,
      manifestDirs: options.manifestDirs,
      month: options.month,
    }),
    collectD1ArtifactKeys({
      month: options.month,
      schemaPath: options.d1SchemaPath,
      seedPath: options.d1SeedPath,
    }),
    collectPrefixKeys(options.artifactRoot, options.prefixes),
  ]);
  const merged = new Set<string>([...manifestKeys.keys, ...d1Keys.keys, ...prefixKeys]);
  return [...merged].sort().map((key) => ({ key, localPath: join(options.artifactRoot, key) }));
}

function makeBunDriver(options: PublishR2Options): S3Driver {
  const bunRuntime = (globalThis as unknown as { Bun?: { S3Client: new (cfg: object) => unknown } })
    .Bun;
  if (!bunRuntime?.S3Client) {
    throw new Error("Bun.S3Client is required to publish; run with `bun run` not `node`.");
  }
  type S3FileLike = {
    stat(): Promise<{ size: number; etag?: string } | undefined>;
    write(data: Uint8Array, opts?: { type?: string }): Promise<number>;
  };
  type S3ClientLike = { file(key: string): S3FileLike };
  const client = new bunRuntime.S3Client({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    endpoint: options.endpoint,
    bucket: options.bucket,
    region: "auto",
  }) as S3ClientLike;
  return {
    tracksRemoteCosts: true,
    async stat(key) {
      try {
        const meta = await client.file(key).stat();
        if (!meta) return null;
        return { size: meta.size, etag: typeof meta.etag === "string" ? meta.etag : "" };
      } catch (err) {
        const status = (err as { status?: number; code?: string })?.status;
        const code = (err as { status?: number; code?: string })?.code;
        if (status === 404 || code === "NoSuchKey" || code === "ENOENT") return null;
        throw err;
      }
    },
    async put(key, body, contentType) {
      await client.file(key).write(body, { type: contentType });
    },
  };
}

function makeNoopDriver(): S3Driver {
  return {
    tracksRemoteCosts: false,
    async stat() {
      return null;
    },
    async put() {
      throw new Error("noop driver cannot put; this is a dry-run-only stub");
    },
  };
}

async function uploadOne(
  item: UploadItem,
  options: PublishR2Options,
  driver: S3Driver,
): Promise<{ outcome: ItemOutcome; error?: string; byteLength: number; headOperations: number }> {
  let body: Uint8Array;
  try {
    body = await readFile(item.localPath);
  } catch (err) {
    return {
      outcome: "failed",
      error: `local read failed: ${(err as Error).message}`,
      byteLength: 0,
      headOperations: 0,
    };
  }

  const statHeadOperations = !options.force && driver.tracksRemoteCosts !== false ? 1 : 0;
  if (!options.force) {
    let remote: Awaited<ReturnType<S3Driver["stat"]>>;
    try {
      remote = await driver.stat(item.key);
    } catch (err) {
      return {
        outcome: "failed",
        error: `head failed: ${(err as Error).message}`,
        byteLength: body.byteLength,
        headOperations: statHeadOperations,
      };
    }
    if (remote && remote.size === body.byteLength) {
      const remoteEtag = normalizeEtag(remote.etag);
      const localMd5 = md5Hex(body);
      if (remoteEtag.length === 0 || remoteEtag === localMd5) {
        return {
          outcome: "skipped",
          byteLength: body.byteLength,
          headOperations: statHeadOperations,
        };
      }
    }
  }

  if (options.dryRun) {
    return { outcome: "dry-run", byteLength: body.byteLength, headOperations: statHeadOperations };
  }

  const contentType = contentTypeFor(item.key);
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      await driver.put(item.key, body, contentType);
      return {
        outcome: "uploaded",
        byteLength: body.byteLength,
        headOperations: statHeadOperations,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt === options.maxAttempts) break;
      const backoffMs = attempt * options.backoffMsBase;
      console.error(
        `publish-r2: retrying ${item.key} in ${backoffMs}ms (attempt ${attempt}/${options.maxAttempts}, ${lastError.message})`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  return {
    outcome: "failed",
    error: lastError?.message ?? "unknown",
    byteLength: body.byteLength,
    headOperations: statHeadOperations,
  };
}

export async function runPublishR2Artifacts(options: PublishR2Options): Promise<PublishR2Report> {
  const driver =
    options.driver ??
    (options.dryRun && (options.accessKeyId.length === 0 || options.secretAccessKey.length === 0)
      ? makeNoopDriver()
      : makeBunDriver(options));
  const candidates = await collectCandidates(options);
  const counters: Counters = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    dryRun: 0,
    candidateBytes: 0,
    uploadedBytes: 0,
    skippedBytes: 0,
    dryRunBytes: 0,
    headOperations: 0,
  };
  const failed: Array<{ key: string; error: string }> = [];

  console.error(
    `publish-r2 ${options.month}: ${candidates.length} candidate key${candidates.length === 1 ? "" : "s"} (concurrency=${options.concurrency}${options.dryRun ? ", dry-run" : ""}${options.force ? ", force" : ""})`,
  );

  let cursor = 0;
  let lastLoggedAt = Date.now();

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= candidates.length) return;
      const item = candidates[index];
      if (item === undefined) return;
      const result = await uploadOne(item, options, driver);
      counters.candidateBytes += result.byteLength;
      counters.headOperations += result.headOperations;
      switch (result.outcome) {
        case "uploaded":
          counters.uploaded += 1;
          counters.uploadedBytes += result.byteLength;
          break;
        case "skipped":
          counters.skipped += 1;
          counters.skippedBytes += result.byteLength;
          break;
        case "dry-run":
          counters.dryRun += 1;
          counters.dryRunBytes += result.byteLength;
          break;
        case "failed":
          counters.failed += 1;
          failed.push({ key: item.key, error: result.error ?? "unknown" });
          console.error(`publish-r2: FAILED ${item.key}: ${result.error ?? "unknown"}`);
          break;
      }
      const done = counters.uploaded + counters.skipped + counters.failed + counters.dryRun;
      const now = Date.now();
      if (done === candidates.length || now - lastLoggedAt > 5_000) {
        lastLoggedAt = now;
        console.error(
          `publish-r2: ${done}/${candidates.length} (uploaded=${counters.uploaded} skipped=${counters.skipped} failed=${counters.failed}${counters.dryRun > 0 ? ` dry-run=${counters.dryRun}` : ""})`,
        );
      }
    }
  };

  const workerCount = Math.min(options.concurrency, Math.max(candidates.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const uploadedGb = counters.uploadedBytes / 1024 ** 3;
  const dryRunGb = counters.dryRunBytes / 1024 ** 3;
  const actualCost = estimateR2StandardCost(
    {
      classAOperations: options.dryRun ? 0 : counters.uploaded,
      classBOperations: counters.headOperations,
      storageGbMonth: options.dryRun ? 0 : uploadedGb,
    },
    [
      "R2 release publishing uses Standard storage.",
      "Idempotency checks use HEAD requests, which are R2 Class B operations when remote credentials are used.",
    ],
  );
  const projectedExecuteCost = estimateR2StandardCost(
    {
      classAOperations: options.dryRun ? counters.dryRun : counters.uploaded,
      classBOperations: counters.headOperations,
      storageGbMonth: options.dryRun ? dryRunGb : uploadedGb,
    },
    [
      "Projected execute cost treats each would-upload object as new Standard storage for one GB-month, so replacement uploads are intentionally conservative.",
      "R2 egress is free; this estimate excludes any non-Cloudflare source-side costs.",
    ],
  );

  const report: PublishR2Report = {
    schemaVersion: 1,
    month: options.month,
    bucket: options.bucket,
    generatedAt: new Date().toISOString(),
    status: counters.failed === 0 ? "pass" : "fail",
    candidateCount: candidates.length,
    uploadedCount: counters.uploaded,
    skippedCount: counters.skipped,
    failedCount: counters.failed,
    dryRunCount: counters.dryRun,
    candidateByteCount: counters.candidateBytes,
    uploadedByteCount: counters.uploadedBytes,
    skippedByteCount: counters.skippedBytes,
    dryRunByteCount: counters.dryRunBytes,
    r2ClassBOperationCount: counters.headOperations,
    cost: { actual: actualCost, projectedExecute: projectedExecuteCost },
    failed: failed.slice().sort((a, b) => a.key.localeCompare(b.key)),
    outputPath: options.outputPath,
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (report.status !== "pass") {
    console.error(
      `publish-r2 ${options.month}: FAIL (${report.failedCount} of ${report.candidateCount} failed). Report: ${relative(process.cwd(), report.outputPath)}`,
    );
  } else {
    console.error(
      `publish-r2 ${options.month}: PASS (uploaded=${report.uploadedCount} skipped=${report.skippedCount}${report.dryRunCount > 0 ? ` dry-run=${report.dryRunCount}` : ""}, projectedExecuteOverageFromZero=$${report.cost.projectedExecute.estimatedOverageUsdFromZero.toFixed(2)}). Report: ${relative(process.cwd(), report.outputPath)}`,
    );
  }
  return report;
}

const monthPattern = /^\d{4}-\d{2}$/;

export default defineCommand({
  path: ["publish", "r2-artifacts"],
  summary:
    "Idempotently upload release artifacts to R2 via the S3-compatible API (HEAD-then-PUT, parallel, resumable).",
  input: {
    options: z.object({
      month: z
        .string()
        .regex(monthPattern, "must be YYYY-MM")
        .describe("Release month, YYYY-MM"),
      bucket: z.string().min(1).describe("R2 bucket name"),
      endpoint: z.string().optional().describe("R2 S3 endpoint (overrides R2_ENDPOINT)"),
      concurrency: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_CONCURRENCY)
        .describe("Parallel uploads"),
      maxAttempts: z.coerce
        .number()
        .int()
        .positive()
        .default(DEFAULT_MAX_ATTEMPTS)
        .describe("Retry attempts per object"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      exportRoot: z
        .string()
        .optional()
        .describe("Override D1 export root directory (defaults to data/exports/d1)"),
      schema: z
        .string()
        .optional()
        .describe("Override D1 schema.sql path"),
      seed: z
        .string()
        .optional()
        .describe("Override D1 seed.sql path"),
      output: z.string().optional().describe("Override report path"),
      dryRun: z.coerce.boolean().default(false).describe("Skip PUTs, report would-uploads"),
      force: z
        .coerce
        .boolean()
        .default(false)
        .describe("Skip HEAD probe and re-upload every candidate"),
    }),
  },
  output: z.object({
    schemaVersion: z.literal(1),
    month: z.string(),
    bucket: z.string(),
    status: z.enum(["pass", "fail"]),
    candidateCount: z.number(),
    uploadedCount: z.number(),
    skippedCount: z.number(),
    failedCount: z.number(),
    dryRunCount: z.number(),
    outputPath: z.string(),
  }).passthrough(),
  async run({ input }) {
    const {
      R2_ACCESS_KEY_ID: accessKeyId = "",
      R2_ENDPOINT: envEndpoint = "",
      R2_SECRET_ACCESS_KEY: secretAccessKey = "",
    } = process.env;
    const endpoint = input.options.endpoint ?? envEndpoint;
    if (!input.options.dryRun) {
      if (endpoint.length === 0) {
        throw new Error("Missing R2 endpoint (pass --endpoint or set R2_ENDPOINT).");
      }
      if (accessKeyId.length === 0 || secretAccessKey.length === 0) {
        throw new Error(
          "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set in the environment.",
        );
      }
    }
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? fromRepoRoot("data/artifacts")
        : fromCliPath(input.options.artifactRoot);
    const exportRoot =
      input.options.exportRoot === undefined
        ? fromRepoRoot("data/exports/d1")
        : fromCliPath(input.options.exportRoot);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "audits", `publish-r2-${input.options.month}.json`)
        : fromCliPath(input.options.output);
    return runPublishR2Artifacts({
      month: input.options.month,
      bucket: input.options.bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
      concurrency: input.options.concurrency,
      maxAttempts: input.options.maxAttempts,
      backoffMsBase: DEFAULT_BACKOFF_MS_BASE,
      prefixes: DEFAULT_PREFIXES,
      manifestDirs: DEFAULT_MANIFEST_DIRS,
      d1SchemaPath:
        input.options.schema === undefined
          ? join(exportRoot, input.options.month, "schema.sql")
          : fromCliPath(input.options.schema),
      d1SeedPath:
        input.options.seed === undefined
          ? join(exportRoot, input.options.month, "seed.sql")
          : fromCliPath(input.options.seed),
      artifactRoot,
      outputPath,
      dryRun: input.options.dryRun,
      force: input.options.force,
    });
  },
});
