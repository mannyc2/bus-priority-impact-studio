import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { isSafeArtifactKey } from "@bp/analytics/evaluation";
import { decodeStrict } from "@bp/domain/decode";
import {
  type ServingCandidateManifestV1,
  ServingCandidateManifestV1Schema,
} from "@bp/domain/studio/serving-release";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { type CloudflareCostSummary, estimateR2StandardCost } from "../../lib/cloudflare-costs.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const DEFAULT_CONCURRENCY = 16;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS_BASE = 5_000;

export type S3Driver = {
  tracksRemoteCosts?: boolean;
  get(key: string): Promise<Uint8Array | null>;
  putIfAbsent(key: string, body: Uint8Array, contentType: string): Promise<boolean>;
};

export type PublishR2Options = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  concurrency: number;
  maxAttempts: number;
  backoffMsBase: number;
  candidateManifestPath: string;
  artifactRoot: string;
  outputPath: string;
  dryRun: boolean;
  driver?: S3Driver | undefined;
};

type UploadItem = ServingCandidateManifestV1["artifacts"][number] & { localPath: string };
type ItemOutcome = "uploaded" | "skipped" | "failed" | "dry-run";

type ArtifactFamilyReport = {
  candidateCount: number;
  candidateByteCount: number;
  uploadedCount: number;
  uploadedByteCount: number;
  reusedCount: number;
  reusedByteCount: number;
};

export type PublishR2Report = {
  schemaVersion: 2;
  candidateId: string;
  candidateManifestPath: string;
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
  families: Record<string, ArtifactFamilyReport>;
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
  getOperations: number;
};

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function artifactFamily(logicalId: string): string {
  return logicalId.split("/", 1)[0] || "other";
}

async function readCandidateManifest(path: string): Promise<ServingCandidateManifestV1> {
  let raw: unknown;
  try {
    raw = JSON.parse(await Bun.file(path).text());
  } catch (error) {
    throw new Error(`Candidate manifest ${path} is not valid JSON: ${(error as Error).message}`);
  }
  return decodeStrict(ServingCandidateManifestV1Schema)(raw);
}

async function collectCandidates(options: PublishR2Options): Promise<{
  manifest: ServingCandidateManifestV1;
  items: UploadItem[];
}> {
  const manifest = await readCandidateManifest(options.candidateManifestPath);
  const items = manifest.artifacts.map((artifact) => {
    if (!isSafeArtifactKey(artifact.key)) {
      throw new Error(`Candidate artifact key ${JSON.stringify(artifact.key)} is unsafe.`);
    }
    return { ...artifact, localPath: join(options.artifactRoot, artifact.key) };
  });
  return {
    manifest,
    items: items.toSorted((left, right) => left.logicalId.localeCompare(right.logicalId)),
  };
}

function makeBunDriver(options: PublishR2Options): S3Driver {
  const bunRuntime = (globalThis as unknown as { Bun?: { S3Client: new (cfg: object) => unknown } })
    .Bun;
  if (!bunRuntime?.S3Client) {
    throw new Error("Bun.S3Client is required to publish; run with `bun run` not `node`.");
  }
  type S3FileLike = {
    arrayBuffer(): Promise<ArrayBuffer>;
    presign(opts: { method: "PUT"; expiresIn: number; type: string }): string;
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
    async get(key) {
      try {
        return new Uint8Array(await client.file(key).arrayBuffer());
      } catch (error) {
        const status = (error as { status?: number; code?: string })?.status;
        const code = (error as { status?: number; code?: string })?.code;
        if (status === 404 || code === "NoSuchKey" || code === "ENOENT") return null;
        throw error;
      }
    },
    async putIfAbsent(key, body, contentType) {
      const url = client.file(key).presign({
        method: "PUT",
        expiresIn: 300,
        type: contentType,
      });
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "If-None-Match": "*",
        },
        body: new Blob([Uint8Array.from(body)]),
      });
      if (response.status === 412) return false;
      if (!response.ok) {
        throw new Error(`conditional R2 PUT failed with HTTP ${response.status}`);
      }
      return true;
    },
  };
}

function makeNoopDriver(): S3Driver {
  return {
    tracksRemoteCosts: false,
    async get() {
      return null;
    },
    async putIfAbsent() {
      throw new Error("noop driver cannot put; this is a dry-run-only stub");
    },
  };
}

