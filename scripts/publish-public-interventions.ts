import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { Glob } from "bun";
import { decodeStrict } from "../packages/domain/src/decode.ts";
import {
  PublicInterventionEpisodesArtifactSchema,
  PublicRouteInterventionHistoryArtifactSchema,
} from "../packages/domain/src/studio/public-intervention-episodes.ts";

const artifactRoot = join(import.meta.dir, "..", "data", "artifacts");
const publicArtifactPath = join(
  artifactRoot,
  "studio",
  "v2",
  "interventions",
  "public-episodes.json",
);
const routeArtifactRoot = join(artifactRoot, "studio", "v2", "routes");
const execute = process.argv.includes("--execute");
const bucket = optionValue("--bucket") ?? "bus-priority-artifacts";
const concurrency = Number(optionValue("--concurrency") ?? "16");

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error("--concurrency must be an integer from 1 through 32.");
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const endpoint = process.env.R2_ENDPOINT;
if (!accessKeyId || !secretAccessKey || !endpoint) {
  throw new Error("R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are required.");
}

type S3FileLike = {
  stat(): Promise<{ size: number; etag?: string } | undefined>;
  write(data: Uint8Array, options: { type: string }): Promise<number>;
};
type S3ClientLike = {
  file(key: string): S3FileLike;
};
const bunRuntime = (
  globalThis as unknown as {
    Bun?: { S3Client: new (config: object) => S3ClientLike };
  }
).Bun;
if (!bunRuntime?.S3Client) {
  throw new Error("Bun.S3Client is required.");
}
const client = new bunRuntime.S3Client({
  accessKeyId,
  secretAccessKey,
  endpoint,
  bucket,
  region: "auto",
});

type Candidate = {
  key: string;
  bytes: Uint8Array;
  md5: string;
};

const publicArtifact = decodeStrict(PublicInterventionEpisodesArtifactSchema)(
  await Bun.file(publicArtifactPath).json(),
);
const releaseId = publicArtifact.release.releaseId;
const expectedRouteSlugs = new Set(
  publicArtifact.episodes.flatMap((episode) => episode.routes.map((route) => route.slug)),
);

const routeCandidates: Candidate[] = [];
const seenRouteSlugs = new Set<string>();
const glob = new Glob("*/intervention-history.json");
for await (const localRelativePath of glob.scan({ cwd: routeArtifactRoot, onlyFiles: true })) {
  const path = join(routeArtifactRoot, localRelativePath);
  const artifact = decodeStrict(PublicRouteInterventionHistoryArtifactSchema)(
    await Bun.file(path).json(),
  );
  if (artifact.releaseId !== releaseId) {
    throw new Error(
      `${localRelativePath} belongs to ${artifact.releaseId}, expected ${releaseId}.`,
    );
  }
  if (!expectedRouteSlugs.has(artifact.route.slug)) {
    throw new Error(`${localRelativePath} is not referenced by the public episode index.`);
  }
  if (seenRouteSlugs.has(artifact.route.slug)) {
    throw new Error(`Duplicate route history for ${artifact.route.slug}.`);
  }
  seenRouteSlugs.add(artifact.route.slug);
  routeCandidates.push(await candidateFor(path));
}

const missingRouteSlugs = [...expectedRouteSlugs].filter((slug) => !seenRouteSlugs.has(slug));
if (missingRouteSlugs.length > 0) {
  throw new Error(
    `Missing ${missingRouteSlugs.length} route histories: ${missingRouteSlugs.slice(0, 8).join(", ")}.`,
  );
}

routeCandidates.sort((left, right) => left.key.localeCompare(right.key));
// The network artifact is the activation index and is deliberately published last.
const candidates = [...routeCandidates, await candidateFor(publicArtifactPath)];
if (candidates.length !== expectedRouteSlugs.size + 1) {
  throw new Error(
    `Candidate count ${candidates.length} does not match ${expectedRouteSlugs.size} routes plus one index.`,
  );
}
if (candidates.some((candidate) => candidate.key.includes("quality/"))) {
  throw new Error("Operator quality artifacts are not eligible for public publication.");
}

let uploadedCount = 0;
let skippedCount = 0;
let dryRunCount = 0;
const failures: Array<{ key: string; error: string }> = [];

// Keep the activation index out of the parallel batch so every route body is
// verified before the consumer-visible index can point at the release.
await forEachConcurrent(routeCandidates, concurrency, publishOne);
if (failures.length === 0) {
  await publishOne(candidates.at(-1) as Candidate);
}

const report = {
  status: failures.length === 0 ? "pass" : "fail",
  mode: execute ? "execute" : "dry-run",
  bucket,
  releaseId,
  candidateCount: candidates.length,
  routeHistoryCount: routeCandidates.length,
  uploadedCount,
  skippedCount,
  dryRunCount,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

async function publishOne(candidate: Candidate): Promise<void> {
  try {
    const existing = await remoteStat(candidate.key);
    if (
      existing !== null &&
      existing.size === candidate.bytes.byteLength &&
      normalizeEtag(existing.etag) === candidate.md5
    ) {
      skippedCount += 1;
      return;
    }
    if (!execute) {
      dryRunCount += 1;
      return;
    }
    await client.file(candidate.key).write(candidate.bytes, {
      type: "application/json",
    });
    const verified = await remoteStat(candidate.key);
    if (
      verified === null ||
      verified.size !== candidate.bytes.byteLength ||
      normalizeEtag(verified.etag) !== candidate.md5
    ) {
      throw new Error("post-upload size or ETag verification failed");
    }
    uploadedCount += 1;
  } catch (error) {
    failures.push({
      key: candidate.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function remoteStat(key: string): Promise<{ size: number; etag: string } | null> {
  try {
    const stat = await client.file(key).stat();
    if (!stat) return null;
    return { size: stat.size, etag: stat.etag ?? "" };
  } catch (error) {
    const details = error as { status?: number; code?: string };
    if (details.status === 404 || details.code === "NoSuchKey" || details.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function candidateFor(path: string): Promise<Candidate> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  return {
    key: relative(artifactRoot, path).split(sep).join("/"),
    bytes,
    md5: createHash("md5").update(bytes).digest("hex"),
  };
}

async function forEachConcurrent<T>(
  values: readonly T[],
  workerCount: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(workerCount, values.length) }, async () => {
      while (cursor < values.length) {
        const value = values[cursor];
        cursor += 1;
        if (value !== undefined) await work(value);
      }
    }),
  );
}

function normalizeEtag(etag: string): string {
  return etag.replace(/^"|"$/gu, "").toLowerCase();
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}
