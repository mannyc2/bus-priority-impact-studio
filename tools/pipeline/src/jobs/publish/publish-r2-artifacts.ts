import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { Glob } from "bun";

import { fromRepoRoot } from "../../lib/paths.js";

const DEFAULT_PREFIXES = ["map", "studio", "source-availability", "pipeline-v1"] as const;
const DEFAULT_MANIFEST_DIRS = ["briefs", "evaluations"] as const;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS_BASE = 5_000;

export type S3Driver = {
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
  artifactRoot: string;
  outputPath: string;
  dryRun: boolean;
  force: boolean;
  driver?: S3Driver;
};

type UploadItem = {
  key: string;
  localPath: string;
};

type ItemOutcome = "uploaded" | "skipped" | "failed" | "dry-run";

type Report = {
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
  failed: Array<{ key: string; error: string }>;
  outputPath: string;
};

type Counters = {
  uploaded: number;
  skipped: number;
  failed: number;
  dryRun: number;
};

function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseOptions(args: readonly string[]): PublishR2Options {
  const month = readFlag(args, "--month");
  if (month === undefined || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Missing or invalid --month YYYY-MM.");
  }
  const bucket = readFlag(args, "--bucket");
  if (bucket === undefined) {
    throw new Error("Missing --bucket.");
  }
  const dryRun = args.includes("--dry-run");
  const endpoint = readFlag(args, "--endpoint") ?? process.env["R2_ENDPOINT"] ?? "";
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"] ?? "";
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"] ?? "";
  // Without credentials we can still enumerate candidates for --dry-run, but we
  // cannot HEAD or PUT against R2, so any non-dry-run invocation requires them.
  if (!dryRun) {
    if (endpoint.length === 0) {
      throw new Error("Missing R2 endpoint (pass --endpoint or set R2_ENDPOINT).");
    }
    if (accessKeyId.length === 0 || secretAccessKey.length === 0) {
      throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set in the environment.");
    }
  }
  const concurrency = parsePositiveInteger(
    readFlag(args, "--concurrency"),
    DEFAULT_CONCURRENCY,
    "--concurrency",
  );
  const maxAttempts = parsePositiveInteger(
    readFlag(args, "--max-attempts"),
    DEFAULT_MAX_ATTEMPTS,
    "--max-attempts",
  );
  const artifactRoot = readFlag(args, "--artifact-root") ?? fromRepoRoot("data/artifacts");
  const outputPath =
    readFlag(args, "--output") ?? join(artifactRoot, "audits", `publish-r2-${month}.json`);
  return {
    month,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    concurrency,
    maxAttempts,
    backoffMsBase: DEFAULT_BACKOFF_MS_BASE,
    prefixes: DEFAULT_PREFIXES,
    manifestDirs: DEFAULT_MANIFEST_DIRS,
    artifactRoot,
    outputPath,
    dryRun,
    force: args.includes("--force"),
  };
}

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

async function collectManifestKeys(
  artifactRoot: string,
  manifestDirs: readonly string[],
  month: string,
): Promise<string[]> {
  const keys = new Set<string>();
  for (const dir of manifestDirs) {
    const manifestPath = join(artifactRoot, dir, month, "manifest.json");
    try {
      const body = await readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(body) as { artifacts?: Array<{ artifactKey?: unknown }> };
      for (const entry of parsed.artifacts ?? []) {
        if (typeof entry.artifactKey === "string" && entry.artifactKey.length > 0) {
          keys.add(entry.artifactKey);
        }
      }
    } catch {
      // Missing manifest is allowed; the completeness check enforces presence upstream.
    }
  }
  return [...keys];
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
      const key = `${prefix}/${rel.split(sep).join("/")}`;
      keys.add(key);
    }
  }
  return [...keys];
}

async function collectCandidates(options: PublishR2Options): Promise<UploadItem[]> {
  const [manifestKeys, prefixKeys] = await Promise.all([
    collectManifestKeys(options.artifactRoot, options.manifestDirs, options.month),
    collectPrefixKeys(options.artifactRoot, options.prefixes),
  ]);
  const merged = new Set<string>([...manifestKeys, ...prefixKeys]);
  return [...merged].sort().map((key) => ({ key, localPath: join(options.artifactRoot, key) }));
}