async function uploadOne(
  item: UploadItem,
  options: PublishR2Options,
  driver: S3Driver,
): Promise<{ outcome: ItemOutcome; error?: string; byteLength: number; getOperations: number }> {
  let body: Uint8Array;
  try {
    body = await readFile(item.localPath);
  } catch (error) {
    return {
      outcome: "failed",
      error: `local read failed: ${(error as Error).message}`,
      byteLength: 0,
      getOperations: 0,
    };
  }
  const localSha256 = sha256(body);
  if (body.byteLength !== item.bytes || localSha256 !== item.sha256) {
    return {
      outcome: "failed",
      error:
        `candidate manifest mismatch: expected ${item.bytes} bytes/${item.sha256}, ` +
        `got ${body.byteLength} bytes/${localSha256}`,
      byteLength: body.byteLength,
      getOperations: 0,
    };
  }

  const getOperations = driver.tracksRemoteCosts === false ? 0 : 1;
  let remote: Uint8Array | null;
  try {
    remote = await driver.get(item.key);
  } catch (error) {
    return {
      outcome: "failed",
      error: `remote GET failed: ${(error as Error).message}`,
      byteLength: body.byteLength,
      getOperations,
    };
  }
  if (remote !== null) {
    const remoteSha256 = sha256(remote);
    if (remote.byteLength !== item.bytes || remoteSha256 !== item.sha256) {
      return {
        outcome: "failed",
        error:
          `immutable object corruption: expected ${item.bytes} bytes/${item.sha256}, ` +
          `got ${remote.byteLength} bytes/${remoteSha256}`,
        byteLength: body.byteLength,
        getOperations,
      };
    }
    return { outcome: "skipped", byteLength: body.byteLength, getOperations };
  }

  if (options.dryRun) {
    return { outcome: "dry-run", byteLength: body.byteLength, getOperations };
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const created = await driver.putIfAbsent(item.key, body, item.mediaType);
      const stored = await driver.get(item.key);
      const verifiedGetOperations = getOperations + (driver.tracksRemoteCosts === false ? 0 : 1);
      if (stored === null || stored.byteLength !== item.bytes || sha256(stored) !== item.sha256) {
        return {
          outcome: "failed",
          error: created
            ? "uploaded artifact failed read-after-write SHA-256 verification"
            : "immutable object won a conditional-upload race with corrupt bytes",
          byteLength: body.byteLength,
          getOperations: verifiedGetOperations,
        };
      }
      return {
        outcome: created ? "uploaded" : "skipped",
        byteLength: body.byteLength,
        getOperations: verifiedGetOperations,
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt === options.maxAttempts) break;
      const backoffMs = attempt * options.backoffMsBase;
      console.error(
        `publish-r2: retrying ${item.key} in ${backoffMs}ms ` +
          `(attempt ${attempt}/${options.maxAttempts}, ${lastError.message})`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  return {
    outcome: "failed",
    error: lastError?.message ?? "unknown",
    byteLength: body.byteLength,
    getOperations,
  };
}

export async function runPublishR2Artifacts(options: PublishR2Options): Promise<PublishR2Report> {
  const { manifest, items } = await collectCandidates(options);
  const driver =
    options.driver ??
    (options.dryRun && (options.accessKeyId.length === 0 || options.secretAccessKey.length === 0)
      ? makeNoopDriver()
      : makeBunDriver(options));
  const counters: Counters = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
    dryRun: 0,
    candidateBytes: 0,
    uploadedBytes: 0,
    skippedBytes: 0,
    dryRunBytes: 0,
    getOperations: 0,
  };
  const failed: Array<{ key: string; error: string }> = [];
  const families = new Map<string, ArtifactFamilyReport>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const item = items[cursor];
      cursor += 1;
      if (item === undefined) return;
      const result = await uploadOne(item, options, driver);
      counters.candidateBytes += result.byteLength;
      counters.getOperations += result.getOperations;
      const family = artifactFamily(item.logicalId);
      const familyReport = families.get(family) ?? {
        candidateCount: 0,
        candidateByteCount: 0,
        uploadedCount: 0,
        uploadedByteCount: 0,
        reusedCount: 0,
        reusedByteCount: 0,
      };
      familyReport.candidateCount += 1;
      familyReport.candidateByteCount += result.byteLength;
      switch (result.outcome) {
        case "uploaded":
          counters.uploaded += 1;
          counters.uploadedBytes += result.byteLength;
          familyReport.uploadedCount += 1;
          familyReport.uploadedByteCount += result.byteLength;
          break;
        case "skipped":
          counters.skipped += 1;
          counters.skippedBytes += result.byteLength;
          familyReport.reusedCount += 1;
          familyReport.reusedByteCount += result.byteLength;
          break;
        case "dry-run":
          counters.dryRun += 1;
          counters.dryRunBytes += result.byteLength;
          break;
        case "failed":
          counters.failed += 1;
          failed.push({ key: item.key, error: result.error ?? "unknown" });
          break;
      }
      families.set(family, familyReport);
    }
  };

  const workerCount = Math.min(options.concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const uploadedGb = counters.uploadedBytes / 1024 ** 3;
  const dryRunGb = counters.dryRunBytes / 1024 ** 3;
  const actualCost = estimateR2StandardCost(
    {
      classAOperations: options.dryRun ? 0 : counters.uploaded,
      classBOperations: counters.getOperations,
      storageGbMonth: options.dryRun ? 0 : uploadedGb,
    },
    ["Verified reuse performs a full GET and SHA-256 comparison for every existing object."],
  );
  const projectedExecuteCost = estimateR2StandardCost(
    {
      classAOperations: options.dryRun ? counters.dryRun : counters.uploaded,
      classBOperations: counters.getOperations,
      storageGbMonth: options.dryRun ? dryRunGb : uploadedGb,
    },
    ["Only objects absent from R2 are eligible for a content PUT."],
  );
  const report: PublishR2Report = {
    schemaVersion: 2,
    candidateId: manifest.candidateId,
    candidateManifestPath: options.candidateManifestPath,
    bucket: options.bucket,
    generatedAt: new Date().toISOString(),
    status: counters.failed === 0 ? "pass" : "fail",
    candidateCount: items.length,
    uploadedCount: counters.uploaded,
    skippedCount: counters.skipped,
    failedCount: counters.failed,
    dryRunCount: counters.dryRun,
    candidateByteCount: counters.candidateBytes,
    uploadedByteCount: counters.uploadedBytes,
    skippedByteCount: counters.skippedBytes,
    dryRunByteCount: counters.dryRunBytes,
    r2ClassBOperationCount: counters.getOperations,
    families: Object.fromEntries(
      [...families.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    cost: { actual: actualCost, projectedExecute: projectedExecuteCost },
    failed: failed.toSorted((left, right) => left.key.localeCompare(right.key)),
    outputPath: options.outputPath,
  };

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function runPublishR2ArtifactsCommand(
  options: PublishR2Options,
): Promise<PublishR2Report> {
  const report = await runPublishR2Artifacts(options);
  if (report.status === "fail") {
    throw new Error(
      `R2 artifact publication failed for ${report.failedCount} of ${report.candidateCount} ` +
        `candidate objects; see ${report.outputPath}.`,
    );
  }
  return report;
}

export default defineCommand({
  path: ["publish", "r2-artifacts"],
  summary: "Upload only immutable objects declared by a serving candidate manifest.",
  input: {
    options: Schema.Struct({
      candidateManifest: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Strict Plan 098 serving candidate manifest",
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
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_CONCURRENCY))),
      maxAttempts: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThan(0))
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(DEFAULT_MAX_ATTEMPTS))),
      artifactRoot: Schema.optionalKey(Schema.String).annotate({
        description: "Root containing the manifest-declared physical keys",
      }),
      output: Schema.optionalKey(Schema.String).annotate({ description: "Override report path" }),
      dryRun: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({
          description: "Verify existing objects and report absent objects without PUTs",
        }),
    }),
  },
  output: Schema.Struct({
    schemaVersion: Schema.Literal(2),
    candidateId: Schema.String,
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
        throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set.");
      }
    }
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? fromRepoRoot("data/artifacts")
        : fromCliPath(input.options.artifactRoot);
    const candidateManifestPath = fromCliPath(input.options.candidateManifest);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "audits", "publish-r2-candidate.json")
        : fromCliPath(input.options.output);
    const report = await runPublishR2ArtifactsCommand({
      bucket: input.options.bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
      concurrency: input.options.concurrency,
      maxAttempts: input.options.maxAttempts,
      backoffMsBase: DEFAULT_BACKOFF_MS_BASE,
      candidateManifestPath,
      artifactRoot,
      outputPath,
      dryRun: input.options.dryRun,
    });
    console.error(
      `publish-r2 ${report.candidateId}: ${report.status.toUpperCase()} ` +
        `(uploaded=${report.uploadedCount} reused=${report.skippedCount} ` +
        `dry-run=${report.dryRunCount}). Report: ${relative(process.cwd(), outputPath)}`,
    );
    return report;
  },
});
