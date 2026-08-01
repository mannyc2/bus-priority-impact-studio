import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { D1_CANDIDATE_PROJECTION_TABLES } from "@bp/db/d1";
import { Plan097RecoveryArtifactManifestSchema } from "@bp/db/recovery/plan097/artifacts";
import { decodeStrict } from "@bp/domain/decode";
import { canonicalServingJson } from "@bp/domain/studio/serving-release";
import { plan106ArchiveRelativePath } from "../src/lib/plan106-release-input.ts";
import {
  buildServingCandidateFromDescriptors,
  type ServingCandidateArtifactDescriptor,
  servingSha256,
} from "../src/lib/serving-candidate.ts";

type Plan106ArtifactMap = {
  artifactKind: "bp.studio.public_intervention_candidate_map.v1";
  schemaVersion: 1;
  candidateId: string;
  entries: Array<{
    role: "operator_conformance" | "public_global_episodes" | "public_route_history";
    logicalKey: string;
    physicalKey: string;
    schemaId: string;
    mediaType: string;
    sha256: string;
  }>;
};

type Args = {
  d1Export: string;
  baselineManifest: string;
  plan106ArtifactMap: string;
  artifactRoot: string;
  sourceCommit: string;
  output: string;
};

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Plan 098 candidate builder requires --name value arguments.");
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`Missing ${key}.`);
    return value;
  };
  const sourceCommit = required("--source-commit");
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("Invalid --source-commit.");
  return {
    d1Export: required("--d1-export"),
    baselineManifest: required("--baseline-manifest"),
    plan106ArtifactMap: required("--plan106-artifact-map"),
    artifactRoot: required("--artifact-root"),
    sourceCommit,
    output: required("--output"),
  };
}

function quotedIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error(`Unsafe SQLite identifier ${value}.`);
  return `"${value}"`;
}

type ProjectionInventory = {
  projectionSha256: string;
  rowCounts: Record<string, number>;
  exactIdentityProjectionSha256: string;
  exactIdentityRouteCount: number;
};

function projectionInventory(database: Database, coverageEnd: string): ProjectionInventory {
  const projection = createHash("sha256");
  const exact = createHash("sha256");
  const rowCounts: Record<string, number> = {};
  const exactTables = new Set([
    "exact_route_identity_release",
    "route_catalog",
    "route_catalog_trip_type",
    "route_catalog_type",
  ]);
  for (const table of D1_CANDIDATE_PROJECTION_TABLES) {
    const columns = database.query(`PRAGMA table_info(${quotedIdentifier(table)})`).all() as Array<{
      name: string;
      pk: number;
    }>;
    if (columns.length === 0) throw new Error(`D1 export is missing ${table}.`);
    const orderColumns = columns
      .filter((column) => column.pk > 0)
      .toSorted((left, right) => left.pk - right.pk);
    const order = (orderColumns.length === 0 ? columns : orderColumns)
      .map((column) => quotedIdentifier(column.name))
      .join(", ");
    const mixedReviewedFilter =
      table === "route_month_source_status" || table === "route_observed_reliability_summary"
        ? " WHERE month <= ?"
        : "";
    const statement = database.query(
      `SELECT * FROM ${quotedIdentifier(table)}${mixedReviewedFilter} ORDER BY ${order}`,
    );
    const rows = (
      mixedReviewedFilter.length === 0 ? statement.all() : statement.all(coverageEnd)
    ) as Array<Record<string, unknown>>;
    rowCounts[table] = rows.length;
    for (const row of rows) {
      const line = `${canonicalServingJson({ table, row })}\n`;
      projection.update(line);
      if (exactTables.has(table)) exact.update(line);
    }
  }
  const exactIdentityRouteCount = Object.entries(rowCounts).find(
    ([table]) => table === "route_catalog",
  )?.[1];
  if (exactIdentityRouteCount === undefined) throw new Error("route_catalog count is absent.");
  return {
    projectionSha256: projection.digest("hex"),
    rowCounts,
    exactIdentityProjectionSha256: exact.digest("hex"),
    exactIdentityRouteCount,
  };
}

