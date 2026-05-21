import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type CliOption, parseCliOptions, trueOption } from "../../lib/cli-args.js";
import { fromCliPath } from "../../lib/paths.js";

type PullGtfsRtR2RunArgs = {
  bucket?: string;
  runId?: string;
  manifestList?: string;
  output?: string;
  endpoint?: string;
  concurrency?: number;
  execute?: boolean;
  accountId?: string;
};

type MirrorTask = {
  manifestKey: string;
  inferredRawKey: string;
};

type DownloadResult = {
  key: string;
  status: "downloaded" | "skipped";
  byteLength: number | null;
};

type PullGtfsRtR2RunResult = {
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
};

function parseArgs(args: string[]): PullGtfsRtR2RunArgs {
  const options: CliOption<PullGtfsRtR2RunArgs>[] = [
    {
      flags: ["--r2", "--bucket"],
      apply: (output, value) => {
        if (value !== undefined) output.bucket = value;
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--manifest-list"],
      apply: (output, value) => {
        if (value !== undefined) output.manifestList = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
    {
      flags: ["--endpoint"],
      apply: (output, value) => {
        if (value !== undefined) output.endpoint = value;
      },
    },
    {
      flags: ["--account-id"],
      apply: (output, value) => {
        if (value !== undefined) output.accountId = value;
      },
    },
    {
      flags: ["--concurrency"],
      apply: (output, value) => {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) output.concurrency = Math.max(1, Math.floor(parsed));
      },
    },
    trueOption(["--execute"], (output) => {
      output.execute = true;
    }),
  ];

  return parseCliOptions(args, {}, options);
}

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

function requireString(value: string | undefined, label: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value;
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function downloadObject(args: {
  s3: Bun.S3Client;
  key: string;
  outputDir: string;
}): Promise<DownloadResult> {
  const outputPath = join(args.outputDir, args.key);
  if (await fileExists(outputPath)) {
    const stat = await Bun.file(outputPath).arrayBuffer();
    return { key: args.key, status: "skipped", byteLength: stat.byteLength };
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const bytes = await args.s3.file(args.key).arrayBuffer();
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
    "bun run import:gtfs-rt-r2-manifests --",
    `--run-id ${runId}`,
    `--manifest-root ${manifestRoot}`,
    `--raw-root ${outputDir}`,
  ].join(" ");
}

export async function pullGtfsRtR2Run(
  args: PullGtfsRtR2RunArgs,
): Promise<PullGtfsRtR2RunResult> {
  const bucket = requireString(args.bucket, "--r2 BUCKET_NAME");
  const runId = requireString(args.runId, "--run-id RUN_ID");
  const manifestList = requireString(args.manifestList, "--manifest-list FILE");
  const outputDir = args.output ?? fromCliPath(`data/raw/r2-mirror/${runId}`);
  const manifestRoot = join(outputDir, "gtfs-rt", "vehicle_positions");
  const tasks = await readManifestTasks(manifestList);
  const execute = args.execute === true;
  const concurrency = args.concurrency ?? 16;
  const nextCommand = nextImportCommand(runId, manifestRoot, outputDir);

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
    };
  }

  const endpoint = args.endpoint ?? process.env["R2_ENDPOINT"];
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

  const s3 = new Bun.S3Client({ bucket, endpoint, accessKeyId, secretAccessKey });
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let completedTasks = 0;
  const queue = [...tasks];

  async function record(result: DownloadResult): Promise<void> {
    if (result.status === "downloaded") downloadedCount += 1;
    else skippedCount += 1;
  }

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task === undefined) return;
      try {
        const manifestResult = await downloadObject({
          s3,
          key: task.manifestKey,
          outputDir,
        });
        await record(manifestResult);
        const rawKey = await resolveRawKey(
          join(outputDir, task.manifestKey),
          task.inferredRawKey,
        );
        const rawResult = await downloadObject({ s3, key: rawKey, outputDir });
        await record(rawResult);
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
  };
}

export async function pullGtfsRtR2RunFromCli(
  args: string[],
): Promise<PullGtfsRtR2RunResult> {
  return pullGtfsRtR2Run(parseArgs(args));
}
