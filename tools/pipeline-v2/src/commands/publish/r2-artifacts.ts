import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { isMapArtifactManifest, mapArtifactSha256 } from "@bp/analytics/evaluation";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Glob } from "bun";
import { Effect } from "effect";
import { type CloudflareCostSummary, estimateR2StandardCost } from "../../lib/cloudflare-costs.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { verifyMapArtifactManifest } from "../map/artifacts.ts";
import { collectD1ArtifactKeys, collectManifestArtifactKeys } from "./publish-artifact-keys.ts";

const DEFAULT_PREFIXES = ["map", "studio", "source-availability"] as const;
const DEFAULT_MANIFEST_DIRS = ["map"] as const;
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

function contentAddressedSha256(key: string): string | null {
  const filename = key.split("/").at(-1) ?? "";
  const match = /^.+\.([a-f0-9]{64})\.[^.]+$/.exec(filename);
  return match?.[1] ?? null;
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

async function collectCandidates(
  options: PublishR2Options,
  finalMapManifestKey: string | null,
): Promise<UploadItem[]> {
  const governedManifestDirs =
    finalMapManifestKey === null
      ? options.manifestDirs
      : [...new Set([...options.manifestDirs, "map"])];
  const unconstrainedPrefixes =
    finalMapManifestKey === null
      ? options.prefixes
      : options.prefixes.filter(
          (prefix) =>
            !governedManifestDirs.some(
              (manifestDir) => prefix === manifestDir || prefix.startsWith(`${manifestDir}/`),
            ),
        );
  const [manifestKeys, d1Keys, prefixKeys] = await Promise.all([
    collectManifestArtifactKeys({
      artifactRoot: options.artifactRoot,
      manifestDirs: governedManifestDirs,
      month: options.month,
    }),
    collectD1ArtifactKeys({
      month: options.month,
      schemaPath: options.d1SchemaPath,
      seedPath: options.d1SeedPath,
    }),
    collectPrefixKeys(options.artifactRoot, unconstrainedPrefixes),
  ]);
  const declaredManifestKeys = new Set(manifestKeys.keys);
  const d1CandidateKeys =
    finalMapManifestKey === null
      ? d1Keys.keys
      : d1Keys.keys.filter(
          (key) =>
            !governedManifestDirs.some(
              (manifestDir) => key === manifestDir || key.startsWith(`${manifestDir}/`),
            ) || declaredManifestKeys.has(key),
        );
  const merged = new Set<string>([
    ...manifestKeys.keys,
    ...d1CandidateKeys,
    ...prefixKeys,
    ...(finalMapManifestKey === null ? [] : [finalMapManifestKey]),
  ]);
  return [...merged].sort().map((key) => ({ key, localPath: join(options.artifactRoot, key) }));
}

async function assertPublishableMapManifest(options: PublishR2Options): Promise<string | null> {
  const includesMapScope =
    options.manifestDirs.includes("map") ||
    options.prefixes.some((prefix) => prefix === "map" || prefix.startsWith("map/"));
  if (!includesMapScope) return null;
  const path = join(options.artifactRoot, "map", options.month, "manifest.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Map manifest ${path} is required for publication.`);
  }
  const manifestBytes = new Uint8Array(await file.arrayBuffer());
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error(`Map manifest ${path} is invalid JSON.`);
  }
  if (!isMapArtifactManifest(manifest)) {
    throw new Error(`Map manifest ${path} does not satisfy the v2 release contract.`);
  }
  const failures: string[] = [];
  if (manifest.releaseProfile !== "full") failures.push("releaseProfile must be full");
  if (manifest.buildStatus !== "pass") failures.push("buildStatus must be pass");
  if (manifest.verificationStatus !== "pass") failures.push("verificationStatus must be pass");
  if (manifest.status !== "pass") failures.push("status must be pass");
  if (manifest.coverage.end !== options.month)
    failures.push(`coverage.end must equal ${options.month}`);
  if (manifest.routeFacts.status !== "available") failures.push("routeFacts must be available");
  const expectedRouteIds = manifest.routeUniverse.expectedRouteIds;
  if (!Array.isArray(expectedRouteIds)) {
    failures.push("routeUniverse.expectedRouteIds must be declared");
  } else {
    const verification = await verifyMapArtifactManifest({
      artifactRoot: options.artifactRoot,
      month: options.month,
      expectedRouteIds,
      expectedProfile: "full",
    });
    if (verification.status !== "pass") {
      failures.push(
        `local map verification failed: ${verification.issues
          .slice(0, 3)
          .map((issue) => issue.code)
          .join(", ")}`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Map manifest is not publishable: ${failures.join("; ")}.`);
  }

  const manifestSha256 = mapArtifactSha256(manifestBytes);
  const finalManifestKey = `map/${options.month}/manifest.${manifestSha256}.json`;
  const finalManifestPath = join(options.artifactRoot, finalManifestKey);
  const finalManifestFile = Bun.file(finalManifestPath);
  if (!(await finalManifestFile.exists())) {
    throw new Error(`Final content-addressed map manifest ${finalManifestPath} is missing.`);
  }
  const finalBytes = new Uint8Array(await finalManifestFile.arrayBuffer());
  if (
    finalBytes.byteLength !== manifestBytes.byteLength ||
    mapArtifactSha256(finalBytes) !== manifestSha256
  ) {
    throw new Error(
      `Final content-addressed map manifest ${finalManifestPath} does not match ${path}.`,
    );
  }
  return finalManifestKey;
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

  const filenameSha256 = contentAddressedSha256(item.key);
  if (filenameSha256 !== null) {
    const actualSha256 = createHash("sha256").update(body).digest("hex");
    if (actualSha256 !== filenameSha256) {
      return {
        outcome: "failed",
        error: `content-addressed filename hash mismatch: expected ${filenameSha256}, got ${actualSha256}`,
        byteLength: body.byteLength,
        headOperations: 0,
      };
    }
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
  const finalMapManifestKey = await assertPublishableMapManifest(options);
  const driver =
    options.driver ??
    (options.dryRun && (options.accessKeyId.length === 0 || options.secretAccessKey.length === 0)
      ? makeNoopDriver()
      : makeBunDriver(options));
  const candidates = await collectCandidates(options, finalMapManifestKey);
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
    options: Schema.Struct({
      month: Schema.String.check(
        Schema.isPattern(monthPattern, { message: "must be YYYY-MM" }),
      ).annotate({
        description: "Release month, YYYY-MM",
      }),
      bucket: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "R2 bucket name",
      }),
      endpoint: Schema.optionalKey(Schema.String).annotate({
        description: "R2 S3 endpoint (overrides R2_ENDPOINT)",
      }),
      concurrency: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThan(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_CONCURRENCY)))
        .annotate({ description: "Parallel uploads" }),
      maxAttempts: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThan(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_MAX_ATTEMPTS)))
        .annotate({ description: "Retry attempts per object" }),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Override artifact root directory",
      }),
      exportRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Override D1 export root directory (defaults to data/exports/d1)",
      }),
      schema: Schema.optionalKey(Schema.String).annotate({
        description: "Override D1 schema.sql path",
      }),
      seed: Schema.optionalKey(Schema.String).annotate({
        description: "Override D1 seed.sql path",
      }),
      output: Schema.optionalKey(Schema.String).annotate({ description: "Override report path" }),
      dryRun: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Skip PUTs, report would-uploads" }),
      force: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Skip HEAD probe and re-upload every candidate" }),
    }),
  },
  output: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    month: Schema.String,
    bucket: Schema.String,
    status: Schema.Literals(["pass", "fail"]),
    candidateCount: Schema.Number,
    uploadedCount: Schema.Number,
    skippedCount: Schema.Number,
    failedCount: Schema.Number,
    dryRunCount: Schema.Number,
    outputPath: Schema.String,
  }),
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
