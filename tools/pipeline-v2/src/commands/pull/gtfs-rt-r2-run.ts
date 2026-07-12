import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { type CloudflareCostSummary, estimateR2StandardCost } from "../../lib/cloudflare-costs.ts";
import { fromCliPath } from "../../lib/paths.ts";

type MirrorTask = {
  manifestKey: string;
  inferredRawKey: string;
};

type DownloadResult = {
  key: string;
  status: "downloaded" | "skipped";
  byteLength: number | null;
};

export type PullGtfsRtR2RunResult = {
  runId: string;
  bucket: string;
  outputDir: string;
  manifestRoot: string;
  manifestCount: number;
  downloadedCount: number;
  skippedCount: number;
  failedCount: number;
  dryRun: boolean;
  nextCommand: string;
  cost: {
    actual: CloudflareCostSummary;
    projectedExecute: CloudflareCostSummary;
  };
};

export type R2MirrorClient = {
  fetchObject(key: string): Promise<Uint8Array>;
};

export type PullGtfsRtR2RunInputs = {
  bucket: string;
  runId: string;
  manifestList: string;
  outputDir?: string | undefined;
  endpoint?: string | undefined;
  accountId?: string | undefined;
  concurrency?: number | undefined;
  execute?: boolean | undefined;
  client?: R2MirrorClient | undefined;
};