function extensionFor(key: string): string {
  const extension = extname(key).slice(1).toLowerCase();
  return /^[a-z0-9]+$/u.test(extension) ? extension : "bin";
}

async function plan106Descriptors(
  map: Plan106ArtifactMap,
  artifactRoot: string,
): Promise<{
  descriptors: ServingCandidateArtifactDescriptor[];
  uploads: Array<ServingCandidateArtifactDescriptor & { sourcePath: string }>;
}> {
  if (
    map.artifactKind !== "bp.studio.public_intervention_candidate_map.v1" ||
    map.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/u.test(map.candidateId)
  ) {
    throw new Error("Plan 106 artifact map identity is invalid.");
  }
  if (map.candidateId !== "b647f0f12a5dc037e0e9776e03c0cf9a4f78081728b7f4470e58e4558e4e77ef") {
    throw new Error("Plan 106 artifact map does not identify the completed candidate.");
  }
  const descriptors: ServingCandidateArtifactDescriptor[] = [];
  const uploads: Array<ServingCandidateArtifactDescriptor & { sourcePath: string }> = [];
  for (const entry of map.entries) {
    if (entry.role === "operator_conformance") continue;
    const sourcePath = join(
      artifactRoot,
      plan106ArchiveRelativePath(map.candidateId, entry.physicalKey),
    );
    const body = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
    const sha256 = servingSha256(body);
    if (sha256 !== entry.sha256) {
      throw new Error(`Plan 106 artifact bytes drifted for ${entry.logicalKey}.`);
    }
    const descriptor = {
      logicalId: entry.logicalKey,
      key: `serving/blobs/sha256/${sha256.slice(0, 2)}/${sha256}.${extensionFor(entry.physicalKey)}`,
      sha256,
      bytes: body.byteLength,
      mediaType: entry.mediaType,
      schemaId: entry.schemaId,
    };
    descriptors.push(descriptor);
    uploads.push({ ...descriptor, sourcePath });
  }
  if (uploads.length !== 189) {
    throw new Error(`Plan 106 public overlay must contain 189 objects, found ${uploads.length}.`);
  }
  const logicalIds = new Set(uploads.map((entry) => entry.logicalId));
  if (logicalIds.size !== uploads.length) throw new Error("Plan 106 overlay has duplicate keys.");
  return { descriptors, uploads };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [d1Sql, baselineRaw, plan106Raw, plan106MapBytes] = await Promise.all([
    Bun.file(args.d1Export).text(),
    Bun.file(args.baselineManifest).json(),
    Bun.file(args.plan106ArtifactMap).json() as Promise<Plan106ArtifactMap>,
    Bun.file(args.plan106ArtifactMap).arrayBuffer(),
  ]);
  const plan106MapBody = new Uint8Array(plan106MapBytes);
  if (
    servingSha256(plan106MapBody) !==
    "403d9d570d42b8284b6c86b0db64d75b14ede3f2b5f67298cf26995b79e684b5"
  ) {
    throw new Error("Plan 106 closed artifact map hash drifted.");
  }
  const database = new Database(":memory:");
  database.exec(d1Sql);
  const coverage = { start: "2023-04", end: "2026-05" } as const;
  const d1 = projectionInventory(database, coverage.end);
  database.close();
  const baseline = decodeStrict(Plan097RecoveryArtifactManifestSchema)(baselineRaw);
  if (baseline.releaseId !== "pub_20260725T164123260Z" || baseline.entries.length !== 3002) {
    throw new Error("Plan 098 baseline is not the completed Plan 097 production cut.");
  }
  const baselineDescriptors = baseline.entries.map(
    (entry): ServingCandidateArtifactDescriptor => ({
      logicalId: entry.logicalKey,
      key: entry.key,
      sha256: entry.sha256,
      bytes: entry.bytes,
      mediaType: entry.mediaType,
      schemaId: entry.schemaId,
    }),
  );
  const plan106 = await plan106Descriptors(plan106Raw, args.artifactRoot);
  const candidateBase = {
    schemaVersion: 1 as const,
    sourceCommit: args.sourceCommit,
    datasets: [
      {
        datasetId: "reviewed-serving",
        grain: "month" as const,
        coverage,
        sourceSnapshotIds: [baseline.releaseId, servingSha256(plan106MapBody)],
      },
    ],
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: d1.projectionSha256,
      rowCounts: d1.rowCounts,
    },
    exactIdentity: {
      projectionSha256: d1.exactIdentityProjectionSha256,
      routeCount: d1.exactIdentityRouteCount,
    },
  };
  const baselineManifestSha256 = servingSha256(
    new Uint8Array(await Bun.file(args.baselineManifest).arrayBuffer()),
  );
  const candidateA = buildServingCandidateFromDescriptors({
    ...candidateBase,
    semanticInputFingerprint: servingSha256(
      canonicalServingJson({ baselineManifestSha256, d1: d1.projectionSha256 }),
    ),
    builderVersions: [{ name: "plan098-plan097-baseline-mirror", version: "1" }],
    artifacts: baselineDescriptors,
  });
  const interventionKey = (key: string) =>
    key === "studio/v2/interventions/public-episodes-v2.json" ||
    /^studio\/v2\/routes\/[a-z0-9-]+\/intervention-history-v2\.json$/u.test(key);
  const candidateBArtifacts = new Map(
    baselineDescriptors
      .filter((artifact) => !interventionKey(artifact.logicalId))
      .map((artifact) => [artifact.logicalId, artifact]),
  );
  for (const artifact of plan106.descriptors) candidateBArtifacts.set(artifact.logicalId, artifact);
  const candidateB = buildServingCandidateFromDescriptors({
    ...candidateBase,
    semanticInputFingerprint: servingSha256(
      canonicalServingJson({
        baselineManifestSha256,
        d1: d1.projectionSha256,
        plan106CandidateId: plan106Raw.candidateId,
        plan106ArtifactMapSha256: servingSha256(plan106MapBody),
      }),
    ),
    builderVersions: [
      { name: "plan098-plan097-baseline-mirror", version: "1" },
      { name: "plan106-resolved-transit-consumer", version: "1" },
    ],
    artifacts: [...candidateBArtifacts.values()],
  });
  await mkdir(args.output, { recursive: true });
  const write = (name: string, value: string | Uint8Array) =>
    Bun.write(join(args.output, name), value);
  await Promise.all([
    write("candidate-a.manifest.json", candidateA.manifestBytes),
    write("candidate-b.manifest.json", candidateB.manifestBytes),
    write(
      "plan106-upload-inventory.json",
      `${canonicalServingJson({ schemaVersion: 1, entries: plan106.uploads })}\n`,
    ),
    write(
      "stage-plan.json",
      `${canonicalServingJson({
        schemaVersion: 1,
        baselineReleaseId: baseline.releaseId,
        baselineManifestSha256,
        plan106CandidateId: plan106Raw.candidateId,
        candidateA: {
          candidateId: candidateA.manifest.candidateId,
          manifestKey: candidateA.manifestKey,
          manifestSha256: candidateA.manifestSha256,
          artifactCount: candidateA.manifest.artifacts.length,
        },
        candidateB: {
          candidateId: candidateB.manifest.candidateId,
          manifestKey: candidateB.manifestKey,
          manifestSha256: candidateB.manifestSha256,
          artifactCount: candidateB.manifest.artifacts.length,
        },
        d1,
      })}\n`,
    ),
  ]);
  console.log(
    JSON.stringify({
      candidateA: candidateA.manifest.candidateId,
      candidateB: candidateB.manifest.candidateId,
      candidateAArtifacts: candidateA.manifest.artifacts.length,
      candidateBArtifacts: candidateB.manifest.artifacts.length,
      overlayUploads: plan106.uploads.length,
      d1RowCount: Object.values(d1.rowCounts).reduce((sum, count) => sum + count, 0),
    }),
  );
}

await main();