function makeBunDriver(options: PublishR2Options): S3Driver {
  // Lazily reference Bun.S3Client so this module is importable in non-Bun test runners.
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
    async stat(key) {
      try {
        const meta = await client.file(key).stat();
        if (!meta) return null;
        return {
          size: meta.size,
          etag: typeof meta.etag === "string" ? meta.etag : "",
        };
      } catch (err) {
        const status = (err as { status?: number; code?: string })?.status;
        const code = (err as { status?: number; code?: string })?.code;
        if (status === 404 || code === "NoSuchKey" || code === "ENOENT") {
          return null;
        }
        throw err;
      }
    },
    async put(key, body, contentType) {
      await client.file(key).write(body, { type: contentType });
    },
  };
}

async function uploadOne(
  item: UploadItem,
  options: PublishR2Options,
  driver: S3Driver,
): Promise<{ outcome: ItemOutcome; error?: string }> {
  let body: Uint8Array;
  try {
    body = await readFile(item.localPath);
  } catch (err) {
    return { outcome: "failed", error: `local read failed: ${(err as Error).message}` };
  }

  if (!options.force) {
    let remote: Awaited<ReturnType<S3Driver["stat"]>>;
    try {
      remote = await driver.stat(item.key);
    } catch (err) {
      return { outcome: "failed", error: `head failed: ${(err as Error).message}` };
    }
    if (remote && remote.size === body.byteLength) {
      const remoteEtag = normalizeEtag(remote.etag);
      const localMd5 = md5Hex(body);
      if (remoteEtag.length === 0 || remoteEtag === localMd5) {
        return { outcome: "skipped" };
      }
    }
  }

  if (options.dryRun) {
    return { outcome: "dry-run" };
  }

  const contentType = contentTypeFor(item.key);
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      await driver.put(item.key, body, contentType);
      return { outcome: "uploaded" };
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
  return { outcome: "failed", error: lastError?.message ?? "unknown" };
}

function makeNoopDriver(): S3Driver {
  // Used only for --dry-run when credentials are absent: every key looks
  // missing in R2, so the report shows every candidate as "would upload".
  return {
    async stat() {
      return null;
    },
    async put() {
      throw new Error("noop driver cannot put; this is a dry-run-only stub");
    },
  };
}

export async function publishR2Artifacts(options: PublishR2Options): Promise<Report> {
  const driver =
    options.driver ??
    (options.dryRun && (options.accessKeyId.length === 0 || options.secretAccessKey.length === 0)
      ? makeNoopDriver()
      : makeBunDriver(options));
  const candidates = await collectCandidates(options);
  const counters: Counters = { uploaded: 0, skipped: 0, failed: 0, dryRun: 0 };
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
      switch (result.outcome) {
        case "uploaded":
          counters.uploaded += 1;
          break;
        case "skipped":
          counters.skipped += 1;
          break;
        case "dry-run":
          counters.dryRun += 1;
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

  const report: Report = {
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
    failed: failed.slice().sort((a, b) => a.key.localeCompare(b.key)),
    outputPath: options.outputPath,
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);

  return report;
}

export async function publishR2ArtifactsFromCli(args: string[]): Promise<Report> {
  const options = parseOptions(args);
  const report = await publishR2Artifacts(options);
  if (report.status !== "pass") {
    console.error(
      `publish-r2 ${options.month}: FAIL (${report.failedCount} of ${report.candidateCount} failed). Report: ${relative(process.cwd(), report.outputPath)}`,
    );
    process.exitCode = 1;
  } else {
    console.error(
      `publish-r2 ${options.month}: PASS (uploaded=${report.uploadedCount} skipped=${report.skippedCount}${report.dryRunCount > 0 ? ` dry-run=${report.dryRunCount}` : ""}). Report: ${relative(process.cwd(), report.outputPath)}`,
    );
  }
  return report;
}