async function readManifestTasks(path: string): Promise<MirrorTask[]> {
  const text = await Bun.file(path).text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((manifestKey) => ({
      manifestKey,
      inferredRawKey: manifestKey.replace(/\.json$/i, ".pb"),
    }));
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function downloadObject(args: {
  client: R2MirrorClient;
  key: string;
  outputDir: string;
}): Promise<DownloadResult> {
  const outputPath = join(args.outputDir, args.key);
  if (await fileExists(outputPath)) {
    const stat = await Bun.file(outputPath).arrayBuffer();
    return { key: args.key, status: "skipped", byteLength: stat.byteLength };
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const bytes = await args.client.fetchObject(args.key);
  await Bun.write(outputPath, bytes);
  return { key: args.key, status: "downloaded", byteLength: bytes.byteLength };
}

async function resolveRawKey(manifestPath: string, fallback: string): Promise<string> {
  const manifest = (await Bun.file(manifestPath).json()) as { objectKey?: unknown };
  return typeof manifest.objectKey === "string" && manifest.objectKey.length > 0
    ? manifest.objectKey
    : fallback;
}

function nextImportCommand(runId: string, manifestRoot: string, outputDir: string): string {
  return [
    "bun run cli -- import gtfs-rt-r2-manifests",
    `--run-id ${runId}`,
    `--manifest-root ${manifestRoot}`,
    `--raw-root ${outputDir}`,
  ].join(" ");
}

function makeBunR2Client(args: {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}): R2MirrorClient {
  const bunRuntime = (globalThis as unknown as { Bun?: { S3Client: new (cfg: object) => unknown } })
    .Bun;
  if (!bunRuntime?.S3Client) {
    throw new Error("Bun.S3Client is required to mirror; run with `bun run` not `node`.");
  }
  type S3FileLike = { arrayBuffer(): Promise<ArrayBuffer> };
  type S3ClientLike = { file(key: string): S3FileLike };
  const client = new bunRuntime.S3Client({
    bucket: args.bucket,
    endpoint: args.endpoint,
    accessKeyId: args.accessKeyId,
    secretAccessKey: args.secretAccessKey,
  }) as S3ClientLike;
  return {
    async fetchObject(key) {
      return new Uint8Array(await client.file(key).arrayBuffer());
    },
  };
}

export async function runPullGtfsRtR2Run(
  inputs: PullGtfsRtR2RunInputs,
): Promise<PullGtfsRtR2RunResult> {
  const bucket = inputs.bucket;
  const runId = inputs.runId;
  const manifestList = inputs.manifestList;
  const outputDir = inputs.outputDir ?? fromCliPath(`data/raw/r2-mirror/${runId}`);
  const manifestRoot = join(outputDir, "gtfs-rt", "vehicle_positions");
  const tasks = await readManifestTasks(manifestList);
  const execute = inputs.execute === true;
  const concurrency = inputs.concurrency ?? 16;
  const nextCommand = nextImportCommand(runId, manifestRoot, outputDir);
  const projectedDryRunCost = estimateR2StandardCost({ classBOperations: tasks.length * 2 }, [
    "R2 GTFS-RT mirroring reads one manifest object and one protobuf object for each manifest-list entry.",
    "R2 egress is free; this estimate only counts Class B read operations.",
  ]);

  if (!execute) {
    for (const task of tasks.slice(0, 10)) {
      console.log(`dry-run manifest: ${bucket}/${task.manifestKey}`);
      console.log(`dry-run raw: ${bucket}/${task.inferredRawKey}`);
    }
    if (tasks.length > 10) {
      console.log(`dry-run omitted ${tasks.length - 10} additional manifest/raw pairs`);
    }
    console.log(`\nNext pipeline handoff command:\n${nextCommand}`);
    return {
      runId,
      bucket,
      outputDir,
      manifestRoot,
      manifestCount: tasks.length,
      downloadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      dryRun: true,
      nextCommand,
      cost: {
        actual: estimateR2StandardCost({}, [
          "This dry-run does not query Cloudflare because --execute was not passed.",
        ]),
        projectedExecute: projectedDryRunCost,
      },
    };
  }

  let client = inputs.client;
  if (client === undefined) {
    const endpoint = inputs.endpoint ?? process.env["R2_ENDPOINT"];
    const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
    if (endpoint === undefined || endpoint.trim().length === 0) {
      throw new Error("Missing R2 endpoint (pass --endpoint or set R2_ENDPOINT).");
    }
    if (
      accessKeyId === undefined ||
      accessKeyId.trim().length === 0 ||
      secretAccessKey === undefined ||
      secretAccessKey.trim().length === 0
    ) {
      throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set in the environment.");
    }
    client = makeBunR2Client({ bucket, endpoint, accessKeyId, secretAccessKey });
  }
  if (client === undefined) throw new Error("R2 client could not be initialized.");
  const r2Client = client;

  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let completedTasks = 0;
  const queue = [...tasks];

  function record(result: DownloadResult): void {
    if (result.status === "downloaded") downloadedCount += 1;
    else skippedCount += 1;
  }

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task === undefined) return;
      try {
        const manifestResult = await downloadObject({
          client: r2Client,
          key: task.manifestKey,
          outputDir,
        });
        record(manifestResult);
        const rawKey = await resolveRawKey(join(outputDir, task.manifestKey), task.inferredRawKey);
        const rawResult = await downloadObject({ client: r2Client, key: rawKey, outputDir });
        record(rawResult);
      } catch (error) {
        failedCount += 1;
        console.error(
          `pull-gtfs-rt-r2-run: failed ${task.manifestKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        completedTasks += 1;
        if (completedTasks % 100 === 0 || completedTasks === tasks.length) {
          console.log(
            `pull-gtfs-rt-r2-run: ${completedTasks}/${tasks.length} manifests (downloaded=${downloadedCount} skipped=${skippedCount} failed=${failedCount})`,
          );
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  console.log(`\nNext pipeline handoff command:\n${nextCommand}`);
  const actualCost = estimateR2StandardCost({ classBOperations: downloadedCount }, [
    "Existing local mirror files are skipped before contacting R2, so skipped objects are not counted as Class B reads.",
    "R2 egress is free; this estimate only counts Class B read operations.",
  ]);

  return {
    runId,
    bucket,
    outputDir,
    manifestRoot,
    manifestCount: tasks.length,
    downloadedCount,
    skippedCount,
    failedCount,
    dryRun: false,
    nextCommand,
    cost: { actual: actualCost, projectedExecute: actualCost },
  };
}

export default defineCommand({
  path: ["pull", "gtfs-rt-r2-run"],
  summary: "Mirror GTFS-RT manifest + raw R2 objects to local disk for a stable run.",
  input: {
    options: Schema.Struct({
      bucket: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "R2 bucket name (alias for --r2)",
      }),
      runId: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Stable run identifier",
      }),
      manifestList: Schema.String.check(Schema.isMinLength(1)).annotate({
        description: "Path to manifest-list text file",
      }),
      output: Schema.optionalKey(Schema.String).annotate({
        description: "Override output directory",
      }),
      endpoint: Schema.optionalKey(Schema.String).annotate({
        description: "R2 S3 endpoint (overrides R2_ENDPOINT)",
      }),
      accountId: Schema.optionalKey(Schema.String).annotate({
        description: "Cloudflare account ID (informational)",
      }),
      concurrency: arg
        .positiveInt()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(16)))
        .annotate({ description: "Parallel mirror workers" }),
      execute: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Mirror objects (default dry-run)" }),
    }),
  },
  output: Schema.Struct({
    runId: Schema.String,
    bucket: Schema.String,
    outputDir: Schema.String,
    manifestRoot: Schema.String,
    manifestCount: Schema.Number,
    downloadedCount: Schema.Number,
    skippedCount: Schema.Number,
    failedCount: Schema.Number,
    dryRun: Schema.Boolean,
    nextCommand: Schema.String,
    cost: Schema.Struct({
      actual: Schema.Unknown,
      projectedExecute: Schema.Unknown,
    }),
  }),
  async run({ input }) {
    return runPullGtfsRtR2Run({
      bucket: input.options.bucket,
      runId: input.options.runId,
      manifestList: fromCliPath(input.options.manifestList),
      outputDir: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
      endpoint: input.options.endpoint,
      accountId: input.options.accountId,
      concurrency: input.options.concurrency,
      execute: input.options.execute,
    });
  },
});
